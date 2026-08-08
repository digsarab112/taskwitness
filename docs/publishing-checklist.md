# Public release checklist

The GitHub source is public and technically verified. Complete every unchecked npm and signing
control before publishing the package to the npm registry.

## Blocking ownership items

- [x] Create the public GitHub repository and use `digsarab112/taskwitness` in package metadata and
      documentation.
- [ ] Reserve the unscoped `taskwitness` npm name. The public registry returned `E404 Not Found` on
      2026-08-08, which suggests no public package currently occupies it, but availability is not a
      reservation.
- [x] Enable GitHub private vulnerability reporting and link it from `SECURITY.md`.
- [x] Record `digsarab112` and TaskWitness contributors as the package maintainer identity.

## Release security

- [ ] Require npm two-factor authentication or configure npm trusted publishing with GitHub Actions.
- [x] Protect `main` with pull-request review, Code Owners, conversation resolution, CodeQL, and all
      nine cross-platform CI jobs.
- [x] Enable dependency update alerts and add automated Dependabot update configuration.
- [x] Review `npm pack --dry-run` and install the exact tarball in a clean directory.
- [x] Add a GitHub Release workflow that verifies a version tag and attaches the exact tarball.
- [ ] Configure npm trusted publishing and provenance before the first npm release.
- [ ] Create and push a signed `v0.1.0` tag after the release commit is final.

## Technical verification

```bash
npm ci
npm run check
npm run demo
npm pack --dry-run
```

The CI matrix is configured for Node.js 20, 22, and 24 on Linux, macOS, and Windows. Local execution
does not replace seeing all nine public CI jobs pass on the real repository.

- [x] Confirm all nine CI jobs and CodeQL pass on the public repository.

## Suggested first publication

```bash
npm login
npm publish --access public
git tag -s v0.1.0 -m "TaskWitness 0.1.0"
git push origin v0.1.0
```

Do not run these commands from an unreviewed working tree. Verify `npm whoami`, the package owner,
the tarball contents, and the final Git commit first.
