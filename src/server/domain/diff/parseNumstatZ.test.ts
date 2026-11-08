import { describe, expect, it } from 'vitest';
import { isRenameEntry, parseNumstatZ } from './parseNumstatZ.ts';

describe('parseNumstatZ', () => {
  it('parses regular entries', () => {
    expect(parseNumstatZ('3\t1\tsrc/a.ts\x0010\t0\tREADME.md\0')).toEqual([
      { oldPath: 'src/a.ts', newPath: 'src/a.ts', additions: 3, deletions: 1 },
      { oldPath: 'README.md', newPath: 'README.md', additions: 10, deletions: 0 },
    ]);
  });

  it('parses renames as two NUL-separated paths', () => {
    const [entry] = parseNumstatZ('0\t0\t\0old name.ts\0new name.ts\0');
    expect(entry).toEqual({ oldPath: 'old name.ts', newPath: 'new name.ts', additions: 0, deletions: 0 });
    expect(entry && isRenameEntry(entry)).toBe(true);
  });

  it('reports binary files with null counts', () => {
    expect(parseNumstatZ('-\t-\timg.png\0')).toEqual([
      { oldPath: 'img.png', newPath: 'img.png', additions: null, deletions: null },
    ]);
  });

  it('keeps tabs, newlines and non-ASCII characters in paths', () => {
    const raw = '1\t0\twith\ttab.txt\x002\t0\tline\nbreak.txt\x001\t1\t中文 檔名.md\0';
    expect(parseNumstatZ(raw).map((entry) => entry.newPath)).toEqual([
      'with\ttab.txt',
      'line\nbreak.txt',
      '中文 檔名.md',
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseNumstatZ('')).toEqual([]);
  });
});
