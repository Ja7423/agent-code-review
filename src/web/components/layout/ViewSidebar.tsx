import type { ReactNode } from 'react';
import type { ViewRef } from '../../../shared/types.ts';
import { isSameView } from '../../../shared/viewRef.ts';
import { useCommits } from '../../api/queries.ts';

interface ViewSidebarProps {
  view: ViewRef;
  onSelect: (view: ViewRef) => void;
}

function ViewButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`view-item ${isActive ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** The merged view, the uncommitted changes, then every commit of the branch. */
export function ViewSidebar({ view, onSelect }: ViewSidebarProps) {
  const commits = useCommits();
  const merged: ViewRef = { kind: 'merged' };
  const worktree: ViewRef = { kind: 'worktree' };
  return (
    <nav className="view-sidebar">
      <ViewButton isActive={isSameView(view, merged)} onClick={() => onSelect(merged)}>
        <strong>全部變更</strong>
        <span className="muted">merge-base → 工作目錄</span>
      </ViewButton>
      <ViewButton isActive={isSameView(view, worktree)} onClick={() => onSelect(worktree)}>
        <strong>未提交變更</strong>
        <span className="muted">HEAD → 工作目錄</span>
      </ViewButton>
      <div className="section-title">Commits {commits.data ? `(${commits.data.length})` : ''}</div>
      {commits.error && <div className="error-text">{commits.error.message}</div>}
      {commits.data?.map((commit) => {
        const commitView: ViewRef = { kind: 'commit', sha: commit.sha };
        return (
          <ViewButton
            key={commit.sha}
            isActive={isSameView(view, commitView)}
            onClick={() => onSelect(commitView)}
          >
            <span className="commit-subject">{commit.subject}</span>
            <span className="muted mono">
              {commit.sha.slice(0, 7)} · {commit.author}
              {commit.parents.length > 1 ? ' · merge' : ''}
            </span>
          </ViewButton>
        );
      })}
    </nav>
  );
}
