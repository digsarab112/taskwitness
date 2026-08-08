import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GitRepository } from '../src/git/repository.js';
import { createTestRepository, type TestRepository } from './helpers/repository.js';

describe('Git snapshot adapter', () => {
  let fixture: TestRepository | undefined;
  afterEach(async () => fixture?.cleanup());

  it('compares working trees without changing the real index', async () => {
    fixture = await createTestRepository({
      'src/original.ts': 'export const value = 1;\n',
      'file with spaces.txt': 'before\n',
      'deleted.txt': 'remove me\n',
    });
    const repository = await GitRepository.open(fixture.root);
    const before = await repository.createWorktreeTree();
    await fixture.write('src/original.ts', 'export const value = 2;\n');
    await fixture.write('src/added.ts', 'export const added = true;\n');
    await fixture.remove('deleted.txt');
    await fixture.git('mv', 'file with spaces.txt', 'renamed file.txt');
    const stagedBefore = await fixture.git('diff', '--cached', '--name-only');
    const after = await repository.createWorktreeTree();
    const changes = await repository.changesBetween(before, after);
    const stagedAfter = await fixture.git('diff', '--cached', '--name-only');

    assert.equal(stagedAfter, stagedBefore);
    const byPath = new Map(changes.map((change) => [change.path, change]));
    assert.equal(byPath.get('src/original.ts')?.status, 'modified');
    assert.equal(byPath.get('src/added.ts')?.status, 'added');
    assert.equal(byPath.get('deleted.txt')?.status, 'deleted');
    assert.equal(byPath.get('renamed file.txt')?.status, 'renamed');
    assert.equal(byPath.get('src/original.ts')?.additions, 1);
  });

  it('captures dirty state as the baseline instead of blaming it later', async () => {
    fixture = await createTestRepository({ 'app.ts': 'const oldProblem = true;\n' });
    await fixture.write('app.ts', 'const oldProblem = false;\n');
    const repository = await GitRepository.open(fixture.root);
    const dirtyBaseline = await repository.createWorktreeTree();
    await fixture.write('feature.ts', 'export const feature = true;\n');
    const after = await repository.createWorktreeTree();
    const changes = await repository.changesBetween(dirtyBaseline, after);
    assert.deepEqual(
      changes.map((change) => change.path),
      ['feature.ts'],
    );
  });
});
