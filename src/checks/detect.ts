import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CheckDefinition } from '../domain/schemas.js';
import { pathExists } from '../utils/fs.js';
import { shellDisplay } from '../utils/text.js';

type PackageJson = {
  scripts?: Record<string, string>;
};

export async function detectChecks(
  repositoryRoot: string,
  timeoutMs: number,
): Promise<CheckDefinition[]> {
  const checks = [
    ...(await detectNodeChecks(repositoryRoot, timeoutMs)),
    ...(await detectPythonChecks(repositoryRoot, timeoutMs)),
  ];
  return deduplicateChecks(checks);
}

async function detectNodeChecks(
  root: string,
  timeoutMs: number,
): Promise<CheckDefinition[]> {
  const packagePath = path.join(root, 'package.json');
  if (!(await pathExists(packagePath))) return [];
  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;
  } catch (error) {
    throw new Error(`Cannot parse package.json: ${formatError(error)}`, { cause: error });
  }

  const packageManager = await detectPackageManager(root);
  const scripts = packageJson.scripts ?? {};
  const candidates: readonly {
    names: readonly string[];
    id: string;
    label: string;
    category: CheckDefinition['category'];
  }[] = [
    { names: ['test'], id: 'node-test', label: 'Tests', category: 'test' },
    { names: ['build'], id: 'node-build', label: 'Build', category: 'build' },
    { names: ['lint'], id: 'node-lint', label: 'Lint', category: 'lint' },
    {
      names: ['typecheck', 'type-check', 'check:types'],
      id: 'node-typecheck',
      label: 'Typecheck',
      category: 'typecheck',
    },
  ];

  const checks: CheckDefinition[] = [];
  for (const candidate of candidates) {
    const scriptName = candidate.names.find((name) => scripts[name] !== undefined);
    if (scriptName === undefined) continue;
    const args = packageManager === 'npm' ? ['run', scriptName] : [scriptName];
    checks.push({
      id: candidate.id,
      label: candidate.label,
      category: candidate.category,
      executable: packageManager,
      args,
      command: shellDisplay(packageManager, args),
      source: 'detected',
      timeoutMs,
    });
  }
  return checks;
}

async function detectPackageManager(
  root: string,
): Promise<'npm' | 'pnpm' | 'yarn' | 'bun'> {
  if (await pathExists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await pathExists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (
    (await pathExists(path.join(root, 'bun.lock'))) ||
    (await pathExists(path.join(root, 'bun.lockb')))
  ) {
    return 'bun';
  }
  return 'npm';
}

async function detectPythonChecks(
  root: string,
  timeoutMs: number,
): Promise<CheckDefinition[]> {
  const pyprojectPath = path.join(root, 'pyproject.toml');
  const hasPyproject = await pathExists(pyprojectPath);
  const hasRequirements = await pathExists(path.join(root, 'requirements.txt'));
  const hasPythonProject =
    hasPyproject ||
    hasRequirements ||
    (await pathExists(path.join(root, 'setup.py'))) ||
    (await pathExists(path.join(root, 'setup.cfg')));
  if (!hasPythonProject) return [];

  const pyproject = hasPyproject ? await readFile(pyprojectPath, 'utf8') : '';
  const requirements = hasRequirements
    ? await readFile(path.join(root, 'requirements.txt'), 'utf8')
    : '';
  const dependencyText = `${pyproject}\n${requirements}`.toLowerCase();
  const checks: CheckDefinition[] = [];

  const python = process.platform === 'win32' ? 'py' : 'python3';
  const add = (
    id: string,
    label: string,
    category: CheckDefinition['category'],
    args: string[],
  ): void => {
    checks.push({
      id,
      label,
      category,
      executable: python,
      args,
      command: shellDisplay(python, args),
      source: 'detected',
      timeoutMs,
    });
  };

  if (
    dependencyText.includes('pytest') ||
    (await pathExists(path.join(root, 'pytest.ini')))
  ) {
    add('python-test', 'Tests', 'test', ['-m', 'pytest']);
  } else if (await pathExists(path.join(root, 'tests'))) {
    add('python-test', 'Tests', 'test', ['-m', 'unittest', 'discover']);
  }
  if (dependencyText.includes('ruff') || pyproject.includes('[tool.ruff')) {
    add('python-lint', 'Lint', 'lint', ['-m', 'ruff', 'check', '.']);
  }
  if (dependencyText.includes('mypy') || pyproject.includes('[tool.mypy')) {
    add('python-typecheck', 'Typecheck', 'typecheck', ['-m', 'mypy', '.']);
  }
  if (pyproject.includes('[build-system]')) {
    add('python-build', 'Build', 'build', ['-m', 'build']);
  }
  return checks;
}

function deduplicateChecks(checks: CheckDefinition[]): CheckDefinition[] {
  const seen = new Set<string>();
  return checks.filter((check) => {
    if (seen.has(check.command)) return false;
    seen.add(check.command);
    return true;
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
