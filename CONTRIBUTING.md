# Contributing to TaskWitness

TaskWitness earns trust by being conservative, reproducible, and honest about uncertainty. A new
feature is valuable only if users can understand the underlying evidence and its limits.

## Set up

```bash
git clone https://github.com/digsarab112/taskwitness.git
cd taskwitness
npm ci
npm run check
```

Node.js 20+ and Git are required. The CI matrix covers macOS, Linux, and Windows.

## Before opening a pull request

```bash
npm run format
npm run check
npm run demo
npm pack --dry-run
```

Describe:

- the evidence or UX problem being solved;
- the trust boundary affected;
- the deterministic facts used;
- how unsupported `VERIFIED` output remains impossible;
- new false-positive and false-negative risks;
- tests added, including a broken/adversarial fixture when relevant.

## Design rules

- Keep repository content and command output untrusted.
- Prefer structured facts over sending more text to a model.
- Do not add shell execution for convenience.
- Do not run a newly detected command without approval.
- Do not call a generic passing build proof of a specific behavior.
- Preserve Windows paths and avoid POSIX-only process assumptions.
- Keep the report concise; detailed evidence belongs in the Proof Pack.
- Add dependencies only when their reliability outweighs the new supply-chain surface.

## Tests

Tests use the Node.js built-in test runner. Integration tests create real disposable Git repositories
and exercise snapshots, dirty baselines, renames, regressions, test integrity, redaction, and scope
classification.

Every new ecosystem adapter should include:

1. detection tests;
2. command construction tests without a shell;
3. baseline/after comparison tests;
4. Windows-safe path tests;
5. an honest unsupported-case test.

## License

By contributing, you agree that your contributions are licensed under Apache-2.0.

Participation is also governed by the project [Code of Conduct](CODE_OF_CONDUCT.md).
