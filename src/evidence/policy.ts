import type {
  EvidenceRecord,
  RequirementFinding,
  Verdict,
  Warning,
} from '../domain/schemas.js';

export function enforceFindingPolicy(
  findings: readonly RequirementFinding[],
  evidence: readonly EvidenceRecord[],
): RequirementFinding[] {
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  return findings.map((finding) => {
    const referenced = finding.evidenceIds.map((id) => {
      const record = evidenceById.get(id);
      if (record === undefined) {
        throw new Error(
          `Requirement ${finding.requirementId} references missing evidence ${id}.`,
        );
      }
      return record;
    });
    const strongest = referenced.reduce<0 | 1 | 2 | 3>(
      (current, record) => Math.max(current, record.strength) as 0 | 1 | 2 | 3,
      0,
    );
    if (finding.status !== 'VERIFIED') return { ...finding, strength: strongest };
    const qualifies = referenced.some(
      (record) => record.independent && record.result === 'passed' && record.strength >= 2,
    );
    if (qualifies) return { ...finding, strength: strongest };
    return {
      ...finding,
      status: strongest >= 1 ? 'SUPPORTED' : 'UNVERIFIED',
      strength: strongest,
      explanation: `${finding.explanation} TaskWitness downgraded this claim because no independent deterministic proof was referenced.`,
    };
  });
}

export function deriveVerdict(
  findings: readonly RequirementFinding[],
  warnings: readonly Warning[],
  hasNewRegression: boolean,
): { verdict: Verdict; reasons: string[] } {
  const failed = findings.filter((finding) => finding.status === 'FAILED');
  if (failed.length > 0 || hasNewRegression) {
    return {
      verdict: 'VERIFICATION_FAILED',
      reasons: [
        ...(failed.length > 0
          ? [`${failed.length} requirement(s) have contradictory evidence.`]
          : []),
        ...(hasNewRegression ? ['At least one check regressed from the baseline.'] : []),
      ],
    };
  }

  const review = findings.some((finding) => finding.status === 'HUMAN_REVIEW_REQUIRED');
  const blockingWarning = warnings.some(
    (warning) => warning.severity === 'high' || warning.title.includes('TEST INTEGRITY'),
  );
  if (review || blockingWarning) {
    return {
      verdict: 'NEEDS_REVIEW',
      reasons: [
        ...(review ? ['At least one requirement requires human review.'] : []),
        ...(blockingWarning ? ['A high-impact or test-integrity warning is present.'] : []),
      ],
    };
  }

  const incomplete = findings.filter(
    (finding) => finding.status === 'SUPPORTED' || finding.status === 'UNVERIFIED',
  );
  if (incomplete.length > 0) {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      reasons: [
        `${incomplete.length} requirement(s) are supported or unverified rather than proven.`,
      ],
    };
  }

  return {
    verdict: 'VERIFIED',
    reasons: ['Every applicable requirement has deterministic proof.'],
  };
}
