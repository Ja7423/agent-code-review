import type { Actor, Side, ThreadStatus, ViewRef } from '../../../shared/types.ts';
import type { Database } from './database.ts';
import type { CommentRecord, Scope, ThreadRecord } from './records.ts';
import { nullableString } from './sqlHelpers.ts';
import type { Row } from './sqlHelpers.ts';

function viewOf(row: Row): ViewRef {
  const kind = String(row.view_kind);
  if (kind === 'commit') return { kind: 'commit', sha: String(row.commit_sha) };
  return kind === 'worktree' ? { kind: 'worktree' } : { kind: 'merged' };
}

function toThread(row: Row): ThreadRecord {
  return {
    id: String(row.id),
    worktreePath: String(row.worktree_path),
    branch: String(row.branch),
    status: String(row.status) as ThreadStatus,
    isOutdated: Number(row.is_outdated) === 1,
    createdAt: String(row.created_at),
    anchor: {
      view: viewOf(row),
      path: String(row.path),
      side: String(row.side) as Side,
      startLine: Number(row.start_line),
      endLine: Number(row.end_line),
      lineHash: String(row.line_hash),
      contextBefore: JSON.parse(String(row.context_before)) as string[],
      contextAfter: JSON.parse(String(row.context_after)) as string[],
      originalSnippet: String(row.original_snippet),
    },
  };
}

function toComment(row: Row): CommentRecord {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    reviewId: nullableString(row.review_id),
    author: String(row.author) as Actor,
    agentLabel: nullableString(row.agent_label),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

/** Threads and their comments. A comment never exists without its thread. */
export class ThreadRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  insertThread(thread: ThreadRecord): void {
    const { anchor } = thread;
    this.db
      .prepare(
        `INSERT INTO threads (id, worktree_path, branch, status, view_kind, commit_sha, path, side, start_line,
          end_line, line_hash, context_before, context_after, original_snippet, is_outdated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        thread.id,
        thread.worktreePath,
        thread.branch,
        thread.status,
        anchor.view.kind,
        anchor.view.kind === 'commit' ? anchor.view.sha : null,
        anchor.path,
        anchor.side,
        anchor.startLine,
        anchor.endLine,
        anchor.lineHash,
        JSON.stringify(anchor.contextBefore),
        JSON.stringify(anchor.contextAfter),
        anchor.originalSnippet,
        thread.isOutdated ? 1 : 0,
        thread.createdAt,
      );
  }

  getThread(id: string): ThreadRecord | null {
    const row = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Row | undefined;
    return row ? toThread(row) : null;
  }

  listThreads(scope: Scope): ThreadRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM threads WHERE worktree_path = ? AND branch = ? ORDER BY path, start_line, created_at',
      )
      .all(scope.worktreePath, scope.branch) as Row[];
    return rows.map(toThread);
  }

  updateStatus(id: string, status: ThreadStatus): void {
    this.db.prepare('UPDATE threads SET status = ? WHERE id = ?').run(status, id);
  }

  updatePosition(id: string, position: { startLine: number; endLine: number; isOutdated: boolean }): void {
    this.db
      .prepare('UPDATE threads SET start_line = ?, end_line = ?, is_outdated = ? WHERE id = ?')
      .run(position.startLine, position.endLine, position.isOutdated ? 1 : 0, id);
  }

  deleteThread(id: string): void {
    this.db.prepare('DELETE FROM threads WHERE id = ?').run(id);
  }

  insertComment(comment: CommentRecord): void {
    this.db
      .prepare(
        `INSERT INTO comments (id, thread_id, review_id, author, agent_label, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        comment.id,
        comment.threadId,
        comment.reviewId,
        comment.author,
        comment.agentLabel,
        comment.body,
        comment.createdAt,
      );
  }

  getComment(id: string): CommentRecord | null {
    const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Row | undefined;
    return row ? toComment(row) : null;
  }

  listComments(threadId: string): CommentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM comments WHERE thread_id = ? ORDER BY created_at, id')
      .all(threadId) as Row[];
    return rows.map(toComment);
  }

  listCommentsInScope(scope: Scope): CommentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM comments c JOIN threads t ON t.id = c.thread_id
         WHERE t.worktree_path = ? AND t.branch = ? ORDER BY c.created_at, c.id`,
      )
      .all(scope.worktreePath, scope.branch) as Row[];
    return rows.map(toComment);
  }

  listCommentsForReview(reviewId: string): CommentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM comments WHERE review_id = ? ORDER BY created_at, id')
      .all(reviewId) as Row[];
    return rows.map(toComment);
  }

  updateCommentBody(id: string, body: string): void {
    this.db.prepare('UPDATE comments SET body = ? WHERE id = ?').run(body, id);
  }

  deleteComment(id: string): void {
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  }

  countComments(threadId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM comments WHERE thread_id = ?')
      .get(threadId) as Row;
    return Number(row.n);
  }
}
