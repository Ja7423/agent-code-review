import { useState } from 'react';
import type { ReactNode } from 'react';

type SideTab = 'review' | 'conversation';

interface AppShellProps {
  topBar: ReactNode;
  banner: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  review: ReactNode;
  conversation: ReactNode;
}

/** Three columns: views and files, the diff, and the review / conversation panel. */
export function AppShell({ topBar, banner, sidebar, main, review, conversation }: AppShellProps) {
  const [tab, setTab] = useState<SideTab>('review');
  return (
    <div className="app-shell">
      {topBar}
      {banner}
      <div className="columns">
        <aside className="left-column">{sidebar}</aside>
        <main className="main-column">{main}</main>
        <aside className="right-column">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'review'}
              className={tab === 'review' ? 'is-active' : ''}
              onClick={() => setTab('review')}
            >
              Review
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'conversation'}
              className={tab === 'conversation' ? 'is-active' : ''}
              onClick={() => setTab('conversation')}
            >
              所有留言
            </button>
          </div>
          {tab === 'review' ? review : conversation}
        </aside>
      </div>
    </div>
  );
}
