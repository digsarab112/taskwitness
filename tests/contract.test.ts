import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateTaskContract } from '../src/contract/generate.js';

describe('Task Contract generation', () => {
  it('turns a concrete request into a concise contract', () => {
    const contract = generateTaskContract(
      'Add dark mode and remember the preference after refresh without breaking light mode',
    );
    assert.equal(contract.ambiguous, false);
    assert.equal(contract.requirements.length, 3);
    assert.deepEqual(
      contract.requirements.map((item) => item.id),
      ['R1', 'R2', 'R3'],
    );
    assert.match(contract.requirements[0]?.text ?? '', /Dark mode/u);
    assert.match(contract.requirements[1]?.text ?? '', /preference after refresh/u);
    assert.equal(contract.requirements[2]?.kind, 'preservation');
  });

  it('rejects materially ambiguous work', () => {
    const contract = generateTaskContract('Improve login');
    assert.equal(contract.ambiguous, true);
    assert.deepEqual(contract.requirements, []);
    assert.match(contract.ambiguityReasons.join(' '), /observable outcome/u);
  });

  it('adds a safety requirement for sensitive work', () => {
    const contract = generateTaskContract('Add Google login');
    assert.equal(
      contract.requirements.some((item) => item.kind === 'safety'),
      true,
    );
    assert.ok(contract.requirements.length <= 6);
  });
});
