import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_PATCH_BYTES_PER_FILE } from '../domain/constants.js';
import type { FileChange, FileSnapshot, RepositoryStatus } from '../domain/schemas.js';
import { pathExists } from '../utils/fs.js';
import { runProcess } from '../utils/process.js';
import { normalizeRepositoryPath, truncateUtf8 } from '../utils/text.js';

const GIT_OUTPUT_LIMIT = 8 * 1024 * 1024;

export class GitRepository {
  private constructor(readonly root: string) {}

  static async open(cwd: string): Promise<GitRepository> {
    const result = await runGitRaw(['rev-parse', '--show-toplevel'], cwd);
    if (result.exitCode !== 0) {
      throw new Error('TaskWitness must be run inside a Git repository.');
    }
    return new GitRepository(path.resolve(result.stdout.trim()));
  }

  async head(): Promise<string | null> {
    const result = await this.git(['rev-parse', '--verify', 'HEAD']);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async branch(): Promise<string | null> {
    const result = await this.git(['symbolic-ref', '--short', '-q', 'HEAD']);
    return result.exitCode === 0 && result.stdout.trim() !== ''
      ? result.stdout.trim()
      : null;
  }

  async status(): Promise<RepositoryStatus> {
    const result = await this.git([
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]);
    this.assertGit(result, 'read repository status');
    return parsePorcelainStatus(result.stdout);
  }

  async ensureRuntimeExcluded(): Promise<void> {
    const result = await this.git(['rev-parse', '--git-path', 'info/exclude']);
    this.assertGit(result, 'locate Git exclude file');
    const candidate = result.stdout.trim();
    const excludePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(this.root, candidate);
    const existing = (await pathExists(excludePath))
      ? await readFile(excludePath, 'utf8')
      : '';
    if (existing.split(/\r?\n/u).includes('.taskwitness/')) return;
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    await writeFile(excludePath, `${existing}${separator}.taskwitness/\n`, 'utf8');
  }

  async createWorktreeTree(): Promise<string> {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'taskwitness-index-'));
    const indexPath = path.join(temporaryDirectory, 'index');
    const env = { ...process.env, GIT_INDEX_FILE: indexPath };
    try {
      const empty = await this.git(['read-tree', '--empty'], env);
      this.assertGit(empty, 'prepare baseline index');
      const add = await this.git(['add', '-A', '--', '.'], env);
      this.assertGit(add, 'capture working tree');
      const tree = await this.git(['write-tree'], env);
      this.assertGit(tree, 'write baseline tree');
      return tree.stdout.trim();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async listTree(tree: string): Promise<FileSnapshot[]> {
    const result = await this.git(['ls-tree', '-rl', '-z', tree]);
    this.assertGit(result, 'list snapshot files');
    return result.stdout
      .split('\0')
      .filter(Boolean)
      .map((record) => {
        const match = /^(\d+)\s+\w+\s+([0-9a-f]+)\s+(-|\d+)\t([\s\S]+)$/u.exec(record);
        if (match === null) throw new Error(`Cannot parse Git tree record: ${record}`);
        return {
          mode: match[1] ?? '',
          objectId: match[2] ?? '',
          size: match[3] === '-' ? 0 : Number(match[3]),
          path: normalizeRepositoryPath(match[4] ?? ''),
        };
      });
  }

  async changesBetween(oldTree: string, newTree: string): Promise<FileChange[]> {
    const names = await this.git([
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      oldTree,
      newTree,
    ]);
    this.assertGit(names, 'compare snapshots');
    const descriptors = parseNameStatus(names.stdout);
    const changes: FileChange[] = [];

    for (const descriptor of descriptors) {
      const pathspecs = descriptor.oldPath
        ? [descriptor.oldPath, descriptor.path]
        : [descriptor.path];
      const [numstat, patch] = await Promise.all([
        this.git(['diff', '--numstat', oldTree, newTree, '--', ...pathspecs]),
        this.git([
          'diff',
          '--no-color',
          '--no-ext-diff',
          '--unified=3',
          oldTree,
          newTree,
          '--',
          ...pathspecs,
        ]),
      ]);
      this.assertGit(numstat, `read line statistics for ${descriptor.path}`);
      this.assertGit(patch, `read patch for ${descriptor.path}`);
      const stats = parseNumstat(numstat.stdout);
      const boundedPatch = truncateUtf8(patch.stdout, MAX_PATCH_BYTES_PER_FILE);
      changes.push({
        path: normalizeRepositoryPath(descriptor.path),
        ...(descriptor.oldPath === undefined
          ? {}
          : { oldPath: normalizeRepositoryPath(descriptor.oldPath) }),
        status: descriptor.status,
        additions: stats.additions,
        deletions: stats.deletions,
        binary: stats.binary,
        patch: boundedPatch.value,
        patchTruncated: boundedPatch.truncated,
        classification: 'OUT_OF_SCOPE',
        classificationReason: 'Not analyzed yet.',
        sensitive: false,
        testFile: false,
        dependencyFile: false,
      });
    }

    return changes;
  }

  async showFile(
    tree: string,
    filePath: string,
    maxBytes = 256 * 1024,
  ): Promise<string | null> {
    const result = await this.git(['show', `${tree}:${normalizeRepositoryPath(filePath)}`]);
    if (result.exitCode !== 0) return null;
    return truncateUtf8(result.stdout, maxBytes).value;
  }

  private async git(args: readonly string[], env?: NodeJS.ProcessEnv) {
    return runGitRaw(args, this.root, env);
  }

  private assertGit(
    result: Awaited<ReturnType<typeof runGitRaw>>,
    operation: string,
  ): void {
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || 'unknown Git error';
      throw new Error(`Unable to ${operation}: ${detail}`);
    }
  }
}

