import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { CONFIG_FILENAME, DEFAULT_CHECK_TIMEOUT_MS } from '../domain/constants.js';
import { isNodeError } from '../utils/fs.js';

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  trustedChecks: z.array(z.string()).default([]),
  ignoredPaths: z.array(z.string()).default([]),
  sensitivePaths: z.array(z.string()).default([]),
  checkTimeoutMs: z
    .number()
    .int()
    .positive()
    .max(1_800_000)
    .default(DEFAULT_CHECK_TIMEOUT_MS),
});

export type TaskWitnessConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(repositoryRoot: string): Promise<TaskWitnessConfig> {
  const configPath = path.join(repositoryRoot, CONFIG_FILENAME);
  try {
    const parsed: unknown = YAML.parse(await readFile(configPath, 'utf8'));
    return ConfigSchema.parse(parsed ?? {});
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return ConfigSchema.parse({});
    throw new Error(`Cannot load ${CONFIG_FILENAME}: ${formatError(error)}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
