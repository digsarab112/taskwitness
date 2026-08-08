import type { FileChange, Requirement } from '../domain/schemas.js';
import { redactSecrets } from '../security/redact.js';
import {
  isConfigurationFile,
  isDependencyManifest,
  isDocumentationFile,
  isSensitivePath,
  isTestFile,
  matchesIgnoredPath,
} from './paths.js';

export type ClassificationOptions = {
  requirements: readonly Requirement[];
  task: string;
  sensitivePaths: readonly string[];
  ignoredPaths: readonly string[];
};

export function classifyChanges(
  changes: readonly FileChange[],
  options: ClassificationOptions,
): FileChange[] {
  const contractKeywords = new Set([
    ...tokenize(options.task),
    ...options.requirements.flatMap((requirement) => requirement.keywords),
  ]);

  return changes
    .filter((change) => !matchesIgnoredPath(change.path, options.ignoredPaths))
    .map((change) => {
      const redaction = redactSecrets(change.patch);
      const cleanChange = { ...change, patch: redaction.text };
      const testFile =
        isTestFile(change.path) ||
        (change.oldPath !== undefined && isTestFile(change.oldPath));
      const dependencyFile = isDependencyManifest(change.path);
      const sensitive = isSensitivePath(change.path, options.sensitivePaths);
      const relation = relationshipScore(cleanChange, contractKeywords);
      const weakening = testFile ? null : detectHighRiskWeakening(cleanChange.patch);

      if (weakening !== null) {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive: true,
          classification: 'HIGH_RISK_OUT_OF_SCOPE' as const,
          classificationReason: weakening,
        };
      }
      if (testFile) {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive,
          classification: 'SUPPORTING' as const,
          classificationReason:
            'Test changes can support the task, but pre-existing test edits receive a separate integrity warning.',
        };
      }
      if (sensitive && relation < 0.14) {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive,
          classification: 'HIGH_RISK_OUT_OF_SCOPE' as const,
          classificationReason:
            'This sensitive file has no strong lexical relationship to the approved task.',
        };
      }
      if (relation >= 0.24) {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive,
          classification: 'EXPECTED' as const,
          classificationReason:
            'The file or patch is directly related to Task Contract terms.',
        };
      }
      if (dependencyFile || isConfigurationFile(change.path)) {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive,
          classification: 'SUPPORTING' as const,
          classificationReason:
            'Tests, dependencies, or configuration can reasonably support the requested work.',
        };
      }
      if (isDocumentationFile(change.path) && change.status !== 'deleted') {
        return {
          ...cleanChange,
          testFile,
          dependencyFile,
          sensitive,
          classification: 'BENEFICIAL' as const,
          classificationReason:
            'This appears to be a low-risk documentation addition or update.',
        };
      }
      return {
        ...cleanChange,
        testFile,
        dependencyFile,
        sensitive,
        classification: 'OUT_OF_SCOPE' as const,
        classificationReason: 'No clear relationship to the approved task was found.',
      };
    });
}

export function relationshipScore(
  change: Pick<FileChange, 'path' | 'patch'>,
  keywords: ReadonlySet<string>,
): number {
  if (keywords.size === 0) return 0;
  const pathTokens = new Set(tokenize(change.path));
  const patchTokens = new Set(tokenize(change.patch.slice(0, 32_000)));
  let weightedMatches = 0;
  let pathMatches = 0;
  let possible = 0;
  for (const keyword of keywords) {
    if (keyword.length < 3) continue;
    possible += 2;
    if (
      pathTokens.has(keyword) ||
      [...pathTokens].some((token) => token.includes(keyword))
    ) {
      weightedMatches += 2;
      pathMatches += 1;
    } else if ([...patchTokens].some((token) => token.includes(keyword))) {
      weightedMatches += 1;
    }
  }
  if (possible === 0) return 0;
  const normalized = weightedMatches / Math.min(possible, 16);
  if (pathMatches >= 2) return Math.max(0.5, normalized);
  if (pathMatches === 1) return Math.max(0.26, normalized);
  return normalized;
}

export function requirementRelation(change: FileChange, requirement: Requirement): number {
  return relationshipScore(change, new Set(requirement.keywords));
}

function tokenize(value: string): string[] {
  return (
    value
      .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
      .toLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu) ?? []
  );
}

function detectHighRiskWeakening(patch: string): string | null {
  const removedMinimums = collectNumbers(
    patch,
    /^-.*(?:password|passphrase).*(?:min(?:imum)?|length).*?(\d+)/gimu,
  );
  const addedMinimums = collectNumbers(
    patch,
    /^\+.*(?:password|passphrase).*(?:min(?:imum)?|length).*?(\d+)/gimu,
  );
  if (
    removedMinimums.length > 0 &&
    addedMinimums.length > 0 &&
    Math.min(...addedMinimums) < Math.max(...removedMinimums)
  ) {
    return `A password minimum appears to decrease from ${Math.max(...removedMinimums)} to ${Math.min(...addedMinimums)}.`;
  }
  if (
    /^-.*(?:secure|verify|validate|authorization|csrf).*\btrue\b/gimu.test(patch) &&
    /^\+.*(?:secure|verify|validate|authorization|csrf).*\bfalse\b/gimu.test(patch)
  ) {
    return 'A security-sensitive control appears to change from enabled to disabled.';
  }
  if (/^\+.*(?:skipAuth|disableAuth|allowAll|permitAll)\s*[:=(]\s*true\b/gimu.test(patch)) {
    return 'The patch appears to enable an authentication or authorization bypass.';
  }
  return null;
}

function collectNumbers(value: string, pattern: RegExp): number[] {
  return [...value.matchAll(pattern)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isFinite(number));
}
