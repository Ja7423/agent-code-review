import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempRepo, lines } from '../../../test/helpers/tempRepo.ts';
import type { TempRepo } from '../../../test/helpers/tempRepo.ts';
import { ExecGitClient } from '../adapters/git/GitClient.ts';
import { FsWorkingTreeReader } from '../adapters/fs/WorkingTreeReader.ts';
import { DiffService } from './DiffService.ts';
import { RepoContext } from './RepoContext.ts';

let repo: TempRepo;
let service: DiffService;
let context: RepoContext;
const shas: Record<string, string> = {};

function buildRepo(): void {
  repo = createTempRepo();
  repo.write('a.ts', lines('one', 'two', 'three'));
  repo.write('rename-me.ts', lines('alpha', 'beta', 'gamma', 'delta', 'epsilon'));
  repo.write('delete-me.txt', lines('bye'));
  shas.root = repo.commit('base');
  repo.git('checkout', '-q', '-b', 'feat');
  repo.write('a.ts', lines('one', 'TWO', 'three'));
  repo.write('img.bin', new Uint8Array([0, 1, 2, 0, 255]));
  shas.first = repo.commit('edit a and add binary');
  repo.git('mv', 'rename-me.ts', 'renamed.ts');
  repo.git('rm', '-q', 'delete-me.txt');
  shas.second = repo.commit('rename and delete');
  repo.git('checkout', '-q', '-b', 'side', shas.root);
  repo.write('side.txt', lines('from side'));
  repo.commit('side work');
  repo.git('checkout', '-q', 'feat');
  repo.git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  shas.merge = repo.git('rev-parse', 'HEAD').trim();
  repo.write('a.ts', lines('one', 'TWO', 'three', 'four'));
  repo.write('notes with space.md', lines('untracked', 'file'));
  repo.write('.gitignore', lines('ignored.log'));
  repo.write('ignored.log', 'x');
}

beforeAll(async () => {
  buildRepo();
  const git = new ExecGitClient(repo.root);
  context = await RepoContext.load(git);
  service = new DiffService({
    git,
    context,
    files: new FsWorkingTreeReader(repo.root),
    limits: { largeFileChangedLines: 1500, maxUntrackedFiles: 200 },
  });
});

afterAll(() => repo.cleanup());

describe('RepoContext', () => {
  it('detects main as the base and computes the merge-base', () => {
    const snapshot = context.current();
    expect(snapshot).toMatchObject({
      branch: 'feat',
      baseRef: 'main',
      mergeBaseSha: shas.root,
      worktreePath: repo.root,
    });
  });
});

describe('DiffService', () => {
  it('lists the branch commits newest first, with parents', async () => {
    const commits = await service.listCommits();
    // Commits made within one second have equal dates, so only the newest one has a fixed position.
    expect(commits[0]?.subject).toBe('merge side');
    expect(commits[0]?.parents).toHaveLength(2);
    expect(commits.map((c) => c.subject).sort()).toEqual(
      ['edit a and add binary', 'merge side', 'rename and delete', 'side work'].sort(),
    );
  });

  it('shows committed, uncommitted and untracked changes in the merged view', async () => {
    const { files, isUntrackedTruncated } = await service.listFiles({ kind: 'merged' });
    expect(isUntrackedTruncated).toBe(false);
    const byPath = Object.fromEntries(files.map((f) => [f.newPath ?? f.oldPath, f]));
    expect(byPath['a.ts']).toMatchObject({ status: 'modified', additions: 2, deletions: 1 });
    expect(byPath['img.bin']).toMatchObject({ status: 'added', isBinary: true });
    expect(byPath['renamed.ts']).toMatchObject({ status: 'renamed', oldPath: 'rename-me.ts' });
    expect(byPath['delete-me.txt']).toMatchObject({ status: 'deleted', newPath: null });
    expect(byPath['side.txt']).toMatchObject({ status: 'added' });
    expect(byPath['notes with space.md']).toMatchObject({ status: 'untracked', additions: 2 });
    expect(byPath['.gitignore']).toMatchObject({ status: 'untracked' });
    expect(byPath['ignored.log']).toBeUndefined();
  });

  it('shows only uncommitted and untracked changes in the worktree view', async () => {
    const { files } = await service.listFiles({ kind: 'worktree' });
    expect(files.map((f) => f.newPath).sort()).toEqual(['.gitignore', 'a.ts', 'notes with space.md']);
  });

  it('diffs a commit against its parent', async () => {
    const { files } = await service.listFiles({ kind: 'commit', sha: shas.second ?? '' });
    expect(files.map((f) => [f.status, f.oldPath, f.newPath])).toEqual([
      ['deleted', 'delete-me.txt', null],
      ['renamed', 'rename-me.ts', 'renamed.ts'],
    ]);
  });

  it('diffs a merge commit against its first parent', async () => {
    const { files } = await service.listFiles({ kind: 'commit', sha: shas.merge ?? '' });
    expect(files.map((f) => f.newPath)).toEqual(['side.txt']);
  });

  it('diffs a root commit against the empty tree', async () => {
    const { files } = await service.listFiles({ kind: 'commit', sha: shas.root ?? '' });
    expect(files.map((f) => f.status)).toEqual(['added', 'added', 'added']);
  });

  it('returns hunks for a modified file that match git diff', async () => {
    const diff = await service.getFileDiff({ kind: 'merged' }, 'a.ts');
    expect(diff.hunks).toEqual(['@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n three\n+four']);
  });

  it('keeps a rename as a rename when diffing one file', async () => {
    const diff = await service.getFileDiff({ kind: 'commit', sha: shas.second ?? '' }, 'renamed.ts');
    expect(diff).toMatchObject({ status: 'renamed', hunks: [] });
  });

  it('returns hunks for an untracked file', async () => {
    const diff = await service.getFileDiff({ kind: 'merged' }, 'notes with space.md');
    expect(diff.hunks).toEqual(['@@ -0,0 +1,2 @@\n+untracked\n+file']);
  });

  it('refuses files that are not in the diff', async () => {
    await expect(service.getFileDiff({ kind: 'merged' }, '../etc/passwd')).rejects.toThrow(
      'not part of this diff',
    );
  });

  it('reads both sides of a view', async () => {
    expect(await service.readFileLines({ kind: 'merged' }, 'new', 'a.ts')).toEqual([
      'one',
      'TWO',
      'three',
      'four',
    ]);
    expect(await service.readFileLines({ kind: 'merged' }, 'old', 'a.ts')).toEqual(['one', 'two', 'three']);
    expect(await service.readFileLines({ kind: 'commit', sha: shas.first ?? '' }, 'new', 'a.ts')).toEqual([
      'one',
      'TWO',
      'three',
    ]);
    expect(await service.readFileLines({ kind: 'merged' }, 'new', 'delete-me.txt')).toBeNull();
  });

  it('changes the fingerprint when an untracked file is edited', async () => {
    const before = await service.fingerprint();
    expect(await service.fingerprint()).toBe(before);
    repo.write('notes with space.md', lines('untracked', 'file', 'more'));
    expect(await service.fingerprint()).not.toBe(before);
  });
});
