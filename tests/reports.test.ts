import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { VerificationReport } from '../src/domain/schemas.js';
import { renderHtmlReport } from '../src/reports/html.js';
import { writeProofPack } from '../src/reports/proof-pack.js';

describe('Proof Pack renderers', () => {
  let output: string | undefined;
  afterEach(async () => {
    if (output !== undefined) await rm(output, { recursive: true, force: true });
  });

  it('escapes repository-controlled HTML and uses no external backend', () => {
    const html = renderHtmlReport(sampleReport());
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.match(html, /color-scheme/u);
    assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/u);
    assert.ok(!html.includes('<script'));
  });

  it('writes every portable report format', async () => {
    output = await mkdtemp(path.join(tmpdir(), 'taskwitness-report-'));
    const paths = await writeProofPack(sampleReport(), output);
    const files = await Promise.all(
      [
        paths.json,
        paths.markdown,
        paths.html,
        paths.evidence,
        paths.metadata,
        paths.terminal,
      ].map((filePath) => readFile(filePath, 'utf8')),
    );
    assert.equal(files.length, 6);
    assert.ok(files.every((content) => content.length > 20));
    assert.match(files[1] ?? '', /TaskWitness Report/u);
  });
});

function sampleReport(): VerificationReport {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    reportId: 'report-fixture',
    sessionId: 'session-fixture',
    task: 'Add <script>alert(1)</script> safely',
    verdict: 'INSUFFICIENT_EVIDENCE',
    verdictReasons: ['Static evidence is not behavioral proof.'],
    requirements: [
      {
        requirementId: 'R1',
        text: 'Feature must exist.',
        status: 'SUPPORTED',
        strength: 1,
        evidenceIds: ['EV-001'],
        explanation: 'A file exists.',
      },
    ],
    changes: [
      {
        path: 'src/<script>.ts',
        status: 'added',
        additions: 1,
        deletions: 0,
        binary: false,
        patch: '+export const safe = true;',
        patchTruncated: false,
        classification: 'EXPECTED',
        classificationReason: 'Related.',
        sensitive: false,
        testFile: false,
        dependencyFile: false,
      },
    ],
    changeSummary: {
      filesChanged: 1,
      added: 1,
      modified: 0,
      deleted: 0,
      renamed: 0,
      additions: 1,
      deletions: 0,
    },
    baselineChecks: [],
    verificationChecks: [],
    evidence: [
      {
        id: 'EV-001',
        type: 'file_change',
        source: 'git',
        result: 'informational',
        strength: 1,
        summary: 'src/<script>.ts added',
        details: {},
        relatedFiles: ['src/<script>.ts'],
        independent: true,
        createdAt: now,
      },
    ],
    warnings: [],
    generatedAt: now,
    taskWitnessVersion: '0.1.1',
    repository: {
      root: '/fixture',
      branchAtStart: 'main',
      headAtStart: 'abc',
      headAtVerify: 'abc',
      baselineTree: 'before',
      verificationTree: 'after',
    },
    limitations: ['This is a fixture.'],
  };
}
