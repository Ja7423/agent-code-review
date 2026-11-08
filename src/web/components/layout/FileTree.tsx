import type { ThreadDto, ViewRef } from '../../../shared/types.ts';
import { useFiles, useThreads } from '../../api/queries.ts';
import { FILE_STATUS_LABEL } from '../../labels.ts';
import { threadsForFile } from '../diff/diffText.ts';
import { fileAnchorId } from '../diff/FileCard.tsx';

export function scrollToFile(path: string): void {
  document.getElementById(fileAnchorId(path))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const openCount = (threads: readonly ThreadDto[]): number =>
  threads.filter((t) => t.status !== 'resolved').length;

/** The files of the current view with their status, size and open-comment count. */
export function FileTree({ view }: { view: ViewRef }) {
  const files = useFiles(view);
  const threads = useThreads(view);
  if (!files.data) return null;
  return (
    <div className="file-tree">
      <div className="section-title">檔案 ({files.data.files.length})</div>
      {files.data.files.map((file) => {
        const path = file.newPath ?? file.oldPath ?? '';
        const comments = openCount(threadsForFile(threads.data ?? [], file));
        return (
          <button
            key={`${file.oldPath ?? ''}\0${path}`}
            type="button"
            className="file-item"
            onClick={() => scrollToFile(path)}
            title={path}
          >
            <span className={`file-status status-${file.status}`}>{FILE_STATUS_LABEL[file.status]}</span>
            <span className="file-name">{path}</span>
            {comments > 0 && <span className="badge">{comments}</span>}
          </button>
        );
      })}
    </div>
  );
}
