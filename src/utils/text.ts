export function normalizeRepositoryPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function truncateUtf8(
  value: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { value, truncated: false };
  const suffix = '\n… output truncated by TaskWitness …\n';
  const suffixBytes = Buffer.byteLength(suffix);
  return {
    value: `${bytes.subarray(0, Math.max(0, maxBytes - suffixBytes)).toString('utf8')}${suffix}`,
    truncated: true,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function shellDisplay(executable: string, args: readonly string[]): string {
  return [executable, ...args]
    .map((part) => (/^[a-zA-Z0-9_./:@=-]+$/u.test(part) ? part : JSON.stringify(part)))
    .join(' ');
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
