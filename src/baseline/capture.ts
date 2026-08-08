import path from 'node:path';
import { TASKWITNESS_VERSION } from '../domain/constants.js';
import type { Baseline, CheckResult } from '../domain/schemas.js';
import { detectChecks } from '../checks/detect.js';
import type { TaskWitnessConfig } from '../config/config.js';
import { GitRepository } from '../git/repository.js';

const DEPENDENCY_FILE_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'pyproject.toml',
  'poetry.lock',
  'pdm.lock',
  'requirements.txt',
  'requirements-dev.txt',
  'Pipfile',
  'Pipfile.lock',
  'setup.py',
  'setup.cfg',
]);

export async function captureBaseline(
  repository: GitRepository,
  config: TaskWitnessConfig,
  checkResults: CheckResult[],
): Promise<Baseline> {
  await repository.ensureRuntimeExcluded();
  const [branch, head, status, tree, checks] = await Promise.all([
    repository.branch(),
    repository.head(),
    repository.status(),
    repository.createWorktreeTree(),
    detectChecks(repository.root, config.checkTimeoutMs),
  ]);
  const files = await repository.listTree(tree);
  const dependencyFiles = files
    .map((file) => file.path)
    .filter((filePath) => isDependencyFile(filePath));

  return {
    repositoryRoot: repository.root,
    branch,
    head,
    tree,
    status,
    files,
    dependencyFiles,
    checks,
    checkResults,
    createdAt: new Date().toISOString(),
    taskWitnessVersion: TASKWITNESS_VERSION,
  };
}

export function isDependencyFile(filePath: string): boolean {
  const base = path.posix.basename(filePath.replaceAll('\\', '/'));
  return DEPENDENCY_FILE_NAMES.has(base) || /^requirements(?:-[^.]+)?\.txt$/u.test(base);
}
