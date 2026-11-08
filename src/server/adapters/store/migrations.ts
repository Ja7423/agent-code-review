/** Ordered schema migrations. Index + 1 is the `PRAGMA user_version` after applying it. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    worktree_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    base_ref TEXT,
    merge_base_sha TEXT,
    head_sha TEXT,
    target_pane_id TEXT,
    target_session_id TEXT,
    target_label TEXT,
    created_at TEXT NOT NULL,
    submitted_at TEXT,
    delivered_at TEXT,
    last_error TEXT
  );
  CREATE UNIQUE INDEX one_draft_per_worktree ON reviews(worktree_path, branch) WHERE status = 'draft';
  CREATE INDEX reviews_by_status ON reviews(worktree_path, status);

  CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    worktree_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL,
    view_kind TEXT NOT NULL,
    commit_sha TEXT,
    path TEXT NOT NULL,
    side TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    line_hash TEXT NOT NULL,
    context_before TEXT NOT NULL,
    context_after TEXT NOT NULL,
    original_snippet TEXT NOT NULL,
    is_outdated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX threads_by_scope ON threads(worktree_path, branch);

  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    review_id TEXT REFERENCES reviews(id),
    author TEXT NOT NULL,
    agent_label TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX comments_by_thread ON comments(thread_id);
  CREATE INDEX comments_by_review ON comments(review_id);

  CREATE TABLE deliveries (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES reviews(id),
    attempt INTEGER NOT NULL,
    state TEXT NOT NULL,
    prompt_file TEXT,
    started_at TEXT,
    finished_at TEXT,
    error TEXT,
    UNIQUE (review_id, attempt)
  );
  `,
];
