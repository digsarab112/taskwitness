import { z } from 'zod';

export const VerificationStatusSchema = z.enum([
  'VERIFIED',
  'SUPPORTED',
  'UNVERIFIED',
  'FAILED',
  'HUMAN_REVIEW_REQUIRED',
  'NOT_APPLICABLE',
]);

export const VerdictSchema = z.enum([
  'VERIFIED',
  'NEEDS_REVIEW',
  'VERIFICATION_FAILED',
  'INSUFFICIENT_EVIDENCE',
]);

export const ProofStrengthSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const RequirementSchema = z.object({
  id: z.string().regex(/^R\d+$/u),
  text: z.string().min(3),
  kind: z.enum(['outcome', 'constraint', 'preservation', 'safety']),
  keywords: z.array(z.string()).default([]),
});

export const TaskContractSchema = z.object({
  task: z.string().min(3),
  ambiguous: z.boolean(),
  ambiguityReasons: z.array(z.string()),
  requirements: z.array(RequirementSchema).max(6),
  approvedAt: z.string().datetime().nullable(),
  generator: z.enum(['deterministic', 'provider-assisted']),
});

export const CheckDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(['test', 'build', 'lint', 'typecheck', 'custom']),
  command: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()),
  source: z.enum(['detected', 'config', 'user']),
  timeoutMs: z.number().int().positive().max(1_800_000),
});

export const CheckResultSchema = z.object({
  checkId: z.string(),
  label: z.string(),
  category: CheckDefinitionSchema.shape.category,
  command: z.string(),
  status: z.enum(['passed', 'failed', 'timed_out', 'error', 'skipped']),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  counts: z
    .object({
      passed: z.number().int().nonnegative().optional(),
      failed: z.number().int().nonnegative().optional(),
      skipped: z.number().int().nonnegative().optional(),
    })
    .optional(),
  startedAt: z.string().datetime(),
});

export const FileSnapshotSchema = z.object({
  path: z.string(),
  objectId: z.string(),
  size: z.number().int().nonnegative(),
  mode: z.string(),
});

export const RepositoryStatusSchema = z.object({
  staged: z.array(z.string()),
  unstaged: z.array(z.string()),
  untracked: z.array(z.string()),
  conflicted: z.array(z.string()),
});

export const BaselineSchema = z.object({
  repositoryRoot: z.string(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  tree: z.string(),
  status: RepositoryStatusSchema,
  files: z.array(FileSnapshotSchema),
  dependencyFiles: z.array(z.string()),
  checks: z.array(CheckDefinitionSchema),
  checkResults: z.array(CheckResultSchema),
  createdAt: z.string().datetime(),
  taskWitnessVersion: z.string(),
});

export const SessionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  contract: TaskContractSchema,
  baseline: BaselineSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const EvidenceTypeSchema = z.enum([
  'file_change',
  'diff_hunk',
  'check_result',
  'baseline_regression',
  'test_integrity',
  'dependency_change',
  'scope_classification',
  'security_finding',
  'repository_state',
]);

export const EvidenceRecordSchema = z.object({
  id: z.string().regex(/^EV-\d{3,}$/u),
  type: EvidenceTypeSchema,
  source: z.string().min(1),
  result: z.enum(['passed', 'failed', 'warning', 'informational']),
  strength: ProofStrengthSchema,
  summary: z.string().min(1),
  details: z.record(z.unknown()).default({}),
  relatedFiles: z.array(z.string()).default([]),
  independent: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

export const FileChangeSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(['added', 'modified', 'deleted', 'renamed', 'type_changed']),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
  patch: z.string(),
  patchTruncated: z.boolean(),
  classification: z.enum([
    'EXPECTED',
    'SUPPORTING',
    'BENEFICIAL',
    'OUT_OF_SCOPE',
    'HIGH_RISK_OUT_OF_SCOPE',
  ]),
  classificationReason: z.string(),
  sensitive: z.boolean(),
  testFile: z.boolean(),
  dependencyFile: z.boolean(),
});

export const RequirementFindingSchema = z.object({
  requirementId: z.string().regex(/^R\d+$/u),
  text: z.string(),
  status: VerificationStatusSchema,
  strength: ProofStrengthSchema,
  evidenceIds: z.array(z.string()),
  explanation: z.string(),
});

export const ChangeSummarySchema = z.object({
  filesChanged: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  renamed: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

export const WarningSchema = z.object({
  severity: z.enum(['info', 'warning', 'high']),
  title: z.string(),
  message: z.string(),
  evidenceIds: z.array(z.string()),
  files: z.array(z.string()),
});

export const VerificationReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string(),
  sessionId: z.string(),
  task: z.string(),
  verdict: VerdictSchema,
  verdictReasons: z.array(z.string()),
  requirements: z.array(RequirementFindingSchema),
  changes: z.array(FileChangeSchema),
  changeSummary: ChangeSummarySchema,
  baselineChecks: z.array(CheckResultSchema),
  verificationChecks: z.array(CheckResultSchema),
  evidence: z.array(EvidenceRecordSchema),
  warnings: z.array(WarningSchema),
  generatedAt: z.string().datetime(),
  taskWitnessVersion: z.string(),
  repository: z.object({
    root: z.string(),
    branchAtStart: z.string().nullable(),
    headAtStart: z.string().nullable(),
    headAtVerify: z.string().nullable(),
    baselineTree: z.string(),
    verificationTree: z.string(),
  }),
  limitations: z.array(z.string()),
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type ProofStrength = z.infer<typeof ProofStrengthSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type TaskContract = z.infer<typeof TaskContractSchema>;
export type CheckDefinition = z.infer<typeof CheckDefinitionSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;
export type RepositoryStatus = z.infer<typeof RepositoryStatusSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type RequirementFinding = z.infer<typeof RequirementFindingSchema>;
export type ChangeSummary = z.infer<typeof ChangeSummarySchema>;
export type Warning = z.infer<typeof WarningSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
