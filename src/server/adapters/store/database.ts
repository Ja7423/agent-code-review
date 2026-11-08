import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';

export type Database = DatabaseSync;

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] ?? '');
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Opens (and migrates) the store. Pass `:memory:` in tests. */
export function openDatabase(file: string, opts: { busyTimeoutMs: number }): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { timeout: opts.busyTimeoutMs });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`PRAGMA busy_timeout = ${Math.trunc(opts.busyTimeoutMs)}`);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/** What services depend on to group writes atomically, without knowing about SQLite. */
export interface Transactor {
  run<T>(work: () => T): T;
}

export function createTransactor(db: DatabaseSync): Transactor {
  return { run: (work) => transaction(db, work) };
}

/**
 * Runs `work` inside `BEGIN IMMEDIATE`, so the write lock is taken up front and another process
 * (a second server, or `revi reply` writing directly) waits on `busy_timeout` instead of failing midway.
 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
