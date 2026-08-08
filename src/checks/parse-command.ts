const UNSAFE_OUTSIDE_QUOTES = new Set([';', '&', '|', '>', '<', '`', '\n', '\r', '\0']);

export function parseCommand(command: string): { executable: string; args: string[] } {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let tokenStarted = false;
  const input = command.trim();

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) continue;
    if (character === '\\' && quote !== 'single') {
      const next = input[index + 1];
      if (next !== undefined && isEscapable(next, quote)) {
        current += next;
        tokenStarted = true;
        index += 1;
      } else {
        // Backslashes are ordinary path characters on Windows. Preserve them
        // unless they unambiguously escape syntax understood by this parser.
        current += character;
        tokenStarted = true;
      }
      continue;
    }

    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single';
      tokenStarted = true;
      continue;
    }

    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      tokenStarted = true;
      continue;
    }

    if (quote === null && UNSAFE_OUTSIDE_QUOTES.has(character)) {
      throw new Error(`Shell operator ${JSON.stringify(character)} is not allowed.`);
    }

    if (/\s/u.test(character) && quote === null) {
      if (tokenStarted) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    current += character;
    tokenStarted = true;
  }

  if (quote !== null) throw new Error('Unterminated quote in command.');
  if (tokenStarted) tokens.push(current);
  const [executable, ...args] = tokens;
  if (executable === undefined || executable.length === 0) {
    throw new Error('Verification command cannot be empty.');
  }
  return { executable, args };
}

function isEscapable(character: string, quote: 'double' | null): boolean {
  if (quote === 'double') return character === '"';
  return (
    /\s/u.test(character) ||
    character === '"' ||
    character === "'" ||
    [';', '&', '|', '>', '<', '`'].includes(character)
  );
}
