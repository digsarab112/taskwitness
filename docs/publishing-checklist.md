# Public release checklist

Releases use two linked workflows:

1. A cryptographically signed tag runs `release.yml`, re-tests the package, creates a tarball and
   CycloneDX SBOM, attests the tarball, and publishes the GitHub Release.
2. `release.yml` explicitly dispatches `publish.yml` after creating the GitHub Release. The second
   workflow re-tests the exact tag, verifies its signature and GitHub attestation, and publishes
   that same tarball to npm with provenance. An explicit dispatch is required because events made
   with the repository `GITHUB_TOKEN` do not start another workflow automatically.

## One-time first publication

Trusted Publishing can only be configured after the package exists on npm. For the first release:

- [ ] Sign in to an npm account that has account-level 2FA enabled.
- [ ] Complete the one-time [SSH tag-signing setup](signing-tags.md) and verify its disposable test
      tag locally before preparing a release.
- [ ] Confirm `npm view taskwitness` still returns `E404` immediately before publishing.
- [ ] Create a short-lived granular npm access token allowed to publish the first version, with
      bypass 2FA enabled, and store it as the GitHub Actions secret `NPM_TOKEN`. Never paste it in
      an issue, pull request, command output, or chat.
- [ ] Merge the release commit only after all Linux, macOS, and Windows checks pass.
- [ ] Create and push the signed `v0.1.1` tag. GitHub must show the tag signature as **Verified**.
- [ ] Confirm the GitHub Release and npm publish workflows succeed and npm shows provenance.
- [ ] If publication must be recovered, dispatch `publish.yml` with the existing signed release
      tag; its security gates still require a published Release, a Verified tag, and a commit in
      `main`.

The temporary token is used only as registry authorization for the first publication. The
`id-token: write` permission and `--provenance` flag bind that publication to the GitHub workflow
and source commit.

## Switch to Trusted Publishing

Once `taskwitness` exists on npm, use npm CLI 11.15 or newer while interactively signed in:

```bash
npm install --global npm@11.19.0
npm login --auth-type=web
npm trust github taskwitness \
  --file publish.yml \
  --repo digsarab112/taskwitness \
  --allow-publish
```

Complete the npm 2FA challenge in the browser. Then:

- [ ] Run `npm trust list taskwitness` and confirm it names `digsarab112/taskwitness` and
      `publish.yml`.
- [ ] Delete the GitHub Actions secret `NPM_TOKEN`.
- [ ] In npm package settings, select **Require two-factor authentication and disallow tokens**.
- [ ] Keep only `npm publish` allowed for the trusted publisher; do not grant staged-publish access
      unless the release process intentionally adopts staging.

Future releases authenticate with short-lived GitHub OIDC credentials and automatically receive
npm provenance; no long-lived npm write token remains in GitHub.

## Every release

```bash
npm ci
npm run check
npm run demo
npm pack --dry-run
```

- [ ] Update `package.json`, `package-lock.json`, `TASKWITNESS_VERSION`, and `CHANGELOG.md` together.
- [ ] Verify a clean install of the packed tarball in a disposable directory.
- [ ] Wait for all required PR checks to pass.
- [ ] Create an annotated, cryptographically signed tag matching the package version exactly.
- [ ] Verify the npm provenance link, tarball, SBOM, and GitHub attestation after publication.
- [ ] Verify `SHA256SUMS` against the tarball and SBOM downloaded from the GitHub Release.
- [ ] Install from the public registry and smoke-test the executable:

```bash
npm install --global taskwitness@0.1.1
taskwitness --version
taskwitness doctor
```

Never move an existing release tag or reuse an npm version. If a release needs a fix, increment the
version and create a new signed tag.
