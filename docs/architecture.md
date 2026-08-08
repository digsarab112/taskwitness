# TaskWitness Phase 1 architecture

TaskWitness is a local-first CLI that captures a repository before work begins, compares
that baseline with the finished working tree, runs only human-approved checks, and creates
an evidence-backed Proof Pack. Its central invariant is:

> No evidence = no green check.

## System shape

The CLI is an orchestration boundary, not a source of truth. Facts flow through small,
testable modules:

1. **Repository adapter** validates Git and creates immutable Git tree snapshots using a
   temporary index. This captures tracked, staged, unstaged, and untracked non-ignored files
   without changing the user's index or creating a commit.
2. **Session store** records the approved Task Contract, baseline metadata, detected checks,
   and baseline results under `.taskwitness/`.
3. **Check adapters** detect Node.js and Python checks. The runner executes a parsed argv array,
   only after approval, with a timeout and bounded/redacted output. Windows `.cmd` shims use an
   argv-aware launcher instead of raw command interpolation.
4. **Evidence engine** converts Git facts, check results, regressions, and integrity warnings
   into schema-validated evidence records with stable IDs.
5. **Analyzers** map deterministic evidence to requirements and classify scope drift. A
   provider may suggest interpretations in the future, but cannot create facts or choose a
   final verification status.
6. **Policy engine** enforces proof strength and derives requirement statuses and the overall
   verdict. It downgrades unsupported claims.
7. **Report renderers** consume one validated report model and emit terminal, JSON, Markdown,
   and standalone HTML. The portable report directory is the Proof Pack.

## Core schemas

The canonical Zod schemas live in `src/domain/schemas.ts`.

- `TaskContract`: task text, ambiguity state, 2–6 explicit requirements, approval metadata.
- `Baseline`: repository identity, HEAD/branch/status, Git tree, manifests, detected checks,
  and optional approved baseline results.
- `EvidenceRecord`: stable ID, type, source, strength (0–3), result, summary, related files,
  and structured details.
- `RequirementFinding`: requirement ID, policy-derived status, proof strength, and evidence IDs.
- `VerificationReport`: verdict, requirements, changes, checks, warnings, evidence, and metadata.

Every renderer validates the complete model before use. Evidence IDs must resolve. A finding
cannot be `VERIFIED` unless at least one referenced, uncompromised evidence record has strength
2 or 3. Level 1 can produce `SUPPORTED`, never `VERIFIED`.

## Verification semantics

| Status                  | Meaning                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `VERIFIED`              | Deterministic or runtime evidence directly exercises the requirement.                       |
| `SUPPORTED`             | Static changes support the requirement, but behavior was not directly proven.               |
| `UNVERIFIED`            | No relevant evidence is available.                                                          |
| `FAILED`                | Direct evidence contradicts the requirement or a relevant regression occurred.              |
| `HUMAN_REVIEW_REQUIRED` | Evidence exists, but risk, ambiguity, or compromised test independence prevents acceptance. |
| `NOT_APPLICABLE`        | The requirement was intentionally excluded with an explicit reason.                         |

Proof strength is separate from status:

- Level 0: no proof.
- Level 1: static implementation evidence.
- Level 2: deterministic check evidence.
- Level 3: behavioral/runtime evidence.

The Phase 1 CLI is intentionally conservative. A passing generic build supports the change but
does not prove a feature. A passing check can verify a requirement only when TaskWitness can
connect it to independent, relevant test evidence.

For negative scope and safety constraints, the complete baseline-to-verification Git diff is itself
relevant evidence: TaskWitness may verify the constraint only when every changed file is classified
as expected/supporting/beneficial, every approved check passes, and no baseline regression exists.
This does not prove semantic equivalence of unrelated runtime behavior.

## Verdict policy

- `VERIFICATION_FAILED`: a requirement failed or a new baseline regression was introduced.
- `NEEDS_REVIEW`: high-risk scope drift, modified/deleted pre-existing tests, or any human-review
  finding exists.
- `INSUFFICIENT_EVIDENCE`: no failure is proven, but one or more requirements remain supported or
  unverified.
- `VERIFIED`: every applicable requirement is verified and no blocking warning exists.

TaskWitness never prints “safe to merge.”

## Trust and threat boundaries

Trusted inputs are TaskWitness code, schemas, policy rules, and the human-approved Task Contract.
Repository files, diffs, Git messages, README text, comments, test output, and future provider
responses are untrusted data.

The reviewer boundary has no command execution or write authority. Before any future external
provider receives text, obvious secrets are redacted and content is size-limited. Redaction is
heuristic and is never described as perfect. `.env` files, private keys, common credentials,
binary files, generated directories, and oversized content are excluded from provider context.

Approved checks still execute repository code and are therefore dangerous. Phase 1 displays
commands, rejects shell operators, uses parsed argv, applies timeouts/output limits, and requires
approval unless the command is explicitly trusted in configuration. Isolation is future work.

## Phase 1 acceptance criteria

- Start and verify work in a real Git repository with no account or API key.
- Capture a dirty working tree accurately without changing the user's index.
- Produce and store a concise Task Contract, rejecting materially ambiguous tasks.
- Compare snapshots and report added, modified, deleted, and renamed files plus line counts.
- Detect baseline-to-after check regressions and avoid blaming existing failures.
- Warn when pre-existing tests are modified/deleted and when dependencies or sensitive areas
  change.
- Never render an unsupported `VERIFIED` claim.
- Generate terminal, JSON, Markdown, and standalone HTML reports in a Proof Pack.
- Support Node.js and Python check detection with a modular adapter interface.
- Pass unit/integration tests on supported Node versions and avoid shell/path assumptions.
- Include reproducible fixtures, a two-minute demo, security documentation, and honest limits.

## Explicit non-goals for Phase 1

TaskWitness does not sandbox untrusted code, prove semantic equivalence, perfectly detect weak
tests or secrets, automatically browse a UI, sign reports, upload source, gate merges, or replace
human review. Those capabilities belong to later phases only after the evidence core is reliable.
