import type { ViewRef } from './types.ts';

const SHA_PATTERN = /^[0-9a-f]{7,64}$/;

/** Serializes a view for URLs and query strings: `merged`, `worktree`, `commit:<sha>`. */
export function formatViewRef(view: ViewRef): string {
  return view.kind === 'commit' ? `commit:${view.sha}` : view.kind;
}

export function parseViewRef(raw: string): ViewRef | null {
  if (raw === 'merged' || raw === 'worktree') return { kind: raw };
  if (!raw.startsWith('commit:')) return null;
  const sha = raw.slice('commit:'.length);
  return SHA_PATTERN.test(sha) ? { kind: 'commit', sha } : null;
}

export function isSameView(a: ViewRef, b: ViewRef): boolean {
  return formatViewRef(a) === formatViewRef(b);
}

/** Views compared against the working tree, whose comments can become outdated. */
export function isLiveView(view: ViewRef): boolean {
  return view.kind !== 'commit';
}
