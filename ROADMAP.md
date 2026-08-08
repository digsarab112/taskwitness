# TaskWitness roadmap

TaskWitness will grow by making evidence stronger, execution safer, and reports easier to use—while
keeping the core CLI local-first and agent-agnostic.

## Now: trustworthy local verification

- Harden cross-platform Git and process behavior.
- Expand adversarial fixtures for weakened tests, hidden regressions, and scope drift.
- Improve requirement-to-evidence explanations without inflating confidence.
- Keep the Proof Pack schema stable and documented.

## Next: independent behavioral evidence

- Add Playwright evidence for browser-visible behavior.
- Add HTTP/API probes with explicit targets and redaction.
- Introduce an isolated Docker/devcontainer runner for approved checks.
- Render concise verification summaries in pull requests.

## Later: portable trust

- Sign Proof Packs and publish a verification format specification.
- Add schema-constrained provider adapters, including local models.
- Support organization policy profiles and reusable verification recipes.
- Add deeper dependency and test-strength analysis.

## Non-goals

The core CLI will not require a hosted dashboard, account, blockchain, proprietary agent, or source
upload. TaskWitness will not turn a generic green build into proof of a specific behavior.

## Help shape the order

Open or vote on a [roadmap issue](https://github.com/digsarab112/taskwitness/labels/roadmap), or start
a [Discussion](https://github.com/digsarab112/taskwitness/discussions) with a concrete workflow and
the evidence it needs. Small, independently testable adapters make especially good first
contributions.
