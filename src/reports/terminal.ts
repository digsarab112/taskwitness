import { createColors } from 'picocolors';
import type {
  CheckResult,
  EvidenceRecord,
  VerificationReport,
  VerificationStatus,
  Verdict,
} from '../domain/schemas.js';

export function renderTerminalReport(
  report: VerificationReport,
  options: { color?: boolean } = {},
): string {
  const colorEnabled =
    options.color ?? (process.env.NO_COLOR === undefined && process.stdout.isTTY);
  const c = createColors(colorEnabled);
  const evidence = new Map(report.evidence.map((record) => [record.id, record]));
  const lines: string[] = [];
  const rule = c.dim('━'.repeat(58));
  const thinRule = c.dim('─'.repeat(58));

  lines.push('', c.bold(c.cyan('TASKWITNESS REPORT')), rule, '');
  lines.push(c.dim('TASK'), report.task, '');
  lines.push(c.dim('VERDICT'), verdictLabel(report.verdict, c), '');
  const verified = report.requirements.filter(
    (finding) => finding.status === 'VERIFIED',
  ).length;
  lines.push(
    `${c.bold(`${verified} / ${report.requirements.length}`)} requirements verified`,
    ...report.verdictReasons.map((reason) => `${c.dim('•')} ${reason}`),
    '',
  );

  lines.push(c.bold('REQUIREMENTS'), thinRule, '');
  for (const finding of report.requirements) {
    lines.push(
      `${statusLabel(finding.status, c)} ${c.bold(finding.requirementId)} ${finding.text}`,
      c.dim(finding.explanation),
    );
    const records = finding.evidenceIds
      .map((id) => evidence.get(id))
      .filter((record): record is EvidenceRecord => record !== undefined);
    if (records.length === 0) lines.push(c.dim('  Evidence: none'));
    else {
      lines.push(c.dim('  Evidence'));
      for (const record of records.slice(0, 5)) {
        lines.push(`  ${c.dim('•')} ${record.id} ${record.summary}`);
      }
      if (records.length > 5)
        lines.push(c.dim(`  • ${records.length - 5} more evidence records`));
    }
    lines.push('');
  }

  lines.push(c.bold('WHAT CHANGED'), thinRule, '');
  const summary = report.changeSummary;
  lines.push(
    `${summary.filesChanged} files  ${c.green(`+${summary.additions}`)}  ${c.red(`-${summary.deletions}`)}`,
    `${summary.added} added · ${summary.modified} modified · ${summary.deleted} deleted · ${summary.renamed} renamed`,
    '',
  );
  for (const change of report.changes.slice(0, 12)) {
    lines.push(
      `${changeMarker(change.classification, c)} ${change.path} ${c.dim(`(${change.status})`)}`,
    );
  }
  if (report.changes.length > 12)
    lines.push(c.dim(`… ${report.changes.length - 12} more files`));
  lines.push('');

  lines.push(c.bold('VERIFICATION'), thinRule, '');
  if (report.verificationChecks.length === 0) {
    lines.push(c.yellow('○ No verification commands were run.'), '');
  } else {
    for (const check of report.verificationChecks) lines.push(renderCheck(check, c));
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push(c.bold('WHAT NEEDS HUMAN ATTENTION'), thinRule, '');
    for (const warning of report.warnings) {
      const marker = warning.severity === 'high' ? c.red('🚨') : c.yellow('⚠');
      lines.push(`${marker} ${c.bold(warning.title)}`, warning.message);
      for (const file of warning.files.slice(0, 8)) lines.push(`  ${c.dim('•')} ${file}`);
      lines.push('');
    }
  }

  lines.push(c.bold('FINAL'), thinRule, '', finalLine(report.verdict, c), '');
  lines.push(c.dim(`Proof Pack: .taskwitness/reports/${report.sessionId}/`), '');
  return lines.join('\n');
}

type Colors = ReturnType<typeof createColors>;

function statusLabel(status: VerificationStatus, c: Colors): string {
  switch (status) {
    case 'VERIFIED':
      return c.green('✓ VERIFIED');
    case 'SUPPORTED':
      return c.cyan('◐ SUPPORTED');
    case 'UNVERIFIED':
      return c.yellow('○ UNVERIFIED');
    case 'FAILED':
      return c.red('✕ FAILED');
    case 'HUMAN_REVIEW_REQUIRED':
      return c.yellow('⚠ REVIEW REQUIRED');
    case 'NOT_APPLICABLE':
      return c.dim('– NOT APPLICABLE');
  }
}

function verdictLabel(verdict: Verdict, c: Colors): string {
  switch (verdict) {
    case 'VERIFIED':
      return c.bold(c.green('✓ VERIFIED'));
    case 'NEEDS_REVIEW':
      return c.bold(c.yellow('⚠ NEEDS REVIEW'));
    case 'VERIFICATION_FAILED':
      return c.bold(c.red('✕ VERIFICATION FAILED'));
    case 'INSUFFICIENT_EVIDENCE':
      return c.bold(c.yellow('○ INSUFFICIENT EVIDENCE'));
  }
}

function finalLine(verdict: Verdict, c: Colors): string {
  switch (verdict) {
    case 'VERIFIED':
      return c.green(
        'The evidence supports acceptance. Human engineering responsibility remains.',
      );
    case 'NEEDS_REVIEW':
      return c.yellow('The agent finished. TaskWitness found changes worth checking.');
    case 'VERIFICATION_FAILED':
      return c.red('NOT READY FOR ACCEPTANCE');
    case 'INSUFFICIENT_EVIDENCE':
      return c.yellow(
        'The implementation may exist, but the requested behavior was not proven.',
      );
  }
}

function renderCheck(check: CheckResult, c: Colors): string {
  const marker = check.status === 'passed' ? c.green('✓') : c.red('✕');
  const counts = check.counts;
  const details = counts
    ? [
        counts.passed === undefined ? '' : `${counts.passed} passed`,
        counts.failed === undefined ? '' : `${counts.failed} failed`,
        counts.skipped === undefined ? '' : `${counts.skipped} skipped`,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return `${marker} ${check.label} ${c.dim(check.command)}${details === '' ? '' : ` — ${details}`}`;
}

function changeMarker(classification: string, c: Colors): string {
  if (classification === 'HIGH_RISK_OUT_OF_SCOPE') return c.red('🚨');
  if (classification === 'OUT_OF_SCOPE') return c.yellow('⚠');
  if (classification === 'EXPECTED') return c.green('✓');
  return c.cyan('•');
}
