import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LIMITATIONS,
  MAX_TOTAL_PATCH_BYTES,
  REPORT_SCHEMA_VERSION,
  TASKWITNESS_VERSION,
} from '../domain/constants.js';
import type {
  CheckResult,
  EvidenceRecord,
  FileChange,
  Requirement,
  RequirementFinding,
  Session,
  VerificationReport,
  Warning,
} from '../domain/schemas.js';
import { VerificationReportSchema } from '../domain/schemas.js';
import type { TaskWitnessConfig } from '../config/config.js';
import { EvidenceFactory } from '../evidence/factory.js';
import { deriveVerdict, enforceFindingPolicy } from '../evidence/policy.js';
import { GitRepository } from '../git/repository.js';
import { truncateUtf8 } from '../utils/text.js';
import { classifyChanges, requirementRelation } from './classify.js';
import { isTestFile } from './paths.js';

export async function analyzeVerification(
  session: Session,
  repository: GitRepository,
  verificationTree: string,
  verificationChecks: CheckResult[],
  config: TaskWitnessConfig,
): Promise<VerificationReport> {
  let changes = await repository.changesBetween(session.baseline.tree, verificationTree);
  changes = classifyChanges(changes, {
    requirements: session.contract.requirements,
    task: session.contract.task,
    sensitivePaths: config.sensitivePaths,
    ignoredPaths: config.ignoredPaths,
  });
  changes = capTotalPatches(changes);

  const factory = new EvidenceFactory();
  const evidenceByFile = addChangeEvidence(factory, changes);
  const { warnings, compromisedTests, warningEvidence } = detectWarnings(
    factory,
    changes,
    new Set(session.baseline.files.map((file) => file.path)),
  );
  const checkEvidence = addCheckEvidence(factory, verificationChecks, compromisedTests);
  const regression = addRegressionEvidence(
    factory,
    session.baseline.checkResults,
    verificationChecks,
  );
  const scopeIntegrityEvidence = addScopeIntegrityEvidence(
    factory,
    changes,
    verificationChecks,
    regression.hasNewRegression,
  );
  const preExistingTestEvidence = addPreExistingRelevantTestEvidence(
    factory,
    session.contract.requirements,
    session.baseline.files.map((file) => file.path),
    changes,
  );

  const rawFindings = mapRequirements({
    requirements: session.contract.requirements,
    changes,
    evidenceByFile,
    warningEvidence,
    checkEvidence,
    regressionEvidence: regression.records,
    preExistingTestEvidence,
    scopeIntegrityEvidence,
    verificationChecks,
    baselineChecks: session.baseline.checkResults,
    compromisedTests,
  });
  const evidence = factory.all();
  const findings = enforceFindingPolicy(rawFindings, evidence);
  const verdict = deriveVerdict(findings, warnings, regression.hasNewRegression);
  const changeSummary = summarizeChanges(changes);

  const report: VerificationReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: `report-${randomUUID()}`,
    sessionId: session.id,
    task: session.contract.task,
    verdict: verdict.verdict,
    verdictReasons: verdict.reasons,
    requirements: findings,
    changes,
    changeSummary,
    baselineChecks: session.baseline.checkResults,
    verificationChecks,
    evidence,
    warnings,
    generatedAt: new Date().toISOString(),
    taskWitnessVersion: TASKWITNESS_VERSION,
    repository: {
      root: repository.root,
      branchAtStart: session.baseline.branch,
      headAtStart: session.baseline.head,
      headAtVerify: await repository.head(),
      baselineTree: session.baseline.tree,
      verificationTree,
    },
    limitations: [...DEFAULT_LIMITATIONS],
  };
  return VerificationReportSchema.parse(report);
}

function addChangeEvidence(
  factory: EvidenceFactory,
  changes: readonly FileChange[],
): Map<string, EvidenceRecord> {
  const byFile = new Map<string, EvidenceRecord>();
  for (const change of changes) {
    const evidence = factory.add({
      type: change.dependencyFile ? 'dependency_change' : 'file_change',
      source: 'git snapshot diff',
      result:
        change.classification === 'HIGH_RISK_OUT_OF_SCOPE' ? 'warning' : 'informational',
      strength: 1,
      summary: `${change.status} ${change.path}`,
      details: {
        status: change.status,
        additions: change.additions,
        deletions: change.deletions,
        classification: change.classification,
        classificationReason: change.classificationReason,
        patchTruncated: change.patchTruncated,
      },
      relatedFiles: [change.path],
      independent: true,
    });
    byFile.set(change.path, evidence);
  }
  return byFile;
}

