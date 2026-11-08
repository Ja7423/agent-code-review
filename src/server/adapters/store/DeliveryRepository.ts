import type { DeliveryState } from '../../../shared/types.ts';
import type { Database } from './database.ts';
import type { DeliveryRecord } from './records.ts';
import { buildUpdate, nullableString } from './sqlHelpers.ts';
import type { Row } from './sqlHelpers.ts';

export type DeliveryPatch = Partial<Omit<DeliveryRecord, 'id' | 'reviewId' | 'attempt'>>;

function toDelivery(row: Row): DeliveryRecord {
  return {
    id: String(row.id),
    reviewId: String(row.review_id),
    attempt: Number(row.attempt),
    state: String(row.state) as DeliveryState,
    promptFile: nullableString(row.prompt_file),
    startedAt: nullableString(row.started_at),
    finishedAt: nullableString(row.finished_at),
    error: nullableString(row.error),
  };
}

export class DeliveryRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  insert(delivery: DeliveryRecord): void {
    this.db
      .prepare(
        `INSERT INTO deliveries (id, review_id, attempt, state, prompt_file, started_at, finished_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        delivery.id,
        delivery.reviewId,
        delivery.attempt,
        delivery.state,
        delivery.promptFile,
        delivery.startedAt,
        delivery.finishedAt,
        delivery.error,
      );
  }

  latestForReview(reviewId: string): DeliveryRecord | null {
    const row = this.db
      .prepare('SELECT * FROM deliveries WHERE review_id = ? ORDER BY attempt DESC LIMIT 1')
      .get(reviewId) as Row | undefined;
    return row ? toDelivery(row) : null;
  }

  /** Deliveries in `state` whose review belongs to this worktree. */
  listByState(worktreePath: string, state: DeliveryState): DeliveryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT d.* FROM deliveries d JOIN reviews r ON r.id = d.review_id
         WHERE r.worktree_path = ? AND d.state = ? ORDER BY d.started_at`,
      )
      .all(worktreePath, state) as Row[];
    return rows.map(toDelivery);
  }

  update(id: string, patch: DeliveryPatch): void {
    const update = buildUpdate('deliveries', id, patch);
    if (!update.isEmpty) this.db.prepare(update.sql).run(...update.params);
  }
}
