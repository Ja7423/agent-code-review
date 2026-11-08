import type { ViewRef } from '../../../shared/types.ts';

/** `to === null` means "compare against the working tree". */
export interface RevRange {
  from: string;
  to: string | null;
}

export interface RevRangeContext {
  mergeBaseSha: string;
  emptyTreeSha: string;
  parentsOf: (sha: string) => readonly string[];
}

export function revRangeFor(view: ViewRef, ctx: RevRangeContext): RevRange {
  switch (view.kind) {
    case 'merged':
      return { from: ctx.mergeBaseSha, to: null };
    case 'worktree':
      return { from: 'HEAD', to: null };
    case 'commit': {
      // Merge commits compare against their first parent, like GitHub; root commits against the empty tree.
      const firstParent = ctx.parentsOf(view.sha)[0];
      return { from: firstParent ?? ctx.emptyTreeSha, to: view.sha };
    }
  }
}

/** The git arguments that select the two sides of a range: `[from]` or `[from, to]`. */
export function revRangeArgs(range: RevRange): string[] {
  return range.to === null ? [range.from] : [range.from, range.to];
}