function detectWarnings(
  factory: EvidenceFactory,
  changes: readonly FileChange[],
  baselineFiles: ReadonlySet<string>,
): {
  warnings: Warning[];
  compromisedTests: boolean;
  warningEvidence: EvidenceRecord[];
} {
  const warnings: Warning[] = [];
  const warningEvidence: EvidenceRecord[] = [];
  const modifiedTests = changes.filter(
    (change) =>
      change.testFile &&
      (baselineFiles.has(change.path) ||
        (change.oldPath !== undefined && baselineFiles.has(change.oldPath))) &&
      ['modified', 'deleted', 'renamed'].includes(change.status),
  );
  if (modifiedTests.length > 0) {
    const evidence = factory.add({
      type: 'test_integrity',
      source: 'baseline comparison',
      result: 'warning',
      strength: 1,
      summary: `${modifiedTests.length} pre-existing test file(s) were modified, deleted, or renamed.`,
      details: { files: modifiedTests.map((change) => change.path) },
      relatedFiles: modifiedTests.map((change) => change.path),
      independent: false,
    });
    warningEvidence.push(evidence);
    warnings.push({
      severity: 'warning',
      title: 'TEST INTEGRITY WARNING',
      message:
        'Passing results from changed pre-existing tests should not be treated as fully independent proof.',
      evidenceIds: [evidence.id],
      files: modifiedTests.map((change) => change.path),
    });
  }

  const highRisk = changes.filter(
    (change) => change.classification === 'HIGH_RISK_OUT_OF_SCOPE',
  );
  for (const change of highRisk) {
    const evidence = factory.add({
      type: 'security_finding',
      source: 'deterministic scope analysis',
      result: 'warning',
      strength: 1,
      summary: `High-risk unexpected change: ${change.path}`,
      details: { reason: change.classificationReason },
      relatedFiles: [change.path],
      independent: true,
    });
    warningEvidence.push(evidence);
    warnings.push({
      severity: 'high',
      title: 'HIGH-RISK OUT-OF-SCOPE CHANGE',
      message: change.classificationReason,
      evidenceIds: [evidence.id],
      files: [change.path],
    });
  }

  const outOfScope = changes.filter((change) => change.classification === 'OUT_OF_SCOPE');
  if (outOfScope.length > 0) {
    const evidence = factory.add({
      type: 'scope_classification',
      source: 'deterministic scope analysis',
      result: 'warning',
      strength: 1,
      summary: `${outOfScope.length} change(s) have no clear relationship to the task.`,
      details: { files: outOfScope.map((change) => change.path) },
      relatedFiles: outOfScope.map((change) => change.path),
      independent: true,
    });
    warningEvidence.push(evidence);
    warnings.push({
      severity: 'warning',
      title: 'SCOPE REVIEW',
      message: 'Review changes for which TaskWitness found no clear task relationship.',
      evidenceIds: [evidence.id],
      files: outOfScope.map((change) => change.path),
    });
  }
  return { warnings, compromisedTests: modifiedTests.length > 0, warningEvidence };
}

function addCheckEvidence(
  factory: EvidenceFactory,
  checks: readonly CheckResult[],
  compromisedTests: boolean,
): Map<string, EvidenceRecord> {
  const records = new Map<string, EvidenceRecord>();
  for (const check of checks) {
    const record = factory.add({
      type: 'check_result',
      source: check.command,
      result: check.status === 'passed' ? 'passed' : 'failed',
      strength: 2,
      summary: `${check.label}: ${check.status}`,
      details: {
        status: check.status,
        exitCode: check.exitCode,
        durationMs: check.durationMs,
        counts: check.counts ?? {},
        outputTruncated: check.truncated,
      },
      relatedFiles: [],
      independent: !(check.category === 'test' && compromisedTests),
    });
    records.set(check.checkId, record);
  }
  return records;
}

function addRegressionEvidence(
  factory: EvidenceFactory,
  baseline: readonly CheckResult[],
  after: readonly CheckResult[],
): { records: EvidenceRecord[]; hasNewRegression: boolean } {
  const baselineById = new Map(baseline.map((result) => [result.checkId, result]));
  const records: EvidenceRecord[] = [];
  for (const result of after) {
    const before = baselineById.get(result.checkId);
    if (before?.status === 'passed' && result.status !== 'passed') {
      records.push(
        factory.add({
          type: 'baseline_regression',
          source: result.command,
          result: 'failed',
          strength: 2,
          summary: `${result.label} passed before the task and now ${result.status}.`,
          details: { before: before.status, after: result.status },
          relatedFiles: [],
          independent: true,
        }),
      );
    }
  }
  return { records, hasNewRegression: records.length > 0 };
}

