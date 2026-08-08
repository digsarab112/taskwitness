import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoAiProvider } from '../src/providers/provider.js';
import { fixtureCases } from './fixtures/cases.js';

describe('adversarial fixture coverage', () => {
  it('documents every required Phase 1 fixture case', () => {
    assert.equal(fixtureCases.length, 10);
    assert.deepEqual(new Set(fixtureCases.map((item) => item.id)).size, 10);
  });

  it('works without an AI provider', async () => {
    const provider = new NoAiProvider();
    const suggestions = await provider.suggest({
      trustedContract: {
        task: 'Add a feature',
        ambiguous: false,
        ambiguityReasons: [],
        requirements: [],
        approvedAt: new Date().toISOString(),
        generator: 'deterministic',
      },
      untrustedEvidence: [],
    });
    assert.deepEqual(suggestions, []);
  });
});
