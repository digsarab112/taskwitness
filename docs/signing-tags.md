# Sign TaskWitness release tags

TaskWitness accepts a release tag only when it is annotated, cryptographically signed, marked
`Verified` by GitHub, and points to a commit contained in `main`. Never move a published tag; use a
new version if a release needs correction.

SSH signing is the simplest option on Windows. It requires Git 2.34 or newer. The private key stays
on the release maintainer's computer and must never be committed, uploaded as a repository secret,
or pasted into an issue or chat.

## One-time Windows setup

Open PowerShell and generate a dedicated Ed25519 signing key. Replace the email with an address
verified on the GitHub account that will create releases.

```powershell
$SigningKey = "$env:USERPROFILE\.ssh\taskwitness_signing"
ssh-keygen -t ed25519 -C "YOUR_VERIFIED_GITHUB_EMAIL" -f $SigningKey
Get-Content "$SigningKey.pub" | Set-Clipboard
```

Open [GitHub SSH and GPG key settings](https://github.com/settings/keys), choose **New SSH key**,
select **Signing Key**, and paste only the public key copied above. A dedicated signing key does not
need to be added as an authentication key.

Configure Git to use that public key for signatures:

```powershell
$SigningKeyPath = (Resolve-Path "$env:USERPROFILE\.ssh\taskwitness_signing.pub").Path.Replace('\','/')
git config --global user.name "digsarab112"
git config --global user.email "YOUR_VERIFIED_GITHUB_EMAIL"
git config --global gpg.format ssh
git config --global user.signingkey $SigningKeyPath
git config --global tag.gpgSign true
```

Configure local verification so `git tag --verify` can validate SSH signatures too:

```powershell
$AllowedSigners = "$env:USERPROFILE\.ssh\allowed_signers"
"YOUR_VERIFIED_GITHUB_EMAIL $(Get-Content "$env:USERPROFILE\.ssh\taskwitness_signing.pub")" |
  Set-Content -Encoding ascii $AllowedSigners
$AllowedSignersPath = (Resolve-Path $AllowedSigners).Path.Replace('\','/')
git config --global gpg.ssh.allowedSignersFile $AllowedSignersPath
```

Confirm the effective configuration without printing any private material:

```powershell
git --version
git config --global --get gpg.format
git config --global --get user.signingkey
git config --global --get tag.gpgSign
```

The expected values are Git 2.34 or newer, `ssh`, the `.pub` path, and `true`.

Test signing locally without publishing anything:

```powershell
git tag --sign taskwitness-signing-test --message "TaskWitness signing test" HEAD
git tag --verify taskwitness-signing-test
git tag --delete taskwitness-signing-test
```

The verification command must report a good SSH signature. Never push this disposable tag.

## Create the release tag

Do this only after CI is green and the first-publication `NPM_TOKEN` secret or npm Trusted
Publisher is ready. From a clean clone:

```powershell
git switch main
git pull --ff-only
npm ci
npm run check
npm run demo
git status --short
git tag --sign v0.1.1 --message "TaskWitness v0.1.1"
git tag --verify v0.1.1
git push origin v0.1.1
```

`git status --short` must print nothing. The push starts the GitHub Release workflow; that workflow
checks GitHub's own signature-verification result before it creates any release asset.

If signing fails before the tag is pushed, delete only the local tag and recreate it after fixing
the configuration:

```powershell
git tag --delete v0.1.1
```

If a bad tag has already been pushed or used by a release, do not move it. Increment the package
version and create a new signed tag instead.

## Existing v0.1.0 tag

`v0.1.0` is an annotated but unsigned historical tag. Leave it unchanged. The release workflow
now rejects unsigned tags, so `v0.1.1` and every later release must pass the signed-tag gate.
