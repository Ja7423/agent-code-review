import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnchor } from '../../domain/anchor/anchor.ts';
import { openDatabase, transaction } from './database.ts';
import { DeliveryRepository } from './DeliveryRepository.ts';
import type { ReviewRecord, ThreadRecord } from './records.ts';
import { ReviewRepository } from './ReviewRepository.ts';
import { ThreadRepository } from './ThreadRepository.ts';

const scope = { worktreePath: '/repo', branch: 'feat' };

const review = (id: string, status: ReviewRecord['status'] = 'draft'): ReviewRecord => ({
  ...scope,
  id,
  status,
  summary: '',
  baseRef: null,
  mergeBaseSha: null,
  headSha: null,
  targetPaneId: null,
  targetSessionId: null,
  targetLabel: null,
  createdAt: '2026-11-07T00:00:00.000Z',
  submittedAt: null,
  deliveredAt: null,
  lastError: null,
});

const thread = (id: string): ThreadRecord => ({
  ...scope,
  id,
  status: 'open',
  isOutdated: false,
  createdAt: '2026-11-07T00:00:00.000Z',
  anchor: createAnchor({
    view: { kind: 'commit', sha: 'abcdef1' },
    path: 'a.ts',
    side: 'new',
    startLine: 1,
    endLine: 2,
    fileLines: ['x', 'y', 'z'],
    contextLines: 1,
  }),
});

describe('store repositories', () => {
  it('round-trips threads and comments', () => {
    const db = openDatabase(':memory:', { busyTimeoutMs: 100 });
    const reviews = new ReviewRepository(db);
    const threads = new ThreadRepository(db);
    reviews.insert(review('R1'));
    threads.insertThread(thread('T1'));
    threads.insertComment({
      id: 'C1',
      threadId: 'T1',
      reviewId: 'R1',
      author: 'user',
      agentLabel: null,
      body: 'hi',
      createdAt: '2026-11-07T00:00:01.000Z',
    });
    expect(threads.getThread('T1')).toEqual(thread('T1'));
    expect(threads.listThreads(scope)).toHaveLength(1);
    expect(threads.listCommentsForReview('R1').map((c) => c.body)).toEqual(['hi']);
    threads.updatePosition('T1', { startLine: 5, endLine: 6, isOutdated: true });
    expect(threads.getThread('T1')).toMatchObject({ isOutdated: true, anchor: { startLine: 5, endLine: 6 } });
    threads.deleteThread('T1');
    expect(threads.getComment('C1')).toBeNull();
  });

  it('allows only one draft review per worktree and branch', () => {
    const db = openDatabase(':memory:', { busyTimeoutMs: 100 });
    const reviews = new ReviewRepository(db);
    reviews.insert(review('R1'));
    expect(() => reviews.insert(review('R2'))).toThrow(/UNIQUE/);
    reviews.insert(review('R3', 'queued'));
    expect(reviews.getDraft(scope)?.id).toBe('R1');
    expect(reviews.listByStatus('/repo', ['queued']).map((r) => r.id)).toEqual(['R3']);
  });

  it('tracks delivery attempts', () => {
    const db = openDatabase(':memory:', { busyTimeoutMs: 100 });
    new ReviewRepository(db).insert(review('R1', 'queued'));
    const deliveries = new DeliveryRepository(db);
    const base = { reviewId: 'R1', promptFile: null, startedAt: null, finishedAt: null, error: null };
    deliveries.insert({ ...base, id: 'D1', attempt: 1, state: 'unknown' });
    deliveries.insert({ ...base, id: 'D2', attempt: 2, state: 'pending' });
    expect(deliveries.latestForReview('R1')?.id).toBe('D2');
    deliveries.update('D2', { state: 'sending', startedAt: 'now' });
    expect(deliveries.listByState('/repo', 'sending').map((d) => d.id)).toEqual(['D2']);
  });

  it('rolls back a failed transaction', () => {
    const db = openDatabase(':memory:', { busyTimeoutMs: 100 });
    const reviews = new ReviewRepository(db);
    expect(() =>
      transaction(db, () => {
        reviews.insert(review('R1', 'queued'));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(reviews.get('R1')).toBeNull();
  });
});

describe('two connections', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('waits on busy_timeout while another process holds the write lock', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'revi-db-'));
    const file = path.join(dir, 'revi.db');
    openDatabase(file, { busyTimeoutMs: 100 }).close();
    const holder = spawn(process.execPath, [
      '-e',
      `const { DatabaseSync } = require('node:sqlite');
       const db = new DatabaseSync(${JSON.stringify(file)});
       db.exec('BEGIN IMMEDIATE');
       db.prepare("INSERT INTO reviews (id, worktree_path, branch, status, created_at) VALUES ('HOLD', '/x', 'b', 'queued', 'now')").run();
       process.stdout.write('locked\\n');
       Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
       db.exec('COMMIT');`,
    ]);
    await new Promise<void>((resolve) => holder.stdout.once('data', () => resolve()));
    const db = openDatabase(file, { busyTimeoutMs: 5_000 });
    const started = Date.now();
    transaction(db, () => new ReviewRepository(db).insert(review('MINE', 'queued')));
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect(new ReviewRepository(db).get('HOLD')).not.toBeNull();
    expect(new ReviewRepository(db).get('MINE')).not.toBeNull();
    db.close();
  });
});
