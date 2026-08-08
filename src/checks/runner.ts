import { MAX_CHECK_OUTPUT_BYTES } from '../domain/constants.js';
import type { CheckDefinition, CheckResult } from '../domain/schemas.js';
import { runProcess } from '../utils/process.js';

export type CheckRunnerHooks = {
  onStart?: (check: CheckDefinition) => void;
  onFinish?: (check: CheckDefinition, result: CheckResult) => void;
};

export async function runChecks(
  checks: readonly CheckDefinition[],
  repositoryRoot: string,
  hooks: CheckRunnerHooks = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    hooks.onStart?.(check);
    const startedAt = new Date().toISOString();
    const processResult = await runProcess(check.executable, check.args, {
      cwd: repositoryRoot,
      timeoutMs: check.timeoutMs,
      maxOutputBytes: MAX_CHECK_OUTPUT_BYTES,
    });
    const status = processResult.timedOut
      ? 'timed_out'
      : processResult.spawnError !== undefined
        ? 'error'
        : processResult.exitCode === 0
          ? 'passed'
          : 'failed';
    const combinedOutput = `${processResult.stdout}\n${processResult.stderr}`;
    const counts = parseTestCounts(combinedOutput);
    const result: CheckResult = {
      checkId: check.id,
      label: check.label,
      category: check.category,
      command: check.command,
      status,
      exitCode: processResult.exitCode,
      durationMs: processResult.durationMs,
      stdout: processResult.stdout,
      stderr:
        processResult.spawnError === undefined
          ? processResult.stderr
          : `${processResult.stderr}\n${processResult.spawnError}`.trim(),
      truncated: processResult.truncated,
      ...(counts === undefined ? {} : { counts }),
      startedAt,
    };
    results.push(result);
    hooks.onFinish?.(check, result);
  }
  return results;
}

export function parseTestCounts(output: string): CheckResult['counts'] | undefined {
  const counts: NonNullable<CheckResult['counts']> = {};
  const patterns: readonly [keyof NonNullable<CheckResult['counts']>, RegExp[]][] = [
    [
      'passed',
      [
        /(?:Tests?|Test Files?)\s+(?:[^\n]*?\|\s*)?(\d+)\s+passed\b/iu,
        /\b(\d+)\s+passed\b/iu,
        /\bpass(?:ed|ing)?\s*[:=]?\s*(\d+)\b/iu,
      ],
    ],
    [
      'failed',
      [
        /(?:Tests?|Test Files?)\s+(?:[^\n]*?\|\s*)?(\d+)\s+failed\b/iu,
        /\b(\d+)\s+failed\b/iu,
        /\bfail(?:ed|ures?)?\s*[:=]?\s*(\d+)\b/iu,
      ],
    ],
    [
      'skipped',
      [/\b(\d+)\s+(?:skipped|pending)\b/iu, /\bskip(?:ped)?\s*[:=]?\s*(\d+)\b/iu],
    ],
  ];

  for (const [key, candidates] of patterns) {
    for (const pattern of candidates) {
      const match = pattern.exec(output);
      if (match?.[1] !== undefined) {
        counts[key] = Number(match[1]);
        break;
      }
    }
  }
  return Object.keys(counts).length === 0 ? undefined : counts;
}
