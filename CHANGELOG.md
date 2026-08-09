# Changelog

All notable changes are documented here. The project follows Semantic Versioning before and after
1.0, with the usual allowance that `0.x` releases may refine public APIs.

## [Unreleased]

### Planned

- Isolated check runners.
- Behavioral browser/API evidence adapters.
- GitHub Action and pull-request reporting.

## [0.1.1] - 2026-08-09

### Changed

- Make `start` initialize TaskWitness automatically, reducing first use to one command.
- Migrate runtime validation to Zod 4 and the supported TypeScript 6 / ESLint 10 toolchain.
- Compile against Node.js 20 type definitions so newer runtime-only APIs cannot slip into builds.
- Set the minimum runtime to Node.js 20.19 and cover Node.js 26 in the cross-platform matrix.
- Keep compatible patch/minor dependency updates grouped while isolating or deferring intentional
  major-version migrations.
- Publish direct npm installation instructions and verifiable GitHub Release fallback steps.

### Fixed

- Run npm and other Windows `.cmd` launchers through a tested cross-platform process adapter.
- Return non-zero CLI exit codes for failed, review, and insufficient-evidence verdicts.
- Preserve Windows drive and UNC paths in custom verification commands.
- Use a clean full diff, passing approved checks, and no regression as negative evidence for
  general scope and safety constraints.
- Exercise the full adversarial CLI demo on every supported OS and Node.js CI combination.
- Test the packed, globally installed CLI end to end on every supported OS and Node.js CI entry.
- Embed a favicon in standalone HTML reports so opening a report makes no missing-file request.
- Lock Yarn and Bun package-manager detection down with portable command-display fixtures.

### Security

- Add npm Trusted Publishing/provenance workflow support, signed-tag enforcement, release SBOMs,
  and GitHub artifact attestations.
- Require release tags to come from `main` and publish SHA-256 checksums beside every release
  tarball and SBOM.

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
- A shell-independent test launcher for consistent CI behavior on Windows, macOS, and Linux.
- A reproducible adversarial demo and local-first security model.
