import type { ReviewStatus, ReviewUserAction } from '../../../shared/types.ts';

export type ReviewEvent =
  | { type: 'submit' }
  | { type: 'sendStarted' }
  | { type: 'sendSucceeded' }
  | { type: 'agentBlocked' }
  | { type: 'sendUncertain' }
  | { type: 'sendFailed'; error: string }
  | { type: 'targetLost' }
  | { type: 'retarget' }
  | { type: 'retry' };

export type ReviewTransition = { ok: true; status: ReviewStatus } | { ok: false; reason: string };

type EventType = ReviewEvent['type'];

/** The whole review state machine. Anything missing from this table is an invalid transition. */
const TRANSITIONS: Readonly<Record<ReviewStatus, Partial<Record<EventType, ReviewStatus>>>> = {
  draft: { submit: 'queued' },
  queued: { sendStarted: 'delivering', targetLost: 'needs_target', retarget: 'queued' },
  delivering: {
    sendSucceeded: 'delivered',
    agentBlocked: 'queued',
    sendUncertain: 'failed',
    sendFailed: 'failed',
  },
  delivered: {},
  needs_target: { retarget: 'queued' },
  failed: { retry: 'queued', retarget: 'queued' },
};

export function reviewTransition(current: ReviewStatus, event: ReviewEvent): ReviewTransition {
  const next = TRANSITIONS[current][event.type];
  return next === undefined
    ? { ok: false, reason: `Cannot ${event.type} a review that is ${current}` }
    : { ok: true, status: next };
}

export function userReviewActions(current: ReviewStatus): ReviewUserAction[] {
  const actions: ReviewUserAction[] = ['retry', 'retarget'];
  return actions.filter((type) => reviewTransition(current, { type }).ok);
}
