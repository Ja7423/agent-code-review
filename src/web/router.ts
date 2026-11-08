import { useCallback, useSyncExternalStore } from 'react';
import type { ViewRef } from '../shared/types.ts';

/** `/merged`, `/worktree`, `/commit/<sha>`; anything else is the merged view. */
export function viewFromPath(pathname: string): ViewRef {
  if (pathname === '/worktree') return { kind: 'worktree' };
  const commit = /^\/commit\/([0-9a-f]{7,64})$/.exec(pathname);
  if (commit?.[1]) return { kind: 'commit', sha: commit[1] };
  return { kind: 'merged' };
}

export function pathForView(view: ViewRef): string {
  return view.kind === 'commit' ? `/commit/${view.sha}` : `/${view.kind}`;
}

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};

/** A tiny router: the current view comes from the URL, and `navigate` pushes a new one. */
export function useView(): { view: ViewRef; navigate: (view: ViewRef) => void } {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  const navigate = useCallback((next: ViewRef) => {
    window.history.pushState(null, '', pathForView(next));
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  return { view: viewFromPath(pathname), navigate };
}
