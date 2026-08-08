import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const testRoot = path.resolve('.test-dist', 'tests');
const testFiles = await findTestFiles(testRoot);

if (testFiles.length === 0) {
  console.error(`No compiled test files found under ${testRoot}`);
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, ['--test', ...testFiles], {
    stdio: 'inherit',
    windowsHide: true,
  });

  child.on('error', (error) => {
    console.error(`Could not start the Node.js test runner: ${error.message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    if (signal !== null) {
      console.error(`Node.js test runner terminated by ${signal}`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

async function findTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      if (entry.isFile() && entry.name.endsWith('.test.js')) return [entryPath];
      return [];
    }),
  );
  return files.flat().sort((left, right) => left.localeCompare(right));
}
