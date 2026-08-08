import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactSecrets } from '../src/security/redact.js';
import { runChecks } from '../src/checks/runner.js';

describe('secret handling', () => {
  it('redacts common secrets and private key blocks', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    const input = `Authorization: Bearer abc.def\napi_key=${secret}\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----`;
    const result = redactSecrets(input);
    assert.ok(!result.text.includes(secret));
    assert.ok(!result.text.includes('abc.def'));
    assert.ok(!result.text.includes('BEGIN PRIVATE KEY'));
    assert.ok(result.redactions >= 3);
  });

  it('redacts captured check output', async () => {
    const results = await runChecks(
      [
        {
          id: 'redaction',
          label: 'Redaction',
          category: 'custom',
          command: 'node -e redaction-fixture',
          executable: process.execPath,
          args: ['-e', 'console.log("api_key=sk-abcdefghijklmnopqrstuvwxyz123456")'],
          source: 'user',
          timeoutMs: 10_000,
        },
      ],
      process.cwd(),
    );
    assert.match(results[0]?.stdout ?? '', /\[REDACTED\]/u);
    assert.ok(!(results[0]?.stdout ?? '').includes('abcdefghijklmnopqrstuvwxyz'));
  });
});
