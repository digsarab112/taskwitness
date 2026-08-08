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

  it('preserves unquoted Windows paths', () => {
    assert.deepEqual(parseCommand('C:\\Tools\\runner.exe --config C:\\work\\task.yml'), {
      executable: 'C:\\Tools\\runner.exe',
      args: ['--config', 'C:\\work\\task.yml'],
    });
  });

  it('preserves quoted Windows and UNC paths with spaces', () => {
    assert.deepEqual(
      parseCommand(
        '"C:\\Program Files\\Runner\\runner.exe" "\\\\server\\shared files\\task.yml"',
      ),
      {
        executable: 'C:\\Program Files\\Runner\\runner.exe',
        args: ['\\\\server\\shared files\\task.yml'],
      },
    );
  });

  it('still supports escaped spaces and empty arguments', () => {
    assert.deepEqual(parseCommand('runner my\\ file ""'), {
      executable: 'runner',
      args: ['my file', ''],
    });
  });

  it('rejects an empty quoted executable', () => {
    assert.throws(() => parseCommand('""'), /cannot be empty/u);
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
