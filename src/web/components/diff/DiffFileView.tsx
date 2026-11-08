import { DiffModeEnum, DiffViewWithMultiSelect, SplitSide } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view-pure.css';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { FileDiff, Side, ThreadDto } from '../../../shared/types.ts';
import type { ThreadPlacement } from './diffText.ts';
import { toUnifiedText } from './diffText.ts';

export type DiffMode = 'split' | 'unified';

export interface ComposerRequest {
  side: Side;
  startLine: number;
  endLine: number;
  onClose: () => void;
}

interface DiffFileViewProps {
  file: FileDiff;
  extendData: ThreadPlacement['extendData'];
  mode: DiffMode;
  theme: 'light' | 'dark';
  renderThreads: (threads: ThreadDto[]) => ReactNode;
  renderComposer: (request: ComposerRequest) => ReactNode;
}

const toSide = (side: SplitSide): Side => (side === SplitSide.old ? 'old' : 'new');

/**
 * The only component that imports `@git-diff-view/react`. Swapping the diff library means
 * rewriting this file and nothing else.
 */
export function DiffFileView({
  file,
  extendData,
  mode,
  theme,
  renderThreads,
  renderComposer,
}: DiffFileViewProps) {
  const data = useMemo(
    () => ({
      oldFile: { fileName: file.oldPath ?? file.newPath },
      newFile: { fileName: file.newPath ?? file.oldPath },
      hunks: [toUnifiedText(file)],
    }),
    [file],
  );
  return (
    <DiffViewWithMultiSelect<ThreadDto[]>
      data={data}
      extendData={extendData}
      diffViewMode={mode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified}
      diffViewTheme={theme}
      diffViewHighlight
      diffViewWrap
      diffViewAddWidget
      renderExtendLine={({ data: threads }) => renderThreads(threads)}
      renderWidgetLine={({ lineNumber, fromLineNumber, side, onClose }) =>
        renderComposer({
          side: toSide(side),
          startLine: Math.min(fromLineNumber || lineNumber, lineNumber),
          endLine: Math.max(fromLineNumber || lineNumber, lineNumber),
          onClose,
        })
      }
    />
  );
}