function addScopeIntegrityEvidence(
  factory: EvidenceFactory,
  changes: readonly FileChange[],
  checks: readonly CheckResult[],
  hasNewRegression: boolean,
): EvidenceRecord | undefined {
  const unexpectedChanges = changes.filter(
    (change) =>
      change.classification === 'OUT_OF_SCOPE' ||
      change.classification === 'HIGH_RISK_OUT_OF_SCOPE',
  );
  const allChecksPassed =
    checks.length > 0 && checks.every((check) => check.status === 'passed');
  if (
    changes.length === 0 ||
    unexpectedChanges.length > 0 ||
    hasNewRegression ||
    !allChecksPassed
  ) {
    return undefined;
  }

  return factory.add({
    type: 'repository_state',
    source: 'complete baseline-to-verification Git diff and approved checks',
    result: 'passed',
    strength: 2,
    summary: `The complete Git diff contains no unexpected or high-risk change, and all ${checks.length} approved check(s) passed.`,
    details: {
      changedFiles: changes.map((change) => change.path),
      classifications: changes.map((change) => ({
        path: change.path,
        classification: change.classification,
      })),
      passedChecks: checks.map((check) => check.checkId),
      newRegressions: 0,
    },
    relatedFiles: changes.map((change) => change.path),
    independent: true,
  });
}

function addPreExistingRelevantTestEvidence(
  factory: EvidenceFactory,
  requirements: readonly Requirement[],
  baselineFiles: readonly string[],
  changes: readonly FileChange[],
): Map<string, EvidenceRecord> {
  const changedPaths = new Set(
    changes.flatMap((change) => [
      change.path,
      ...(change.oldPath === undefined ? [] : [change.oldPath]),
    ]),
  );
  const result = new Map<string, EvidenceRecord>();
  for (const requirement of requirements) {
    const relevant = baselineFiles.filter((filePath) => {
      if (!isTestFile(filePath) || changedPaths.has(filePath)) return false;
      const lower = filePath.toLowerCase();
      return requirement.keywords.some((keyword) => lower.includes(keyword));
    });
    if (relevant.length === 0) continue;
    result.set(
      requirement.id,
      factory.add({
        type: 'repository_state',
        source: 'baseline and verification snapshots',
        result: 'passed',
        strength: 1,
        summary: `${relevant.length} relevant pre-existing test file(s) remained unchanged.`,
        details: { files: relevant },
        relatedFiles: relevant,
        independent: true,
      }),
    );
  }
  return result;
}

type MappingInput = {
  requirements: readonly Requirement[];
  changes: readonly FileChange[];
  evidenceByFile: ReadonlyMap<string, EvidenceRecord>;
  warningEvidence: readonly EvidenceRecord[];
  checkEvidence: ReadonlyMap<string, EvidenceRecord>;
  regressionEvidence: readonly EvidenceRecord[];
  preExistingTestEvidence: ReadonlyMap<string, EvidenceRecord>;
  scopeIntegrityEvidence: EvidenceRecord | undefined;
  verificationChecks: readonly CheckResult[];
  baselineChecks: readonly CheckResult[];
  compromisedTests: boolean;
};

