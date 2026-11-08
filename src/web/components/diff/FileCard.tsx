import { useMemo, useState } from 'react';
import type { FileDiff, FileDiffSummary, ThreadDto, ViewRef } from '../../../shared/types.ts';
import { useFileDiff, useThreadMutations } from '../../api/queries.ts';
import { FILE_STATUS_LABEL } from '../../labels.ts';
import { CommentComposer } from '../thread/CommentComposer.tsx';
import { CommentThread } from '../thread/CommentThread.tsx';
import type { ComposerRequest, DiffMode } from './DiffFileView.tsx';
import { DiffFileView } from './DiffFileView.tsx';
import { threadsForFile, toExtendData } from './diffText.ts';
import { useNearViewport } from './useNearViewport.ts';

export const fileAnchorId = (path: string): string => `file-${encodeURIComponent(path)}`;
const pathOf = (file: FileDiffSummary): string => file.newPath ?? file.oldPath ?? '';

interface FileCardProps {
  view: ViewRef;
  file: FileDiffSummary;
  threads: readonly ThreadDto[];
  mode: DiffMode;
  theme: 'light' | 'dark';
  /** Load without waiting to scroll near it (the first files of the list). */
  isEager: boolean;
}

function FileHeader({
  file,
  isOpen,
  onToggle,
}: {
  file: FileDiffSummary;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const isRenamed = file.status === 'renamed' && file.oldPath !== file.newPath;
  return (
    <button type="button" className="file-header" onClick={onToggle} aria-expanded={isOpen}>
      <span className="chevron">{isOpen ? '▾' : '▸'}</span>
      <span className={`file-status status-${file.status}`}>{FILE_STATUS_LABEL[file.status]}</span>
      <span className="file-path">{isRenamed ? `${file.oldPath} → ${file.newPath}` : pathOf(file)}</span>
      <span className="spacer" />
      {!file.isBinary && (
        <span className="file-counts">
          <span className="additions">+{file.additions}</span>{' '}
          <span className="deletions">−{file.deletions}</span>
        </span>
      )}
    </button>
  );
}

function FileBody({
  view,
  diff,
  threads,
  mode,
  theme,
}: Omit<FileCardProps, 'file' | 'isEager'> & { diff: FileDiff }) {
  const { create } = useThreadMutations();
  const placement = useMemo(() => toExtendData(threads, diff.hunks), [threads, diff.hunks]);
  const renderComposer = ({ side, startLine, endLine, onClose }: ComposerRequest) => {
    const path = side === 'old' ? diff.oldPath : diff.newPath;
    const range = startLine === endLine ? `第 ${startLine} 行` : `第 ${startLine}–${endLine} 行`;
    return (
      <CommentComposer
        title={`${side === 'old' ? '舊' : '新'}版${range}`}
        submitLabel="加入 review"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onCancel={onClose}
        onSubmit={(body) =>
          path !== null &&
          create.mutate({ view, path, side, startLine, endLine, body }, { onSuccess: onClose })
        }
      />
    );
  };
  if (diff.hunks.length === 0)
    return <div className="file-note">沒有文字內容的變更（改名、權限或空檔案）。</div>;
  return (
    <>
      {placement.unplaced.map((thread) => (
        <CommentThread key={thread.id} thread={thread} isSnippetShown />
      ))}
      <DiffFileView
        file={diff}
        extendData={placement.extendData}
        mode={mode}
        theme={theme}
        renderThreads={(list) => (
          <div className="inline-threads">
            {list.map((thread) => (
              <CommentThread key={thread.id} thread={thread} />
            ))}
          </div>
        )}
        renderComposer={renderComposer}
      />
    </>
  );
}

/** One file of the diff. Hunks load when the card nears the viewport and is expanded. */
export function FileCard({ view, file, threads, mode, theme, isEager }: FileCardProps) {
  const [isOpen, setIsOpen] = useState(!file.isCollapsedByDefault);
  const { ref, isNear } = useNearViewport<HTMLElement>();
  const path = pathOf(file);
  const diff = useFileDiff(view, path, isOpen && (isEager || isNear) && !file.isBinary);
  const ownThreads = useMemo(() => threadsForFile(threads, file), [threads, file]);
  return (
    <section className="file-card" id={fileAnchorId(path)} ref={ref}>
      <FileHeader file={file} isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />
      {isOpen && file.isBinary && <div className="file-note">Binary 檔案，不顯示內容。</div>}
      {isOpen && !file.isBinary && diff.isPending && <div className="file-note">載入中…</div>}
      {isOpen && diff.error && <div className="file-note error-text">{diff.error.message}</div>}
      {isOpen && diff.data && (
        <FileBody view={view} diff={diff.data} threads={ownThreads} mode={mode} theme={theme} />
      )}
      {!isOpen && file.isCollapsedByDefault && (
        <div className="file-note">變更行數很多，預設摺疊。點標題展開。</div>
      )}
    </section>
  );
}
