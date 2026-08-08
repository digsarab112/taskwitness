import type { EvidenceRecord, TaskContract } from '../domain/schemas.js';

/** Providers can suggest interpretations but never execute, write, or assign final status. */
export type ProviderInput = {
  trustedContract: TaskContract;
  untrustedEvidence: readonly EvidenceRecord[];
};

export type ProviderSuggestion = {
  requirementId: string;
  suggestedEvidenceIds: string[];
  explanation: string;
};

export type ReviewProvider = {
  readonly name: string;
  suggest(input: ProviderInput): Promise<ProviderSuggestion[]>;
};

export class NoAiProvider implements ReviewProvider {
  readonly name = 'deterministic';
  suggest(input: ProviderInput): Promise<ProviderSuggestion[]> {
    void input;
    return Promise.resolve([]);
  }
}
