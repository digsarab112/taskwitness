import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crossSpawn from 'cross-spawn';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type PackResult = {
  filename: string;
  files: string[];
};

const repositoryRoot = process.cwd();
const packageJson = parsePackageJson(
  await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
);
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'taskwitness-package-smoke-'));

try {
  const packageDirectory = path.join(temporaryRoot, 'package');
  const installPrefix = path.join(temporaryRoot, 'install');
  const projectDirectory = path.join(temporaryRoot, 'project');
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(projectDirectory, { recursive: true });

  const packed = await runNpm(
    ['pack', '--json', '--pack-destination', packageDirectory],
    repositoryRoot,
  );
  const packResult = parsePackResult(packed.stdout);
  assert.equal(packResult.files.includes('dist/cli.js'), true, 'dist/cli.js is missing');
  assert.equal(packResult.files.includes('README.md'), true, 'README.md is missing');
  assert.equal(packResult.files.includes('LICENSE'), true, 'LICENSE is missing');
  assert.equal(
    packResult.files.some((file) => file.startsWith('src/')),
    false,
    'source files leaked into the package',
  );
  assert.equal(
    packResult.files.some((file) => file.startsWith('tests/')),
    false,
    'test files leaked into the package',
  );

  const tarball = path.join(packageDirectory, packResult.filename);
  await access(tarball);
  await runNpm(
    [
      'install',
      '--global',
      '--prefix',
      installPrefix,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    temporaryRoot,
  );

  const taskwitness =
    process.platform === 'win32'
      ? path.join(installPrefix, 'taskwitness.cmd')
      : path.join(installPrefix, 'bin', 'taskwitness');
  const version = await runCommand(taskwitness, ['--version'], temporaryRoot, [0]);
  assert.equal(version.stdout.trim(), packageJson.version);
  const help = await runCommand(taskwitness, ['--help'], temporaryRoot, [0]);
  for (const command of ['start', 'verify', 'report', 'doctor']) {
    assert.match(help.stdout, new RegExp(`\\b${command}\\b`, 'u'));
  }
  assert.match(help.stdout, /Quick start:/u);

  await runCommand('git', ['init', '--initial-branch=main'], projectDirectory, [0]);
  const doctor = await runCommand(taskwitness, ['doctor'], projectDirectory, [0]);
  assert.match(doctor.stdout, /start will create it automatically/u);
  const start = await runCommand(
    taskwitness,
    [
      'start',
      'Add a greeting command without changing existing behavior',
      '--yes',
      '--no-baseline-checks',
    ],
    projectDirectory,
    [0],
  );
  assert.match(start.stdout, /Repository prepared for TaskWitness/u);
  await access(path.join(projectDirectory, '.taskwitness.yml'));
  assert.match(
    await readFile(path.join(projectDirectory, '.gitignore'), 'utf8'),
    /\.taskwitness\//u,
  );

  await mkdir(path.join(projectDirectory, 'src'), { recursive: true });
  await writeFile(
    path.join(projectDirectory, 'src', 'greeting.js'),
    "export const greeting = 'hello';\n",
    'utf8',
  );
  const verify = await runCommand(
    taskwitness,
    ['verify', '--yes', '--no-checks', '--no-ai'],
    projectDirectory,
    [2],
  );
  assert.match(verify.stdout, /INSUFFICIENT EVIDENCE|NEEDS REVIEW/u);
  const report = await runCommand(taskwitness, ['report', '--json'], projectDirectory, [0]);
  assertReport(report.stdout);

  console.log(
    `✓ Installed taskwitness ${packageJson.version} passed the packaged CLI workflow.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function runNpm(args: readonly string[], cwd: string): Promise<CommandResult> {
  const npmCli = process.env.npm_execpath;
  return npmCli === undefined
    ? runCommand('npm', args, cwd, [0])
    : runCommand(process.execPath, [npmCli, ...args], cwd, [0]);
}

function runCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
  expectedExitCodes: readonly number[],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(executable, [...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      const result = {
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (!expectedExitCodes.includes(result.exitCode)) {
        reject(
          new Error(
            `${executable} ${args.join(' ')} exited with ${result.exitCode}\n${result.stderr}`,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

function parsePackageJson(raw: string): { version: string } {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.version !== 'string') {
    throw new Error('package.json does not contain a string version.');
  }
  return { version: value.version };
}

function parsePackResult(raw: string): PackResult {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('npm pack did not return one package result.');
  }
  const item = value[0];
  if (typeof item.filename !== 'string' || !Array.isArray(item.files)) {
    throw new Error('npm pack returned an invalid package manifest.');
  }
  const files = item.files.map((file) => {
    if (!isRecord(file) || typeof file.path !== 'string') {
      throw new Error('npm pack returned an invalid file entry.');
    }
    return file.path;
  });
  return { filename: item.filename, files };
}

function assertReport(raw: string): void {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.verdict !== 'string') {
    throw new Error('The installed CLI did not produce a valid JSON report.');
  }
  assert.equal(['INSUFFICIENT_EVIDENCE', 'NEEDS_REVIEW'].includes(value.verdict), true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
