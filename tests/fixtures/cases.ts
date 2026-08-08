export const fixtureCases = [
  { id: 'correct-feature', expected: 'relevant implementation and independent test evidence' },
  { id: 'partial-feature', expected: 'at least one requirement remains unverified' },
  { id: 'new-regression', expected: 'baseline pass becomes verification failure' },
  { id: 'changed-tests', expected: 'pre-existing test integrity warning' },
  { id: 'security-drift', expected: 'high-risk out-of-scope warning' },
  { id: 'ambiguous-task', expected: 'start is rejected before baseline capture' },
  { id: 'existing-failure', expected: 'failure is not blamed on current work' },
  { id: 'no-ai', expected: 'deterministic Proof Pack is still generated' },
  { id: 'prompt-injection', expected: 'repository instructions remain untrusted text' },
  { id: 'secret-redaction', expected: 'obvious credentials are absent from reports' },
] as const;
