import type { ViewRef } from '../../../shared/types.ts';
import { useFiles, useThreads } from '../../api/queries.ts';
import { viewLabel } from '../../labels.ts';
import type { DiffMode } from './DiffFileView.tsx';
import { FileCard } from './FileCard.tsx';

/** The first files load right away; the rest wait until they scroll near the viewport. */
const EAGER_FILE_COUNT = 10;

/** Lists the files of a view; each file renders itself. */
export function DiffPane({ view, mode, theme }: { view: ViewRef; mode: DiffMode; theme: 'light' | 'dark' }) {
  const files = useFiles(view);
  const threads = useThreads(view);
  if (files.isPending) return <div className="pane-note">載入 diff…</div>;
  if (files.error) return <div className="pane-note error-text">{files.error.message}</div>;
  if (files.data.files.length === 0) return <div className="pane-note">{viewLabel(view)}沒有任何變更。</div>;
  return (
    <div className="diff-pane">
      {files.data.isUntrackedTruncated && (
        <div className="pane-note">Untracked 檔案太多，只顯示前 200 個。</div>
      )}
      {files.data.files.map((file, index) => (
        <FileCard
          isEager={index < EAGER_FILE_COUNT}
          key={`${file.oldPath ?? ''}\0${file.newPath ?? ''}`}
          view={view}
          file={file}
          threads={threads.data ?? []}
          mode={mode}
          theme={theme}
        />
      ))}
    </div>
  );
}
