import { createInterface } from 'node:readline/promises';

export async function confirm(message: string, defaultYes: boolean): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Interactive approval is required. Re-run with --yes in non-interactive use.',
    );
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await readline.question(`${message}${suffix}`)).trim().toLowerCase();
    if (answer === '') return defaultYes;
    return answer === 'y' || answer === 'yes';
  } finally {
    readline.close();
  }
}
