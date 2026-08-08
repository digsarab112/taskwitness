import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILENAME, RUNTIME_DIRECTORY } from '../domain/constants.js';
import { isNodeError, pathExists } from '../utils/fs.js';

export type InitResult = {
  gitignoreUpdated: boolean;
  configCreated: boolean;
};

export async function initializeRepository(repositoryRoot: string): Promise<InitResult> {
  const gitignorePath = path.join(repositoryRoot, '.gitignore');
  let gitignore = '';
  try {
    gitignore = await readFile(gitignorePath, 'utf8');
  } catch (error) {
    if (!(isNodeError(error) && error.code === 'ENOENT')) throw error;
  }
  const entry = `${RUNTIME_DIRECTORY}/`;
  const lines = gitignore.split(/\r?\n/u);
  const gitignoreUpdated = !lines.includes(entry);
  if (gitignoreUpdated) {
    const separator = gitignore === '' || gitignore.endsWith('\n') ? '' : '\n';
    await writeFile(gitignorePath, `${gitignore}${separator}${entry}\n`, 'utf8');
  }

  const configPath = path.join(repositoryRoot, CONFIG_FILENAME);
  const configCreated = !(await pathExists(configPath));
  if (configCreated) {
    await writeFile(
      configPath,
      [
        '# TaskWitness repository configuration',
        'version: 1',
        'trustedChecks: []',
        'ignoredPaths: []',
        'sensitivePaths: []',
        'checkTimeoutMs: 120000',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  return { gitignoreUpdated, configCreated };
}
