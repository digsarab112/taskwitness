import path from 'node:path';
import type { VerificationReport } from '../domain/schemas.js';
import { VerificationReportSchema } from '../domain/schemas.js';
import { ensureDirectory, writeJsonAtomic, writeUtf8Atomic } from '../utils/fs.js';
import { renderHtmlReport } from './html.js';
import { renderMarkdownReport } from './markdown.js';
import { renderTerminalReport } from './terminal.js';

export type ProofPackPaths = {
  directory: string;
  json: string;
  markdown: string;
  html: string;
  evidence: string;
  metadata: string;
  terminal: string;
};

export async function writeProofPack(
  reportInput: VerificationReport,
  directory: string,
): Promise<ProofPackPaths> {
  const report = VerificationReportSchema.parse(reportInput);
  await ensureDirectory(directory);
  const paths: ProofPackPaths = {
    directory,
    json: path.join(directory, 'report.json'),
    markdown: path.join(directory, 'report.md'),
    html: path.join(directory, 'report.html'),
    evidence: path.join(directory, 'evidence.json'),
    metadata: path.join(directory, 'metadata.json'),
    terminal: path.join(directory, 'terminal.txt'),
  };
  await Promise.all([
    writeJsonAtomic(paths.json, report),
    writeUtf8Atomic(paths.markdown, renderMarkdownReport(report)),
    writeUtf8Atomic(paths.html, renderHtmlReport(report)),
    writeJsonAtomic(paths.evidence, { schemaVersion: 1, evidence: report.evidence }),
    writeJsonAtomic(paths.metadata, {
      schemaVersion: 1,
      reportId: report.reportId,
      sessionId: report.sessionId,
      generatedAt: report.generatedAt,
      taskWitnessVersion: report.taskWitnessVersion,
      repository: report.repository,
    }),
    writeUtf8Atomic(paths.terminal, renderTerminalReport(report, { color: false })),
  ]);
  return paths;
}
