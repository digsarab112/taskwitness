# Security policy

TaskWitness is a security-adjacent developer tool. A misleading green result, leaked repository
secret, or unsafe execution path is treated as a security issue—not merely a UX bug.

## Supported versions

Until 1.0, security fixes are released for the latest `0.x` minor version only. Users should update
to the newest release before reporting a problem.

## Report a vulnerability

Use the private [Report a vulnerability](https://github.com/digsarab112/taskwitness/security/advisories/new)
security advisory form. Do not open a public issue containing exploit details, repository secrets,
or a working bypass.

Include:

- affected TaskWitness version and operating system;
- a minimal disposable repository or reproduction steps;
- the expected and actual trust/status decision;
- whether secrets or command execution were involved;
- any proposed mitigation.

The maintainers aim to acknowledge a report within five business days.

## Execution warning

Approved verification commands execute code from the repository. An AI-modified test, build script,
package lifecycle hook, compiler plugin, or imported module may be malicious. Phase 1 applies
approval, no-shell argv execution, timeouts, and output caps, but it is **not a sandbox**.

For untrusted repositories, use TaskWitness inside a disposable environment with:

- no production credentials;
- no mounted SSH agent or browser profile;
- a read-only or disposable network policy;
- a throwaway working copy;
- minimum filesystem permissions.

## Data handling

Version 0.1.0 is local-only and has no telemetry or external model adapter. Proof Packs contain file
names, diff-derived summaries, bounded patches in the report model, command names, and redacted
command output. Treat Proof Packs as potentially sensitive engineering artifacts.

Common credentials, authorization headers, private key blocks, and secret-bearing logs are redacted
heuristically. This cannot guarantee detection of every secret format. Review a Proof Pack before
posting it publicly.

## Security invariants

A patch that breaks any invariant is release-blocking:

1. Repository text is data and cannot modify TaskWitness policy.
2. No check runs silently unless its exact displayed command is configured as trusted.
3. Custom checks never invoke a shell or accept shell operators.
4. A `VERIFIED` finding references existing, independent evidence of strength 2 or 3.
5. Renderers validate the canonical report schema.
6. External provider suggestions, when added, cannot grant final status or command authority.
7. TaskWitness never reads or exposes arbitrary credential stores, SSH keys, browser cookies, or
   unrelated files outside the repository.
