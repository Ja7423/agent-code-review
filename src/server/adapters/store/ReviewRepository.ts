import type { ReviewStatus } from '../../../shared/types.ts';
import type { Database } from './database.ts';
import type { ReviewRecord, Scope } from './records.ts';
import { buildUpdate, nullableString } from './sqlHelpers.ts';
import type { Row } from './sqlHelpers.ts';

export type ReviewPatch = Partial<Omit<ReviewRecord, 'id' | 'worktreePath' | 'branch' | 'createdAt'>>;

function toReview(row: Row): ReviewRecord {
  return {
    id: String(row.id),
    worktreePath: String(row.worktree_path),
    branch: String(row.branch),
    status: String(row.status) as ReviewStatus,
    summary: String(row.summary),
    baseRef: nullableString(row.base_ref),
    mergeBaseSha: nullableString(row.merge_base_sha),
    headSha: nullableString(row.head_sha),
    targetPaneId: nullableString(row.target_pane_id),
    targetSessionId: nullableString(row.target_session_id),
    targetLabel: nullableString(row.target_label),
    createdAt: String(row.created_at),
    submittedAt: nullableString(row.submitted_at),
    deliveredAt: nullableString(row.delivered_at),
    lastError: nullableString(row.last_error),
  };
}

export class ReviewRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  insert(review: ReviewRecord): void {
    this.db
      .prepare(
        `INSERT INTO reviews (id, worktree_path, branch, status, summary, base_ref, merge_base_sha, head_sha,
          target_pane_id, target_session_id, target_label, created_at, submitted_at, delivered_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        review.id,
        review.worktreePath,
        review.branch,
        review.status,
        review.summary,
        review.baseRef,
        review.mergeBaseSha,
        review.headSha,
        review.targetPaneId,
        review.targetSessionId,
        review.targetLabel,
        review.createdAt,
        review.submittedAt,
        review.deliveredAt,
        review.lastError,
      );
  }

  get(id: string): ReviewRecord | null {
    const row = this.db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as Row | undefined;
    return row ? toReview(row) : null;
  }

  getDraft(scope: Scope): ReviewRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM reviews WHERE worktree_path = ? AND branch = ? AND status = 'draft'`)
      .get(scope.worktreePath, scope.branch) as Row | undefined;
    return row ? toReview(row) : null;
  }

  listByStatus(worktreePath: string, statuses: readonly ReviewStatus[]): ReviewRecord[] {
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM reviews WHERE worktree_path = ? AND status IN (${placeholders}) ORDER BY submitted_at, id`,
      )
      .all(worktreePath, ...statuses) as Row[];
    return rows.map(toReview);
  }

  /** Submitted reviews of a scope, newest first. */
  listSubmitted(scope: Scope, limit: number): ReviewRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM reviews WHERE worktree_path = ? AND branch = ? AND status != 'draft'
         ORDER BY submitted_at DESC, id DESC LIMIT ?`,
      )
      .all(scope.worktreePath, scope.branch, limit) as Row[];
    return rows.map(toReview);
  }

  update(id: string, patch: ReviewPatch): void {
    const update = buildUpdate('reviews', id, patch);
    if (!update.isEmpty) this.db.prepare(update.sql).run(...update.params);
  }
}
