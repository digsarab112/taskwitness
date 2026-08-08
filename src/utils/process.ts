import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { redactSecrets } from '../security/redact.js';
import { truncateUtf8 } from './text.js';

export type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  spawnError?: string;
};

export type ProcessOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  redact?: boolean;
};

export async function runProcess(
  executable: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  const started = performance.now();
  const platformExecutable = resolvePlatformExecutable(executable);

  return new Promise((resolve) => {
    const child = spawn(platformExecutable, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let spawnError: string | undefined;

    const collect = (
      chunks: Buffer[],
      chunk: Buffer,
      stream: 'stdout' | 'stderr',
    ): void => {
      const used = stream === 'stdout' ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, options.maxOutputBytes - used);
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (chunk.length > remaining) truncated = true;
      if (stream === 'stdout') stdoutBytes += Math.min(chunk.length, remaining);
      else stderrBytes += Math.min(chunk.length, remaining);
    };

    child.stdout.on('data', (chunk: Buffer) => collect(stdoutChunks, chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => collect(stderrChunks, chunk, 'stderr'));
    child.on('error', (error) => {
      spawnError = error.message;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, options.timeoutMs);
    timer.unref();

    child.on('close', (code) => {
      clearTimeout(timer);
      const rawStdout = Buffer.concat(stdoutChunks).toString('utf8');
      const rawStderr = Buffer.concat(stderrChunks).toString('utf8');
      const stdout = options.redact === false ? rawStdout : redactSecrets(rawStdout).text;
      const stderr = options.redact === false ? rawStderr : redactSecrets(rawStderr).text;
      const boundedStdout = truncateUtf8(stdout, options.maxOutputBytes);
      const boundedStderr = truncateUtf8(stderr, options.maxOutputBytes);
      const result: ProcessResult = {
        exitCode: code,
        stdout: boundedStdout.value,
        stderr: boundedStderr.value,
        durationMs: Math.round(performance.now() - started),
        timedOut,
        truncated: truncated || boundedStdout.truncated || boundedStderr.truncated,
      };
      if (spawnError !== undefined) result.spawnError = spawnError;
      resolve(result);
    });
  });
}

function resolvePlatformExecutable(executable: string): string {
  if (
    process.platform === 'win32' &&
    ['npm', 'npx', 'pnpm', 'yarn', 'bun'].includes(executable.toLowerCase())
  ) {
    return `${executable}.cmd`;
  }
  return executable;
}
