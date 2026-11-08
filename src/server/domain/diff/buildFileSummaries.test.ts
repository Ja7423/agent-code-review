import { describe, expect, it } from 'vitest';
import { buildFileSummaries, isBinaryContent, parseNameStatusZ, splitLines } from './buildFileSummaries.ts';
import { parseNumstatZ } from './parseNumstatZ.ts';

const limits = { largeFileChangedLines: 10 };

describe('parseNameStatusZ', () => {
  it('parses single-path and rename entries', () => {
    expect(parseNameStatusZ('M\0a.ts\0A\0b.ts\0D\0c.ts\0R087\0old.ts\0new.ts\0')).toEqual([
      { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts' },
      { status: 'added', oldPath: null, newPath: 'b.ts' },
      { status: 'deleted', oldPath: 'c.ts', newPath: null },
      { status: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' },
    ]);
  });
});

describe('buildFileSummaries', () => {
  it('joins statuses with counts and sorts by path', () => {
    const summaries = buildFileSummaries({
      nameStatus: parseNameStatusZ('M\0z.ts\0A\0b.ts\0D\0c.ts\0R100\0old.ts\0new.ts\0'),
      numstat: parseNumstatZ('1\t1\tz.ts\x003\t0\tb.ts\x000\t2\tc.ts\x000\t0\t\0old.ts\0new.ts\0'),
      untracked: [],
      limits,
    });
    expect(summaries.map((s) => [s.status, s.oldPath, s.newPath, s.additions, s.deletions])).toEqual([
      ['added', null, 'b.ts', 3, 0],
      ['deleted', 'c.ts', null, 0, 2],
      ['renamed', 'old.ts', 'new.ts', 0, 0],
      ['modified', 'z.ts', 'z.ts', 1, 1],
    ]);
  });

  it('marks binary files, untracked files and large files', () => {
    const summaries = buildFileSummaries({
      nameStatus: parseNameStatusZ('M\0img.png\0M\0big.ts\0'),
      numstat: parseNumstatZ('-\t-\timg.png\x0011\t0\tbig.ts\0'),
      untracked: [
        { path: 'notes.md', isBinary: false, lineCount: 4 },
        { path: 'blob.bin', isBinary: true, lineCount: 0 },
      ],
      limits,
    });
    expect(summaries.find((s) => s.newPath === 'img.png')).toMatchObject({ isBinary: true, additions: 0 });
    expect(summaries.find((s) => s.newPath === 'big.ts')).toMatchObject({ isCollapsedByDefault: true });
    expect(summaries.find((s) => s.newPath === 'notes.md')).toMatchObject({
      status: 'untracked',
      oldPath: null,
      additions: 4,
      isCollapsedByDefault: false,
    });
    expect(summaries.find((s) => s.newPath === 'blob.bin')).toMatchObject({ isBinary: true, additions: 0 });
  });
});

describe('content helpers', () => {
  it('detects binary content by NUL bytes', () => {
    expect(isBinaryContent(new Uint8Array([104, 105]))).toBe(false);
    expect(isBinaryContent(new Uint8Array([104, 0, 105]))).toBe(true);
  });

  it('splits lines without a trailing empty line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
  });
});
