import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('npm publication is keyless OIDC-only and carries provenance', async () => {
  const workflow = await readFile('.github/workflows/publish.yml', 'utf8');

  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(workflow, /npm publish taskwitness-\*\.tgz --access public --provenance/);
  assert.match(workflow, /gh attestation verify taskwitness-\*\.tgz/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  assert.doesNotMatch(workflow, /registry-url:/);
});

test('GitHub Releases explicitly dispatch npm publication', async () => {
  const workflow = await readFile('.github/workflows/release.yml', 'utf8');

  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /gh workflow run publish\.yml --ref main --field tag=/);
});
