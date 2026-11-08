import { useReloadDiff } from '../../api/queries.ts';

/** Shown when the code changed under the diff on screen. Reloading also re-anchors comments. */
export function ChangeBanner({ isVisible, onReloaded }: { isVisible: boolean; onReloaded: () => void }) {
  const reload = useReloadDiff();
  if (!isVisible) return null;
  return (
    <div className="change-banner" role="status">
      <span>程式碼有新的變更。</span>
      <button
        type="button"
        className="primary"
        disabled={reload.isPending}
        onClick={() => reload.mutate(undefined, { onSuccess: onReloaded })}
      >
        重新載入 diff
      </button>
      {reload.error && <span className="error-text">{reload.error.message}</span>}
    </div>
  );
}
