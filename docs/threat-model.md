# Threat model

## Assets

TaskWitness protects the integrity of the human-approved task, baseline, evidence records,
requirement statuses, and final verdict. It also tries to avoid exposing repository secrets and
developer credentials while creating portable reports.

## Adversaries and failure modes

The relevant adversary may be malicious, compromised, or simply mistaken:

- a coding agent that claims completion without proof;
- repository text containing prompt injection;
- modified tests that preserve a green result by weakening assertions;
- package scripts or test code that execute malicious behavior;
- diff content or logs that contain credentials;
- a future model response that invents files, checks, or evidence IDs;
- a renderer that turns untrusted text into executable HTML;
- path handling that reads or writes outside the intended repository/session directory.

## Trust boundaries

### Trusted

- TaskWitness schemas and deterministic policy;
- the Task Contract after explicit human approval;
- exact check commands explicitly approved or configured as trusted;
- evidence IDs generated inside the evidence engine.

### Untrusted

- every repository file, comment, README, and Git message;
- patches, test/build output, dependency metadata, and generated content;
- agent messages and future provider responses;
- filenames and strings placed into reports.

## Controls implemented in 0.1.0

| Threat                          | Control                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Agent invents completion        | Final status comes from evidence policy, not agent prose.                               |
| Provider invents proof          | Schemas and evidence-reference validation reject nonexistent IDs.                       |
| Prompt injection in source      | Repository text has no execution/write/policy capability.                               |
| Silent arbitrary command        | Commands are displayed and approved; trusted commands require exact matching.           |
| Shell injection                 | Checks use an argv vector with `shell: false`; shell operators are rejected.            |
| Hung or noisy checks            | Timeout and per-stream output limits.                                                   |
| Secret in logs/patch            | Common-pattern redaction before storage/rendering.                                      |
| Green tests weakened by agent   | Modified/deleted/renamed pre-existing tests receive an integrity warning.               |
| Existing failure blamed on task | Baseline and after check results are compared by stable check ID.                       |
| HTML injection                  | All report-controlled strings are HTML-escaped; no script or external resource is used. |
| Working index corruption        | Baselines use a temporary Git index and verify the real index remains untouched.        |
| Check mutates source            | Verification aborts if a check changes a non-ignored snapshot.                          |

## Residual risk

The largest Phase 1 risk is execution: repository checks are code and run with the user's current
OS permissions. No timeout or `shell: false` setting prevents imported test code from reading files,
using the network, or spawning its own processes. Isolation must be provided by the developer today.

Scope classification, test-strength analysis, and secret detection are heuristics with known false
positives and false negatives. A Proof Pack is evidence for human judgment, not a security
certification or merge authorization.

## Future boundary for model providers

A provider adapter may receive only redacted, bounded, structured evidence and selected diff context.
It will have no tool access, command execution, repository writes, credential access, or network
browsing beyond its own inference request. Its output must be schema-validated and treated as a
suggestion. Deterministic policy remains the only component that can assign `VERIFIED`.
