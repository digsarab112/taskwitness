import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runProcess } from '../src/utils/process.js';

describe('cross-platform process execution', () => {
  it('executes the real npm launcher without a shell API', async () => {
    const result = await runProcess('npm', ['--version'], {
      cwd: process.cwd(),
      timeoutMs: 30_000,
      maxOutputBytes: 16_000,
      redact: false,
    });

    assert.equal(result.spawnError, undefined);
    assert.equal(result.timedOut, false);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+(?:-.+)?$/u);
  });
});
