import path from 'node:path';
import { isDependencyFile } from '../baseline/capture.js';

const SENSITIVE_SEGMENTS = new Set([
  'auth',
  'authentication',
  'authorization',
  'permissions',
  'roles',
  'payments',
  'billing',
  'secrets',
  'credentials',
  'crypto',
  'cryptography',
  'migrations',
  'deploy',
  'deployment',
  'infrastructure',
  'firewall',
  'sessions',
]);

const SENSITIVE_FILES = new Set([
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'schema.sql',
  'security.yml',
  'security.yaml',
  'CODEOWNERS',
]);

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/');
  return (
    /(^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/u.test(normalized) ||
    /\.(?:test|spec)\.[a-z0-9]+$/u.test(normalized) ||
    /(?:^|\/)test_[^/]+\.py$/u.test(normalized) ||
    /(?:^|\/)[^/]+_test\.py$/u.test(normalized)
  );
}

export function isDependencyManifest(filePath: string): boolean {
  return isDependencyFile(filePath);
}

export function isDocumentationFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return (
    normalized.endsWith('.md') ||
    normalized.endsWith('.mdx') ||
    normalized.startsWith('docs/') ||
    normalized === 'readme'
  );
}

export function isConfigurationFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/');
  const base = path.posix.basename(normalized);
  return (
    normalized.startsWith('.github/workflows/') ||
    normalized.startsWith('.circleci/') ||
    base.startsWith('.') ||
    /\.(?:ya?ml|toml|ini|conf|config|properties)$/u.test(base) ||
    /(?:config|rc)\.(?:js|cjs|mjs|ts|json)$/u.test(base)
  );
}

export function isSensitivePath(
  filePath: string,
  customPatterns: readonly string[],
): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/');
  const segments = normalized.split('/');
  const base = segments.at(-1) ?? '';
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (SENSITIVE_FILES.has(base)) return true;
  if (normalized.startsWith('.github/workflows/')) return true;
  if (
    /\b(?:auth|password|permission|payment|secret|token|session|migration|deploy)\b/u.test(
      normalized,
    )
  ) {
    return true;
  }
  return customPatterns.some((pattern) => globMatches(normalized, pattern.toLowerCase()));
}

export function matchesIgnoredPath(filePath: string, patterns: readonly string[]): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/');
  return patterns.some((pattern) => globMatches(normalized, pattern.toLowerCase()));
}

function globMatches(value: string, glob: string): boolean {
  const normalized = glob.replaceAll('\\', '/').replace(/^\.\//u, '');
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character?.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') ?? '';
    }
  }
  source += '$';
  return new RegExp(source, 'u').test(value);
}
