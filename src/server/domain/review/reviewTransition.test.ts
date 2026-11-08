import { describe, expect, it } from 'vitest';
import type { ReviewStatus } from '../../../shared/types.ts';
import type { ReviewEvent } from './reviewTransition.ts';
import { reviewTransition, userReviewActions } from './reviewTransition.ts';

const ALL_STATUSES: ReviewStatus[] = ['draft', 'queued', 'delivering', 'delivered', 'needs_target', 'failed'];
const ALL_EVENTS: ReviewEvent[] = [
  { type: 'submit' },
  { type: 'sendStarted' },
  { type: 'sendSucceeded' },
  { type: 'agentBlocked' },
  { type: 'sendUncertain' },
  { type: 'sendFailed', error: 'x' },
  { type: 'targetLost' },
  { type: 'retarget' },
  { type: 'retry' },
];

const VALID: Record<string, ReviewStatus> = {
  'draft:submit': 'queued',
  'queued:sendStarted': 'delivering',
  'queued:targetLost': 'needs_target',
  'queued:retarget': 'queued',
  'delivering:sendSucceeded': 'delivered',
  'delivering:agentBlocked': 'queued',
  'delivering:sendUncertain': 'failed',
  'delivering:sendFailed': 'failed',
  'needs_target:retarget': 'queued',
  'failed:retry': 'queued',
  'failed:retarget': 'queued',
};

describe('reviewTransition', () => {
  for (const status of ALL_STATUSES) {
    for (const event of ALL_EVENTS) {
      const key = `${status}:${event.type}`;
      const expected = VALID[key];
      it(`${key} → ${expected ?? 'rejected'}`, () => {
        const result = reviewTransition(status, event);
        expect(result).toEqual(
          expected ? { ok: true, status: expected } : { ok: false, reason: expect.any(String) },
        );
      });
    }
  }
});

describe('userReviewActions', () => {
  it('offers retry only for failed reviews', () => {
    expect(userReviewActions('failed')).toEqual(['retry', 'retarget']);
    expect(userReviewActions('needs_target')).toEqual(['retarget']);
    expect(userReviewActions('delivered')).toEqual([]);
  });
});
