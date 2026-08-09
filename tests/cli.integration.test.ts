import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import type { VerificationReport } from '../src/domain/schemas.js';
import { createTestRepository, type TestRepository } from './helpers/repository.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('.test-dist', 'src', 'cli.js');

describe('CLI workflow', () => {
  let fixture: TestRepository | undefined;
  afterEach(async () => fixture?.cleanup());

  it('returns zero for a healthy baseline-failure-to-pass workflow', async () => {
    fixture = await createTestRepository({
      'package.json': JSON.stringify({
        name: 'taskwitness-cli-fixture',
        private: true,
        type: 'module',
        scripts: { test: 'node --test' },
      }),
      'src/feature.js': 'export const feature = false;\n',
      'test/feature.test.js': [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "import { feature } from '../src/feature.js';",
        "test('feature behavior', () => assert.equal(feature, true));",
        '',
      ].join('\n'),
    });

    const start = await runCli(fixture.root, [
      'start',
      'Implement feature behavior',
      '--yes',
    ]);
    assert.equal(start.exitCode, 0, start.stderr);
    assert.match(start.stdout, /Repository prepared for TaskWitness/u);
    assert.match(
      await readFile(path.join(fixture.root, '.gitignore'), 'utf8'),
      /\.taskwitness\//u,
    );
    assert.match(
      await readFile(path.join(fixture.root, '.taskwitness.yml'), 'utf8'),
      /version: 1/u,
    );

    await fixture.write('src/feature.js', 'export const feature = true;\n');
    const verify = await runCli(fixture.root, ['verify', '--yes']);
    assert.equal(verify.exitCode, 0, verify.stderr);
    assert.match(verify.stdout, /✓ VERIFIED/u);

    const sessionId = (
      await readFile(path.join(fixture.root, '.taskwitness', 'current'), 'utf8')
    ).trim();
    const report = JSON.parse(
      await readFile(
        path.join(fixture.root, '.taskwitness', 'reports', sessionId, 'report.json'),
        'utf8',
      ),
    ) as VerificationReport;
    assert.equal(report.verdict, 'VERIFIED');
    assert.equal(
      report.requirements.every((finding) => finding.status === 'VERIFIED'),
      true,
    );
  });
});

async function runCli(
  cwd: string,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'number' &&
      'stdout' in error &&
      typeof error.stdout === 'string' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
    ) {
      return {
        exitCode: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
    throw error;
  }
}