function mapRequirements(input: MappingInput): RequirementFinding[] {
  const failedChecks = input.verificationChecks.filter(
    (check) => check.status !== 'passed',
  );
  const passedTest = input.verificationChecks.find(
    (check) => check.category === 'test' && check.status === 'passed',
  );
  const baselineTest = input.baselineChecks.find((check) => check.category === 'test');
  return input.requirements.map((requirement) => {
    const relevantChanges = input.changes.filter(
      (change) =>
        requirementRelation(change, requirement) >= 0.18 ||
        (requirement.kind === 'safety' && change.sensitive),
    );
    const evidenceIds = relevantChanges
      .map((change) => input.evidenceByFile.get(change.path)?.id)
      .filter((id): id is string => id !== undefined);
    const highRisk = relevantChanges.some(
      (change) => change.classification === 'HIGH_RISK_OUT_OF_SCOPE',
    );

    if (requirement.kind === 'safety' && highRisk) {
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'FAILED',
        strength: 1,
        evidenceIds: [
          ...evidenceIds,
          ...input.warningEvidence
            .filter((record) => record.type === 'security_finding')
            .map((record) => record.id),
        ],
        explanation: 'A security-sensitive change contradicts this scope constraint.',
      };
    }

    if (input.regressionEvidence.length > 0 && requirement.kind !== 'outcome') {
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'FAILED',
        strength: 2,
        evidenceIds: [
          ...evidenceIds,
          ...input.regressionEvidence.map((record) => record.id),
        ],
        explanation: 'A check that passed at baseline now fails.',
      };
    }

    if (
      (requirement.kind === 'constraint' || requirement.kind === 'safety') &&
      input.scopeIntegrityEvidence !== undefined
    ) {
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'VERIFIED',
        strength: 2,
        evidenceIds: [...evidenceIds, input.scopeIntegrityEvidence.id],
        explanation:
          'The complete Git diff contains no unexpected or high-risk scope drift, every approved check passed, and no baseline regression was introduced.',
      };
    }

    const existingTest = input.preExistingTestEvidence.get(requirement.id);
    if (existingTest !== undefined && passedTest !== undefined && !input.compromisedTests) {
      const passedEvidence = input.checkEvidence.get(passedTest.checkId);
      if (passedEvidence !== undefined) {
        return {
          requirementId: requirement.id,
          text: requirement.text,
          status: 'VERIFIED',
          strength: 2,
          evidenceIds: [...evidenceIds, existingTest.id, passedEvidence.id],
          explanation:
            'An unchanged pre-existing relevant test is backed by an approved passing test run.',
        };
      }
    }

    if (relevantChanges.length === 0) {
      if (requirement.kind === 'constraint' || requirement.kind === 'preservation') {
        const scopeEvidence = input.warningEvidence.filter(
          (record) =>
            record.type === 'scope_classification' || record.type === 'security_finding',
        );
        if (scopeEvidence.length > 0) {
          return {
            requirementId: requirement.id,
            text: requirement.text,
            status: 'HUMAN_REVIEW_REQUIRED',
            strength: 1,
            evidenceIds: scopeEvidence.map((record) => record.id),
            explanation:
              'Unexpected changes make this preservation claim unsafe to accept automatically.',
          };
        }
      }
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'UNVERIFIED',
        strength: 0,
        evidenceIds: [],
        explanation: 'No evidence could be connected directly to this requirement.',
      };
    }

    if (failedChecks.length > 0 && requirement.kind === 'outcome') {
      const failedEvidenceIds = failedChecks
        .map((check) => input.checkEvidence.get(check.checkId)?.id)
        .filter((id): id is string => id !== undefined);
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'FAILED',
        strength: 2,
        evidenceIds: [...evidenceIds, ...failedEvidenceIds],
        explanation:
          'Relevant implementation evidence exists, but an approved verification check failed.',
      };
    }

    if (
      baselineTest?.status === 'failed' &&
      passedTest !== undefined &&
      !input.compromisedTests
    ) {
      const passedEvidence = input.checkEvidence.get(passedTest.checkId);
      if (passedEvidence !== undefined) {
        return {
          requirementId: requirement.id,
          text: requirement.text,
          status: 'VERIFIED',
          strength: 2,
          evidenceIds: [...evidenceIds, passedEvidence.id],
          explanation:
            'The approved test check failed at baseline and passes after relevant changes.',
        };
      }
    }

    if (input.compromisedTests && passedTest !== undefined) {
      return {
        requirementId: requirement.id,
        text: requirement.text,
        status: 'HUMAN_REVIEW_REQUIRED',
        strength: 1,
        evidenceIds: [
          ...evidenceIds,
          ...input.warningEvidence
            .filter((record) => record.type === 'test_integrity')
            .map((record) => record.id),
        ],
        explanation:
          'The implementation is present, but pre-existing tests changed, weakening independence.',
      };
    }

    return {
      requirementId: requirement.id,
      text: requirement.text,
      status: 'SUPPORTED',
      strength: 1,
      evidenceIds,
      explanation:
        'Relevant static implementation evidence exists, but behavior was not directly proven.',
    };
  });
}

function summarizeChanges(changes: readonly FileChange[]) {
  return {
    filesChanged: changes.length,
    added: changes.filter((change) => change.status === 'added').length,
    modified: changes.filter((change) => change.status === 'modified').length,
    deleted: changes.filter((change) => change.status === 'deleted').length,
    renamed: changes.filter((change) => change.status === 'renamed').length,
    additions: changes.reduce((sum, change) => sum + (change.additions ?? 0), 0),
    deletions: changes.reduce((sum, change) => sum + (change.deletions ?? 0), 0),
  };
}

function capTotalPatches(changes: readonly FileChange[]): FileChange[] {
  let remaining = MAX_TOTAL_PATCH_BYTES;
  return changes.map((change) => {
    if (remaining <= 0) {
      return {
        ...change,
        patch: '… patch omitted because the report context limit was reached …\n',
        patchTruncated: true,
      };
    }
    const bounded = truncateUtf8(change.patch, remaining);
    remaining -= Buffer.byteLength(bounded.value);
    return {
      ...change,
      patch: bounded.value,
      patchTruncated: change.patchTruncated || bounded.truncated,
    };
  });
}
