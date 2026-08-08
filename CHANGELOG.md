# Changelog

All notable changes are documented here. The project follows Semantic Versioning before and after
1.0, with the usual allowance that `0.x` releases may refine public APIs.

## [Unreleased]

### Planned

- Isolated check runners.
- Behavioral browser/API evidence adapters.
- GitHub Action and pull-request reporting.

## [0.1.0] - 2026-08-08

### Added

- `init`, `start`, `status`, `verify`, `report`, and `doctor` CLI commands.
- Deterministic Task Contracts with ambiguity rejection.
- Dirty-working-tree baselines backed by immutable Git trees.
- Node.js and Python check detection with explicit approval, timeouts, output caps, and redaction.
- Baseline regression comparison and changed pre-existing test warnings.
- Conservative scope and sensitive-change classification.
- Evidence records with stable IDs and proof-strength enforcement.
- Terminal, JSON, Markdown, and standalone HTML Proof Packs.
- Cross-platform process/path handling and disposable Git integration fixtures.
- A reproducible adversarial demo and local-first security model.
