import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { detectChecks } from '../src/checks/detect.js';

describe('ecosystem check detection', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  it('detects common Node.js scripts and package manager', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'taskwitness-detect-'));
    await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'node --test',
          build: 'tsc',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
        },
      }),
      'utf8',
    );
    const checks = await detectChecks(root, 1_000);
    assert.deepEqual(
      checks.map((check) => check.command),
      ['pnpm test', 'pnpm build', 'pnpm lint', 'pnpm typecheck'],
    );
  });

  it('detects Python pytest, Ruff, mypy, and build configuration', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'taskwitness-python-'));
    await mkdir(path.join(root, 'tests'));
    await writeFile(
      path.join(root, 'pyproject.toml'),
      [
        '[build-system]',
        'requires = ["setuptools", "pytest", "ruff", "mypy"]',
        '[tool.ruff]',
        '[tool.mypy]',
      ].join('\n'),
      'utf8',
    );
    const checks = await detectChecks(root, 1_000);
    assert.deepEqual(
      checks.map((check) => check.category),
      ['test', 'lint', 'typecheck', 'build'],
    );
  });
});
