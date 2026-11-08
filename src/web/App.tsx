import { useState } from 'react';
import type { ViewRef } from '../shared/types.ts';
import { ApiError } from './api/apiClient.ts';
import { useRepoContext } from './api/queries.ts';
import { useServerEvents } from './api/useServerEvents.ts';
import { ConversationPanel } from './components/conversation/ConversationPanel.tsx';
import type { DiffMode } from './components/diff/DiffFileView.tsx';
import { DiffPane } from './components/diff/DiffPane.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { ChangeBanner } from './components/layout/ChangeBanner.tsx';
import { FileTree, scrollToFile } from './components/layout/FileTree.tsx';
import { TopBar } from './components/layout/TopBar.tsx';
import { ViewSidebar } from './components/layout/ViewSidebar.tsx';
import { ReviewPanel } from './components/review/ReviewPanel.tsx';
import { useView } from './router.ts';
import { useColorScheme } from './useColorScheme.ts';

const MODE_KEY = 'revi.diffMode';

function readMode(): DiffMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'unified' ? 'unified' : 'split';
  } catch {
    return 'split';
  }
}

/** Scrolls to a thread once its file has rendered after a view switch (files load lazily). */
function revealLater(path: string, threadId: string): void {
  let attempts = 0;
  const tryReveal = (): void => {
    const thread = document.getElementById(`thread-${threadId}`);
    if (thread) return thread.scrollIntoView({ behavior: 'smooth', block: 'center' });
    scrollToFile(path);
    if ((attempts += 1) < 20) window.setTimeout(tryReveal, 150);
  };
  window.setTimeout(tryReveal, 50);
}

export function App() {
  const { view, navigate } = useView();
  const theme = useColorScheme();
  const events = useServerEvents();
  const context = useRepoContext();
  const [mode, setMode] = useState<DiffMode>(readMode);
  const changeMode = (next: DiffMode): void => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Remembering the layout is a convenience; ignore storage errors.
    }
  };
  const openThread = (target: ViewRef, path: string, threadId: string): void => {
    navigate(target);
    revealLater(path, threadId);
  };

  if (context.error instanceof ApiError && context.error.status === 401) {
    return <div className="pane-note">請用 revi 在終端機印出的連結開啟這個頁面。</div>;
  }
  return (
    <AppShell
      topBar={<TopBar mode={mode} onModeChange={changeMode} isLive={events.isConnected} />}
      banner={<ChangeBanner isVisible={events.hasNewChanges} onReloaded={events.acknowledgeChanges} />}
      sidebar={
        <>
          <ViewSidebar view={view} onSelect={navigate} />
          <FileTree view={view} />
        </>
      }
      main={<DiffPane view={view} mode={mode} theme={theme} />}
      review={<ReviewPanel />}
      conversation={<ConversationPanel onOpen={openThread} />}
    />
  );
}
