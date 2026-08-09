import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { Command } from 'commander';
import { analyzeVerification } from '../analyzers/verification.js';
import { captureBaseline } from '../baseline/capture.js';
import { parseCommand } from '../checks/parse-command.js';
import { runChecks } from '../checks/runner.js';
import { loadConfig, type TaskWitnessConfig } from '../config/config.js';
import { generateTaskContract } from '../contract/generate.js';
import { TASKWITNESS_VERSION } from '../domain/constants.js';
import {
  VerificationReportSchema,
  type Baseline,
  type CheckDefinition,
  type CheckResult,
  type TaskContract,
  type Verdict,
  type VerificationReport,
} from '../domain/schemas.js';
import { GitRepository } from '../git/repository.js';
import { writeProofPack } from '../reports/proof-pack.js';
import { renderMarkdownReport } from '../reports/markdown.js';
import { renderTerminalReport } from '../reports/terminal.js';
import { initializeRepository } from '../session/init.js';
import { SessionStore } from '../session/store.js';
import { isNodeError, pathExists, readJson } from '../utils/fs.js';
import { shellDisplay } from '../utils/text.js';
import { confirm } from './prompt.js';
import { renderChecks, renderContract } from './presentation.js';

type StartOptions = {
  yes: boolean;
  baselineChecks: boolean;
};

type VerifyOptions = {
  yes: boolean;
  checks: boolean;
  check: string[];
  ai: boolean;
  json: boolean;
  markdown: boolean;
  html: boolean;
};

type ReportOptions = { json: boolean; markdown: boolean; html: boolean };

export async function runCli(argv: readonly string[]): Promise<void> {
  const program = new Command();
  program
    .name('taskwitness')
    .description('Evidence-backed completion reports for coding-agent work.')
    .version(TASKWITNESS_VERSION)
    .showSuggestionAfterError()
    .addHelpText(
      'after',
      [
        '',
        'Quick start:',
        '  taskwitness start "Add dark mode without changing existing behavior"',
        '  # Let your coding agent work, then:',
        '  taskwitness verify',
        '',
      ].join('\n'),
    );

  program
    .command('init')
    .description('Prepare configuration explicitly (start also does this automatically).')
    .action(async () => runInit());

  program
    .command('start')
    .description('Initialize, capture a baseline, and approve a Task Contract.')
    .argument('<task>', 'The concrete task given to a coding agent.')
    .option('-y, --yes', 'Approve the generated contract and detected checks.', false)
    .option('--no-baseline-checks', 'Do not run detected checks at baseline.')
    .action(async (task: string, options: StartOptions) => runStart(task, options));

  program
    .command('status')
    .description('Show the active session and current change count.')
    .action(async () => runStatus());

  program
    .command('verify')
    .description('Compare the repository to the baseline and create a Proof Pack.')
    .option('-y, --yes', 'Approve detected verification commands.', false)
    .option('--no-checks', 'Do not run detected or configured checks.')
    .option('--check <command>', 'Add a shell-free verification command.', collect, [])
    .option('--no-ai', 'Use deterministic analysis only (the Phase 1 default).')
    .option('--json', 'Print the machine-readable report to stdout.', false)
    .option('--markdown', 'Print the Markdown report to stdout.', false)
    .option('--html', 'Print the standalone HTML report path.', false)
    .action(async (options: VerifyOptions) => runVerify(options));

  program
    .command('report')
    .description('Render the latest Proof Pack again.')
    .option('--json', 'Print JSON.', false)
    .option('--markdown', 'Print Markdown.', false)
    .option('--html', 'Print the HTML report path.', false)
    .action(async (options: ReportOptions) => runReport(options));

  program
    .command('doctor')
    .description('Check the local environment and repository setup.')
    .action(async () => runDoctor());

  await program.parseAsync(argv, { from: 'node' });
}

async function runInit(): Promise<void> {
  const repository = await GitRepository.open(process.cwd());
  const result = await initializeRepository(repository.root);
  await repository.ensureRuntimeExcluded();
  console.log(pc.bold(pc.green('TaskWitness initialized.')));
  console.log(
    result.gitignoreUpdated
      ? '✓ Added .taskwitness/ to .gitignore'
      : '✓ .gitignore already configured',
  );
  console.log(
    result.configCreated ? '✓ Created .taskwitness.yml' : '✓ Configuration already exists',
  );
}