async function runGitRaw(args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return runProcess('git', args, {
    cwd,
    ...(env === undefined ? {} : { env }),
    timeoutMs: 120_000,
    maxOutputBytes: GIT_OUTPUT_LIMIT,
    redact: false,
  });
}

function parsePorcelainStatus(raw: string): RepositoryStatus {
  const status: RepositoryStatus = {
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  const records = raw.split('\0').filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length < 3) continue;
    const x = record[0] ?? ' ';
    const y = record[1] ?? ' ';
    const filePath = normalizeRepositoryPath(record.slice(3));
    if (x === '?' && y === '?') {
      status.untracked.push(filePath);
      continue;
    }
    if (x !== ' ' && x !== '?') status.staged.push(filePath);
    if (y !== ' ' && y !== '?') status.unstaged.push(filePath);
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      status.conflicted.push(filePath);
    }
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') index += 1;
  }
  return status;
}

type ChangeDescriptor = Pick<FileChange, 'path' | 'status'> & { oldPath?: string };

function parseNameStatus(raw: string): ChangeDescriptor[] {
  const fields = raw.split('\0').filter((field) => field !== '');
  const changes: ChangeDescriptor[] = [];
  for (let index = 0; index < fields.length;) {
    const code = fields[index++];
    if (code === undefined) break;
    const kind = code[0];
    if (kind === 'R' || kind === 'C') {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (oldPath === undefined || newPath === undefined)
        throw new Error('Malformed rename diff.');
      changes.push({ status: 'renamed', path: newPath, oldPath });
      continue;
    }
    const filePath = fields[index++];
    if (filePath === undefined) throw new Error('Malformed name-status diff.');
    const status =
      kind === 'A'
        ? 'added'
        : kind === 'M'
          ? 'modified'
          : kind === 'D'
            ? 'deleted'
            : 'type_changed';
    changes.push({ status, path: filePath });
  }
  return changes;
}

function parseNumstat(raw: string): {
  additions: number | null;
  deletions: number | null;
  binary: boolean;
} {
  const lines = raw.trim().split(/\r?\n/u).filter(Boolean);
  let additions = 0;
  let deletions = 0;
  let binary = false;
  for (const line of lines) {
    const [added, removed] = line.split('\t');
    if (added === '-' || removed === '-') {
      binary = true;
      continue;
    }
    additions += Number(added ?? 0);
    deletions += Number(removed ?? 0);
  }
  return {
    additions: binary && additions === 0 ? null : additions,
    deletions: binary && deletions === 0 ? null : deletions,
    binary,
  };
}
