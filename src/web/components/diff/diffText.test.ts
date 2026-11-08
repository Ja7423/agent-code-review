import { describe, expect, it } from 'vitest';
import type { ThreadDto } from '../../../shared/types.ts';
import { threadsForFile, toExtendData, toUnifiedText, visibleLines } from './diffText.ts';

const hunk = ['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n');

const thread = (
  id: string,
  side: 'old' | 'new',
  endLine: number,
  isOutdated = false,
  path = 'f.ts',
): ThreadDto => ({
  id,
  status: 'open',
  availableActions: ['resolve'],
  comments: [],
  anchor: {
    view: { kind: 'merged' },
    path,
    side,
    startLine: endLine,
    endLine,
    isOutdated,
    originalSnippet: 'x',
  },
});

describe('toUnifiedText', () => {
  it('adds a git header, using /dev/null for a missing side', () => {
    expect(toUnifiedText({ oldPath: null, newPath: 'n.ts', hunks: ['@@ -0,0 +1 @@\n+x'] })).toBe(
      'diff --git a/n.ts b/n.ts\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1 @@\n+x\n',
    );
  });
});

describe('visibleLines', () => {
  it('numbers both sides of a hunk', () => {
    const visible = visibleLines([hunk]);
    expect([...visible.old]).toEqual([1, 2, 3]);
    expect([...visible.new]).toEqual([1, 2, 3]);
  });
});

describe('toExtendData', () => {
  it('places threads on their last line and lists the rest separately', () => {
    const threads = [
      thread('a', 'new', 2),
      thread('b', 'old', 2),
      thread('c', 'new', 2),
      thread('d', 'new', 40),
      thread('e', 'new', 1, true),
    ];
    const placement = toExtendData(threads, [hunk]);
    expect(placement.extendData.newFile['2']?.data.map((t) => t.id)).toEqual(['a', 'c']);
    expect(placement.extendData.oldFile['2']?.data.map((t) => t.id)).toEqual(['b']);
    expect(placement.unplaced.map((t) => t.id)).toEqual(['d', 'e']);
  });
});

describe('threadsForFile', () => {
  it('matches old-side threads on the old path of a rename', () => {
    const threads = [
      thread('a', 'old', 1, false, 'old.ts'),
      thread('b', 'new', 1, false, 'new.ts'),
      thread('c', 'new', 1, false, 'old.ts'),
    ];
    expect(threadsForFile(threads, { oldPath: 'old.ts', newPath: 'new.ts' }).map((t) => t.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
