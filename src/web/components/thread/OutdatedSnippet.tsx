import type { AnchorDto } from '../../../shared/types.ts';

/** The code a thread was written on, shown when those lines are gone from the current diff. */
export function OutdatedSnippet({ anchor }: { anchor: AnchorDto }) {
  const range =
    anchor.startLine === anchor.endLine ? `${anchor.startLine}` : `${anchor.startLine}–${anchor.endLine}`;
  return (
    <div className="outdated-snippet">
      <div className="outdated-caption">
        {anchor.isOutdated ? '已過期，原本的程式碼' : '不在目前 diff 範圍內'} ·{' '}
        {anchor.side === 'old' ? '舊' : '新'}版第 {range} 行
      </div>
      <pre>{anchor.originalSnippet}</pre>
    </div>
  );
}
