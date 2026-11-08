import { useState } from 'react';
import type { ThreadDto, ViewRef } from '../../../shared/types.ts';
import { useAllThreads } from '../../api/queries.ts';
import { viewLabel } from '../../labels.ts';
import { ThreadStatusBadge } from '../thread/ThreadStatusBadge.tsx';

type Filter = 'unresolved' | 'all' | 'resolved' | 'draft';

const FILTERS: Record<Filter, { label: string; matches: (thread: ThreadDto) => boolean }> = {
  unresolved: { label: '未解決', matches: (t) => t.status !== 'resolved' },
  all: { label: '全部', matches: () => true },
  resolved: { label: '已解決', matches: (t) => t.status === 'resolved' },
  draft: { label: '有草稿', matches: (t) => t.comments.some((c) => c.isDraft) },
};

interface ConversationPanelProps {
  onOpen: (view: ViewRef, path: string, threadId: string) => void;
}

/** Every thread of the branch across views, filterable, each linking to where it was written. */
export function ConversationPanel({ onOpen }: ConversationPanelProps) {
  const threads = useAllThreads();
  const [filter, setFilter] = useState<Filter>('unresolved');
  const visible = (threads.data ?? []).filter(FILTERS[filter].matches);
  return (
    <div className="conversation-panel">
      <div className="filter-row">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={key === filter ? 'is-active' : ''}
            onClick={() => setFilter(key)}
          >
            {FILTERS[key].label}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="muted">沒有符合的留言。</p>}
      <ul className="conversation-list">
        {visible.map((thread) => {
          const { anchor } = thread;
          const last = thread.comments.at(-1);
          return (
            <li key={thread.id}>
              <button
                type="button"
                className="conversation-item"
                onClick={() => onOpen(anchor.view, anchor.path, thread.id)}
              >
                <div className="conversation-line">
                  <ThreadStatusBadge status={thread.status} />
                  <span className="file-path">
                    {anchor.path}:{anchor.startLine}
                  </span>
                </div>
                <div className="muted">
                  {viewLabel(anchor.view)}
                  {anchor.isOutdated ? ' · 已過期' : ''}
                </div>
                {last && <div className="conversation-snippet">{last.body}</div>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
