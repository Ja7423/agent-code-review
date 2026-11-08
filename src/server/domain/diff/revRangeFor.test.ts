import { describe, expect, it } from 'vitest';
import { revRangeArgs, revRangeFor } from './revRangeFor.ts';

const parents: Record<string, string[]> = {
  aaaaaaa: ['bbbbbbb'],
  mmmmmmm: ['ppppppp', 'qqqqqqq'],
  rrrrrrr: [],
};

const ctx = {
  mergeBaseSha: 'basesha',
  emptyTreeSha: 'emptytree',
  parentsOf: (sha: string) => parents[sha] ?? [],
};

describe('revRangeFor', () => {
  it('compares the merge-base with the working tree for the merged view', () => {
    expect(revRangeFor({ kind: 'merged' }, ctx)).toEqual({ from: 'basesha', to: null });
  });

  it('compares HEAD with the working tree for uncommitted changes', () => {
    expect(revRangeFor({ kind: 'worktree' }, ctx)).toEqual({ from: 'HEAD', to: null });
  });

  it('compares a commit with its parent', () => {
    expect(revRangeFor({ kind: 'commit', sha: 'aaaaaaa' }, ctx)).toEqual({ from: 'bbbbbbb', to: 'aaaaaaa' });
  });

  it('uses the first parent of a merge commit', () => {
    expect(revRangeFor({ kind: 'commit', sha: 'mmmmmmm' }, ctx).from).toBe('ppppppp');
  });

  it('uses the empty tree for a root commit', () => {
    expect(revRangeFor({ kind: 'commit', sha: 'rrrrrrr' }, ctx)).toEqual({
      from: 'emptytree',
      to: 'rrrrrrr',
    });
  });
});

describe('revRangeArgs', () => {
  it('omits the second side for working-tree comparisons', () => {
    expect(revRangeArgs({ from: 'HEAD', to: null })).toEqual(['HEAD']);
    expect(revRangeArgs({ from: 'a', to: 'b' })).toEqual(['a', 'b']);
  });
});
