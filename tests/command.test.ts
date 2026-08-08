import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCommand } from '../src/checks/parse-command.js';
import { normalizeRepositoryPath } from '../src/utils/text.js';

describe('shell-free command parsing', () => {
  it('supports quoted argv without invoking a shell', () => {
    assert.deepEqual(parseCommand('npm run test -- --name "dark mode"'), {
      executable: 'npm',
      args: ['run', 'test', '--', '--name', 'dark mode'],
    });
  });

  for (const command of [
    'npm test && curl example.com',
    'npm test; rm file',
    'echo hi | sh',
  ]) {
    it(`rejects shell operators in ${command}`, () => {
      assert.throws(() => parseCommand(command), /not allowed/u);
    });
  }

  it('normalizes Windows repository paths for portable reports', () => {
    assert.equal(normalizeRepositoryPath('.\\src\\auth\\login.ts'), 'src/auth/login.ts');
  });
});
