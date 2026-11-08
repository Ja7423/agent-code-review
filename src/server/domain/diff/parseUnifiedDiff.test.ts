import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './parseUnifiedDiff.ts';

const modified = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,3 @@',
  ' one',
  '-two',
  '+TWO',
  ' three',
  '@@ -10,2 +10,3 @@ function x() {',
  ' ten',
  '+ten and a half',
  ' eleven',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('parses a modified file with several hunks', () => {
    const [file] = parseUnifiedDiff(`${modified}\n`);
    expect(file).toMatchObject({
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      status: 'modified',
      isBinary: false,
      additions: 2,
      deletions: 1,
    });
    expect(file?.hunks).toHaveLength(2);
    expect(file?.hunks[1]?.startsWith('@@ -10,2 +10,3 @@')).toBe(true);
  });

  it('parses added and deleted files', () => {
    const raw = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..3b18e51',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      'index 3b18e51..0000000',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
    ].join('\n');
    const [added, deleted] = parseUnifiedDiff(raw);
    expect(added).toMatchObject({ oldPath: null, newPath: 'new.txt', status: 'added', additions: 1 });
    expect(deleted).toMatchObject({ oldPath: 'gone.txt', newPath: null, status: 'deleted', deletions: 1 });
  });

  it('parses a pure rename without hunks', () => {
    const raw = [
      'diff --git a/old name.ts b/new name.ts',
      'similarity index 100%',
      'rename from old name.ts',
      'rename to new name.ts',
    ].join('\n');
    expect(parseUnifiedDiff(raw)).toEqual([
      {
        oldPath: 'old name.ts',
        newPath: 'new name.ts',
        status: 'renamed',
        isBinary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
      },
    ]);
  });

  it('marks binary files', () => {
    const raw = [
      'diff --git a/img.png b/img.png',
      'index 1..2 100644',
      'Binary files a/img.png and b/img.png differ',
    ].join('\n');
    expect(parseUnifiedDiff(raw)[0]).toMatchObject({ newPath: 'img.png', isBinary: true, hunks: [] });
  });

  it('keeps the no-newline marker inside the hunk without counting it', () => {
    const raw = [
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '@@ -1 +1 @@',
      '-a',
      '\\ No newline at end of file',
      '+b',
      '\\ No newline at end of file',
    ].join('\n');
    const [file] = parseUnifiedDiff(raw);
    expect(file).toMatchObject({ additions: 1, deletions: 1 });
    expect(file?.hunks[0]?.split('\n')).toHaveLength(5);
  });

  it('decodes quoted paths with spaces, tabs and non-ASCII characters', () => {
    const raw = [
      'diff --git "a/sp ace\\ttab.txt" "b/sp ace\\ttab.txt"',
      '--- "a/sp ace\\ttab.txt"',
      '+++ "b/sp ace\\ttab.txt"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/\\344\\270\\255.md" "b/\\344\\270\\255.md"',
      'new file mode 100644',
      '--- /dev/null',
      '+++ "b/\\344\\270\\255.md"',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    expect(parseUnifiedDiff(raw).map((file) => file.newPath)).toEqual(['sp ace\ttab.txt', '中.md']);
  });

  it('treats a line that looks like a header inside a hunk as content', () => {
    const raw = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1,2 @@', ' a', '+--- not a header'].join(
      '\n',
    );
    expect(parseUnifiedDiff(raw)[0]).toMatchObject({ newPath: 'x', additions: 1 });
  });
});
