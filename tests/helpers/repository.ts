import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TestRepository = {
  root: string;
  write(relativePath: string, content: string): Promise<void>;
  remove(relativePath: string): Promise<void>;
  git(...args: string[]): Promise<string>;
  cleanup(): Promise<void>;
};

export async function createTestRepository(
  files: Record<string, string>,
): Promise<TestRepository> {
  const root = await mkdtemp(path.join(tmpdir(), 'taskwitness-test-'));
  const git = async (...args: string[]): Promise<string> => {
    const result = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
    return result.stdout;
  };
  const write = async (relativePath: string, content: string): Promise<void> => {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  };
  const remove = async (relativePath: string): Promise<void> => {
    await rm(path.join(root, relativePath), { recursive: true, force: true });
  };
  await git('init', '--initial-branch=main');
  await git('config', 'user.email', 'taskwitness@example.test');
  await git('config', 'user.name', 'TaskWitness Tests');
  for (const [filePath, content] of Object.entries(files)) await write(filePath, content);
  await git('add', '-A');
  await git('commit', '-m', 'fixture baseline');
  return {
    root,
    write,
    remove,
    git,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}
