const UNSAFE_OUTSIDE_QUOTES = new Set([';', '&', '|', '>', '<', '`', '\n', '\r', '\0']);

export function parseCommand(command: string): { executable: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaping = false;

  for (const character of command.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\' && quote !== 'single') {
      escaping = true;
      continue;
    }

    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single';
      continue;
    }

    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      continue;
    }

    if (quote === null && UNSAFE_OUTSIDE_QUOTES.has(character)) {
      throw new Error(`Shell operator ${JSON.stringify(character)} is not allowed.`);
    }

    if (/\s/u.test(character) && quote === null) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping || quote !== null)
    throw new Error('Unterminated escape or quote in command.');
  if (current.length > 0) tokens.push(current);
  const [executable, ...args] = tokens;
  if (executable === undefined) throw new Error('Verification command cannot be empty.');
  return { executable, args };
}
