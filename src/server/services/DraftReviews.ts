import type { Clock } from '../adapters/runtime/clock.ts';
import { isoNow } from '../adapters/runtime/clock.ts';
import type { IdGenerator } from '../adapters/runtime/idGenerator.ts';
import type { Scope, ReviewRecord } from '../adapters/store/records.ts';
import type { ReviewRepository } from '../adapters/store/ReviewRepository.ts';

/** Finds or creates the single draft review of a scope. Call inside a transaction. */
export function ensureDraftReview(
  deps: { reviews: ReviewRepository; clock: Clock; ids: IdGenerator },
  scope: Scope,
): ReviewRecord {
  const existing = deps.reviews.getDraft(scope);
  if (existing) return existing;
  const draft: ReviewRecord = {
    ...scope,
    id: deps.ids.next(),
    status: 'draft',
    summary: '',
    baseRef: null,
    mergeBaseSha: null,
    headSha: null,
    targetPaneId: null,
    targetSessionId: null,
    targetLabel: null,
    createdAt: isoNow(deps.clock),
    submittedAt: null,
    deliveredAt: null,
    lastError: null,
  };
  deps.reviews.insert(draft);
  return draft;
}