async function runStart(task: string, options: StartOptions): Promise<void> {
  const repository = await GitRepository.open(process.cwd());
  const store = new SessionStore(repository.root);
  const contract = generateTaskContract(task);
  console.log(renderContract(contract));
  if (contract.ambiguous) {
    process.exitCode = 2;
    return;
  }

  await guardExistingSession(store, options.yes);
  const approvedContract = await approveContract(contract, options.yes);
  const initResult = await initializeRepository(repository.root);
  await repository.ensureRuntimeExcluded();
  if (initResult.configCreated || initResult.gitignoreUpdated) {
    console.log(pc.green('✓ Repository prepared for TaskWitness.'));
    if (initResult.configCreated) console.log(`  Created .taskwitness.yml`);
    if (initResult.gitignoreUpdated) console.log(`  Added .taskwitness/ to .gitignore`);
    console.log('');
  }
  const config = await loadConfig(repository.root);
  const baseline = await captureBaseline(repository, config, []);
  let checkResults: CheckResult[] = [];
  if (options.baselineChecks && baseline.checks.length > 0) {
    const approvedChecks = await approveChecks(
      baseline.checks,
      config,
      options.yes,
      'Baseline',
    );
    checkResults = await executeChecks(approvedChecks, repository.root);
    const treeAfterChecks = await repository.createWorktreeTree();
    if (treeAfterChecks !== baseline.tree) {
      throw new Error(
        'A baseline check changed non-ignored repository files. Inspect those changes, then start again.',
      );
    }
  }
  const completeBaseline: Baseline = { ...baseline, checkResults };
  const session = await store.create(approvedContract, completeBaseline);

  console.log(pc.green('✓ Baseline captured.'));
  console.log(
    pc.dim(`  Tree ${session.baseline.tree.slice(0, 12)} · Session ${session.id}`),
  );
  console.log('');
  console.log('Now use Codex, Claude Code, Cursor, or any other coding tool.');
  console.log('When finished:');
  console.log('');
  console.log(`    ${pc.bold('taskwitness verify')}`);
  console.log('');
}

async function runStatus(): Promise<void> {
  const repository = await GitRepository.open(process.cwd());
  const store = new SessionStore(repository.root);
  const session = await store.active();
  assertSessionRepository(session.baseline.repositoryRoot, repository.root);
  const currentTree = await repository.createWorktreeTree();
  const changes = await repository.changesBetween(session.baseline.tree, currentTree);
  console.log(pc.bold(pc.cyan('TASKWITNESS STATUS')));
  console.log(pc.dim('─'.repeat(54)));
  console.log(`Session: ${session.id}`);
  console.log(`Task: ${session.contract.task}`);
  console.log(`Started: ${session.createdAt}`);
  console.log(
    `State: ${session.completedAt === null ? pc.yellow('ACTIVE') : pc.green('COMPLETED')}`,
  );
  console.log(`Changes since baseline: ${pc.bold(String(changes.length))} file(s)`);
}

async function runVerify(options: VerifyOptions): Promise<void> {
  const repository = await GitRepository.open(process.cwd());
  const config = await loadConfig(repository.root);
  const store = new SessionStore(repository.root);
  const session = await store.active();
  assertSessionRepository(session.baseline.repositoryRoot, repository.root);
  const verificationTree = await repository.createWorktreeTree();

  const customChecks = options.check.map((command, index) =>
    customCheck(command, index, config),
  );
  const availableChecks = options.checks
    ? mergeChecks(session.baseline.checks, customChecks)
    : [];
  const approvedChecks = await approveChecks(
    availableChecks,
    config,
    options.yes,
    'Verification',
  );
  const checkResults = await executeChecks(approvedChecks, repository.root);
  if (approvedChecks.length > 0) {
    const treeAfterChecks = await repository.createWorktreeTree();
    if (treeAfterChecks !== verificationTree) {
      throw new Error(
        'A verification check changed non-ignored repository files. No report was created; inspect the changes and verify again.',
      );
    }
  }

  const report = await analyzeVerification(
    session,
    repository,
    verificationTree,
    checkResults,
    config,
  );
  const paths = await writeProofPack(report, store.reportDirectory(session.id));
  await store.complete(session);

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (options.markdown) console.log(renderMarkdownReport(report));
  else if (options.html) console.log(paths.html);
  else console.log(renderTerminalReport(report));
  process.exitCode = exitCodeForVerdict(report.verdict);
}

export function exitCodeForVerdict(verdict: Verdict): 0 | 1 | 2 {
  if (verdict === 'VERIFIED') return 0;
  if (verdict === 'VERIFICATION_FAILED') return 1;
  return 2;
}

