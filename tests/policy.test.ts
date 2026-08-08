import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enforceFindingPolicy } from '../src/evidence/policy.js';
import type { EvidenceRecord, RequirementFinding } from '../src/domain/schemas.js';

describe('evidence policy', () => {
  it('downgrades VERIFIED when only static evidence exists', () => {
    const evidence: EvidenceRecord[] = [
      {
        id: 'EV-001',
        type: 'file_change',
        source: 'git',
        result: 'informational',
        strength: 1,
        summary: 'file added',
        details: {},
        relatedFiles: ['feature.ts'],
        independent: true,
        createdAt: new Date().toISOString(),
      },
    ];
    const findings: RequirementFinding[] = [
      {
        requirementId: 'R1',
        text: 'Feature works.',
        status: 'VERIFIED',
        strength: 1,
        evidenceIds: ['EV-001'],
        explanation: 'Suggested by a reviewer.',
      },
    ];
    assert.equal(enforceFindingPolicy(findings, evidence)[0]?.status, 'SUPPORTED');
  });

  it('rejects invented evidence references', () => {
    const finding: RequirementFinding = {
      requirementId: 'R1',
      text: 'Feature works.',
      status: 'VERIFIED',
      strength: 2,
      evidenceIds: ['EV-999'],
      explanation: 'Invented.',
    };
    assert.throws(() => enforceFindingPolicy([finding], []), /missing evidence/u);
  });
});
