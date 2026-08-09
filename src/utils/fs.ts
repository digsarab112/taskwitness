import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { output, ZodType } from 'zod';

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'EISDIR') return true;
    if (isNodeError(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export async function writeUtf8Atomic(filePath: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeUtf8Atomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<TSchema extends ZodType>(
  filePath: string,
  schema: TSchema,
): Promise<output<TSchema>> {
  const raw: unknown = JSON.parse(await readUtf8(filePath));
  return schema.parse(raw);
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
