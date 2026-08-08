export const TASKWITNESS_VERSION = '0.1.0';
export const SESSION_SCHEMA_VERSION = 1 as const;
export const REPORT_SCHEMA_VERSION = 1 as const;
export const RUNTIME_DIRECTORY = '.taskwitness';
export const CONFIG_FILENAME = '.taskwitness.yml';
export const DEFAULT_CHECK_TIMEOUT_MS = 120_000;
export const MAX_CHECK_OUTPUT_BYTES = 128 * 1024;
export const MAX_PATCH_BYTES_PER_FILE = 96 * 1024;
export const MAX_TOTAL_PATCH_BYTES = 512 * 1024;

export const DEFAULT_LIMITATIONS = [
  'Passing generic checks does not prove every requested behavior.',
  'Scope and sensitive-change classification uses conservative heuristics.',
  'Approved checks execute repository code without an isolation sandbox.',
  'Secret redaction is heuristic and may not identify every credential.',
];
