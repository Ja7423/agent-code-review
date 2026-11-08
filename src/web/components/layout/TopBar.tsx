import { useRepoContext, useSetBase } from '../../api/queries.ts';
import type { DiffMode } from '../diff/DiffFileView.tsx';

interface TopBarProps {
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
  isLive: boolean;
}

/** Branch, base picker, split/unified toggle and the live-connection dot. */
export function TopBar({ mode, onModeChange, isLive }: TopBarProps) {
  const context = useRepoContext();
  const setBase = useSetBase();
  const data = context.data;
  return (
    <header className="top-bar">
      <strong className="brand">revi</strong>
      {data && (
        <>
          <span className="branch" title={data.worktreePath}>
            {data.branch}
          </span>
          <label className="base-picker">
            <span className="muted">base</span>
            <select
              value={data.baseRef}
              onChange={(event) => setBase.mutate(event.target.value)}
              disabled={setBase.isPending}
            >
              {[data.baseRef, ...data.baseCandidates.filter((ref) => ref !== data.baseRef)].map((ref) => (
                <option key={ref} value={ref}>
                  {ref}
                </option>
              ))}
            </select>
          </label>
          <span className="muted mono">
            {data.mergeBaseSha.slice(0, 7)}…{data.headSha.slice(0, 7)}
          </span>
        </>
      )}
      {setBase.error && <span className="error-text">{setBase.error.message}</span>}
      <span className="spacer" />
      <div className="segmented" role="group" aria-label="Diff layout">
        <button
          type="button"
          className={mode === 'split' ? 'is-active' : ''}
          onClick={() => onModeChange('split')}
        >
          Split
        </button>
        <button
          type="button"
          className={mode === 'unified' ? 'is-active' : ''}
          onClick={() => onModeChange('unified')}
        >
          Unified
        </button>
      </div>
      <span
        className={`live-dot ${isLive ? 'is-live' : ''}`}
        title={isLive ? '即時更新已連線' : '即時更新中斷，重新連線中'}
      />
    </header>
  );
}
