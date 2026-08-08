const PRIVATE_KEY_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gu;

const INLINE_PATTERNS: readonly [RegExp, string][] = [
  [
    /(\b(?:authorization|proxy-authorization)\s*:\s*)(?:bearer|basic)\s+[^\s]+/giu,
    '$1[REDACTED]',
  ],
  [
    /(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*)["']?[^\s,"']+/giu,
    '$1[REDACTED]',
  ],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/gu, '[REDACTED_API_KEY]'],
  [/\bgh[opusr]_[A-Za-z0-9]{20,}\b/gu, '[REDACTED_GITHUB_TOKEN]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu, '[REDACTED_SLACK_TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/gu, '[REDACTED_AWS_KEY]'],
  [/(https?:\/\/[^\s/:]+:)[^@\s]+@/gu, '$1[REDACTED]@'],
];

export type RedactionResult = {
  text: string;
  redactions: number;
};

export function redactSecrets(input: string): RedactionResult {
  let redactions = 0;
  let text = input.replace(PRIVATE_KEY_PATTERN, () => {
    redactions += 1;
    return '[REDACTED_PRIVATE_KEY]';
  });

  for (const [pattern, replacement] of INLINE_PATTERNS) {
    text = text.replace(pattern, (...args: unknown[]) => {
      redactions += 1;
      const match = args[0];
      if (typeof match !== 'string') return replacement;
      return match.replace(pattern, replacement);
    });
  }

  return { text, redactions };
}

export function isSecretBearingPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replaceAll('\\', '/');
  return (
    /(^|\/)\.env(?:\.|$)/u.test(normalized) ||
    /(^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/u.test(normalized) ||
    /\.(?:pem|p12|pfx|key|keystore)$/u.test(normalized)
  );
}
