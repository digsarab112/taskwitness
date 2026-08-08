import pc from 'picocolors';
import type { CheckDefinition, TaskContract } from '../domain/schemas.js';

export function renderContract(contract: TaskContract): string {
  const lines = [
    '',
    pc.bold(pc.cyan('TASKWITNESS')),
    pc.dim('─'.repeat(54)),
    '',
    pc.dim('Task'),
    contract.task,
    '',
    pc.bold('Task Contract'),
    '',
  ];
  if (contract.ambiguous) {
    lines.push(pc.yellow('The task is too ambiguous to verify reliably.'), '');
    lines.push(...contract.ambiguityReasons.map((reason) => `${pc.dim('•')} ${reason}`));
    lines.push('', 'Please make the observable outcome more specific.', '');
    return lines.join('\n');
  }
  for (const requirement of contract.requirements) {
    lines.push(`${pc.bold(requirement.id)}  ${requirement.text}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderChecks(checks: readonly CheckDefinition[], phase: string): string {
  const lines = ['', pc.bold(`${phase} checks`), ''];
  for (const check of checks) lines.push(`${pc.green('›')} ${check.command}`);
  lines.push('', pc.yellow('These commands execute repository code.'), '');
  return lines.join('\n');
}
