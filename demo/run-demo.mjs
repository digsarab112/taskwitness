import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'demo', 'output');
const repositoryRoot = path.join(outputRoot, 'google-login-repository');
const cliPath = path.join(projectRoot, 'dist', 'cli.js');

if (!repositoryRoot.startsWith(`${outputRoot}${path.sep}`)) {
  throw new Error('Refusing to clean a demo path outside demo/output.');
}

await rm(repositoryRoot, { recursive: true, force: true });
await mkdir(path.join(repositoryRoot, 'src', 'auth'), { recursive: true });
await mkdir(path.join(repositoryRoot, 'test'), { recursive: true });

await write(
  'package.json',
  JSON.stringify(
    {
      name: 'taskwitness-demo',
      private: true,
      type: 'module',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  ),
);
await write('src/auth/password.js', 'export const passwordMinimumLength = 12;\n');
await write(
  'test/password.test.js',
  [
    "import assert from 'node:assert/strict';",
    "import { test } from 'node:test';",
    "import { passwordMinimumLength } from '../src/auth/password.js';",
    "test('password policy', () => assert.equal(passwordMinimumLength, 12));",
    '',
  ].join('\n'),
);

await git('init', '--initial-branch=main');
await git('config', 'user.email', 'demo@taskwitness.dev');
await git('config', 'user.name', 'TaskWitness Demo');
await git('add', '-A');
await git('commit', '-m', 'baseline');

await runCli([
  'start',
  'Add Google login without changing existing email/password login',
  '--yes',
]);

await write(
  'src/auth/google-login.js',
  ['export function beginGoogleLogin() {', "  return '/auth/google';", '}', ''].join('\n'),
);
await write('src/auth/password.js', 'export const passwordMinimumLength = 6;\n');
await write(
  'test/password.test.js',
  [
    "import assert from 'node:assert/strict';",
    "import { test } from 'node:test';",
    "import { passwordMinimumLength } from '../src/auth/password.js';",
    "test('password policy', () => assert.equal(passwordMinimumLength, 6));",
    '',
  ].join('\n'),
);

await runCli(['verify', '--yes']);

const sessionId = (
  await readFile(path.join(repositoryRoot, '.taskwitness', 'current'), 'utf8')
).trim();
const proofPack = path.join(repositoryRoot, '.taskwitness', 'reports', sessionId);
const publishedSample = path.join(outputRoot, 'sample-report');
await rm(publishedSample, { recursive: true, force: true });
await cp(proofPack, publishedSample, { recursive: true });
console.log(`\nDemo Proof Pack: ${publishedSample}`);

async function write(relativePath, content) {
  const target = path.join(repositoryRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function git(...args) {
  await execFileAsync('git', args, { cwd: repositoryRoot });
}

async function runCli(args) {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