async function runReport(options: ReportOptions): Promise<void> {
  const repository = await GitRepository.open(process.cwd());
  const store = new SessionStore(repository.root);
  const session = await store.active();
  const reportPath = path.join(store.reportDirectory(session.id), 'report.json');
  let report: VerificationReport;
  try {
    report = await readJson(reportPath, VerificationReportSchema);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(
        'No report exists for the active session. Run taskwitness verify first.',
        { cause: error },
      );
    }
    throw error;
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (options.markdown) console.log(renderMarkdownReport(report));
  else if (options.html)
    console.log(path.join(store.reportDirectory(session.id), 'report.html'));
  else console.log(renderTerminalReport(report));
}

async function runDoctor(): Promise<void> {
  console.log(pc.bold(pc.cyan('TASKWITNESS DOCTOR')));
  console.log(pc.dim('─'.repeat(54)));
  console.log(`✓ Node.js ${process.version}`);
  try {
    const repository = await GitRepository.open(process.cwd());
    console.log(`✓ Git repository ${repository.root}`);
    const initialized = await pathExists(path.join(repository.root, '.taskwitness.yml'));
    const config = await loadConfig(repository.root);
    console.log(
      initialized
        ? '✓ Configuration valid'
        : '○ No .taskwitness.yml yet (start will create it automatically)',
    );
    const baseline = await captureBaseline(repository, config, []);
    console.log(`✓ Snapshot capture ${baseline.tree.slice(0, 12)}`);
    if (baseline.checks.length === 0) console.log('○ No Node.js or Python checks detected');
    else for (const check of baseline.checks) console.log(`✓ Detected ${check.command}`);
    const store = new SessionStore(repository.root);
    console.log(
      (await store.hasActiveSession()) ? '✓ Active session found' : '○ No active session',
    );
  } catch (error) {
    console.log(pc.red(`✕ ${formatError(error)}`));
    process.exitCode = 1;
  }
}

async function approveContract(
  contract: TaskContract,
  yes: boolean,
): Promise<TaskContract> {
  const approved = yes || (await confirm('Approve this Task Contract?', true));
  if (!approved)
    throw new Error('Task Contract was not approved. Re-run start with a clearer task.');
  return { ...contract, approvedAt: new Date().toISOString() };
}

async function approveChecks(
  checks: readonly CheckDefinition[],
  config: TaskWitnessConfig,
  yes: boolean,
  phase: string,
): Promise<CheckDefinition[]> {
  if (checks.length === 0) return [];
  const allTrusted = checks.every((check) => config.trustedChecks.includes(check.command));
  if (yes || allTrusted) return [...checks];
  console.log(renderChecks(checks, phase));
  return (await confirm(`Run ${checks.length} ${phase.toLowerCase()} check(s)?`, true))
    ? [...checks]
    : [];
}

async function executeChecks(
  checks: readonly CheckDefinition[],
  repositoryRoot: string,
): Promise<CheckResult[]> {
  return runChecks(checks, repositoryRoot, {
    onStart: (check) => console.log(`${pc.cyan('›')} Running ${check.command}`),
    onFinish: (_check, result) => {
      const marker = result.status === 'passed' ? pc.green('✓') : pc.red('✕');
      console.log(`${marker} ${result.label}: ${result.status} (${result.durationMs} ms)`);
    },
  });
}

async function guardExistingSession(store: SessionStore, yes: boolean): Promise<void> {
  if (!(await store.hasActiveSession())) return;
  const active = await store.active();
  if (active.completedAt !== null) return;
  const replace =
    yes ||
    (await confirm(`Session ${active.id} is still active. Start a new session?`, false));
  if (!replace) throw new Error('The existing session remains active.');
}

function customCheck(
  command: string,
  index: number,
  config: TaskWitnessConfig,
): CheckDefinition {
  const parsed = parseCommand(command);
  return {
    id: `custom-${index + 1}`,
    label: `Custom check ${index + 1}`,
    category: 'custom',
    executable: parsed.executable,
    args: parsed.args,
    command: shellDisplay(parsed.executable, parsed.args),
    source: 'user',
    timeoutMs: config.checkTimeoutMs,
  };
}

function mergeChecks(
  detected: readonly CheckDefinition[],
  custom: readonly CheckDefinition[],
): CheckDefinition[] {
  const seen = new Set<string>();
  return [...detected, ...custom].filter((check) => {
    if (seen.has(check.command)) return false;
    seen.add(check.command);
    return true;
  });
}

function assertSessionRepository(expected: string, actual: string): void {
  if (path.resolve(expected) !== path.resolve(actual)) {
    throw new Error('The active session belongs to a different repository.');
  }
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readReportFile(filePath: string): Promise<VerificationReport> {
  const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  return VerificationReportSchema.parse(raw);
}
