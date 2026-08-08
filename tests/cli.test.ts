import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { exitCodeForVerdict } from '../src/cli/main.js';
import { TASKWITNESS_VERSION } from '../src/domain/constants.js';

describe('CLI verdict exit codes', () => {
  it('returns success only for a verified report', () => {
    assert.equal(exitCodeForVerdict('VERIFIED'), 0);
    assert.equal(exitCodeForVerdict('VERIFICATION_FAILED'), 1);
    assert.equal(exitCodeForVerdict('NEEDS_REVIEW'), 2);
    assert.equal(exitCodeForVerdict('INSUFFICIENT_EVIDENCE'), 2);
  });

  it('keeps the CLI and package versions in sync', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: unknown };
    assert.equal(packageJson.version, TASKWITNESS_VERSION);
  });
});
