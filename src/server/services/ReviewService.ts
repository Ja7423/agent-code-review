import type { ReviewDto, ServerEvent } from '../../shared/types.ts';
import type { Clock } from '../adapters/runtime/clock.ts';
import { isoNow } from '../adapters/runtime/clock.ts';
import type { IdGenerator } from '../adapters/runtime/idGenerator.ts';
import type { Transactor } from '../adapters/store/database.ts';
import type { DeliveryRepository } from '../adapters/store/DeliveryRepository.ts';
import type { ReviewRecord, Scope } from '../adapters/store/records.ts';
import type { ReviewRepository } from '../adapters/store/ReviewRepository.ts';
import type { ThreadRepository } from '../adapters/store/ThreadRepository.ts';
import { reviewTransition } from '../domain/review/reviewTransition.ts';
import type { ReviewEvent } from '../domain/review/reviewTransition.ts';
import type { AgentDirectory } from './AgentDirectory.ts';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts';
import { toReviewDto } from './mappers.ts';
import type { RepoContext } from './RepoContext.ts';

export interface ReviewServiceDeps {
  reviews: ReviewRepository;
  deliveries: DeliveryRepository;
  threads: ThreadRepository;
  transactor: Transactor;
  context: RepoContext;
  agents: AgentDirectory;
  clock: Clock;
  ids: IdGenerator;
  publish: (event: ServerEvent) => void;
  /** Wakes the delivery worker after a review becomes `queued`. */
  onQueued: () => void;
}

const RECENT_REVIEW_LIMIT = 20;

/** The user's side of reviews: the draft, Submit, retry and retarget. */
export class ReviewService {
  private readonly deps: ReviewServiceDeps;

  constructor(deps: ReviewServiceDeps) {
    this.deps = deps;
  }

  private scope(): Scope {
    const { worktreePath, branch } = this.deps.context.current();
    return { worktreePath, branch };
  }

  private toDto(review: ReviewRecord): ReviewDto {
    return toReviewDto(review, this.deps.threads.listCommentsForReview(review.id).length);
  }

  getDraft(): ReviewDto | null {
    const draft = this.deps.reviews.getDraft(this.scope());
    return draft ? this.toDto(draft) : null;
  }

  listRecent(): ReviewDto[] {
    return this.deps.reviews
      .listSubmitted(this.scope(), RECENT_REVIEW_LIMIT)
      .map((review) => this.toDto(review));
  }

  private requireReview(reviewId: string): ReviewRecord {
    const review = this.deps.reviews.get(reviewId);
    if (!review || review.worktreePath !== this.scope().worktreePath)
      throw new NotFoundError(`Review ${reviewId} not found`);
    return review;
  }

  private nextStatus(review: ReviewRecord, event: ReviewEvent) {
    const result = reviewTransition(review.status, event);
    if (!result.ok) throw new ConflictError(result.reason);
    return result.status;
  }

  private requireTarget(paneId: string) {
    const agent = this.deps.agents.find(paneId);
    if (!agent) throw new InvalidInputError(`Agent ${paneId} is not available in this worktree`);
    return {
      targetPaneId: agent.paneId,
      targetSessionId: agent.sessionId,
      targetLabel: agent.name ?? `${agent.kind ?? 'agent'} (${agent.paneId})`,
    };
  }

  private queueNewAttempt(reviewId: string): void {
    const attempt = (this.deps.deliveries.latestForReview(reviewId)?.attempt ?? 0) + 1;
    this.deps.deliveries.insert({
      id: this.deps.ids.next(),
      reviewId,
      attempt,
      state: 'pending',
      promptFile: null,
      startedAt: null,
      finishedAt: null,
      error: null,
    });
  }

  submit(params: { summary: string; targetPaneId: string }): ReviewDto {
    const draft = this.deps.reviews.getDraft(this.scope());
    if (!draft) throw new ConflictError('There is no draft review to submit');
    if (this.deps.threads.listCommentsForReview(draft.id).length === 0)
      throw new ConflictError('The draft review has no comments');
    const status = this.nextStatus(draft, { type: 'submit' });
    const target = this.requireTarget(params.targetPaneId);
    const snapshot = this.deps.context.current();
    this.deps.transactor.run(() => {
      this.deps.reviews.update(draft.id, {
        status,
        summary: params.summary,
        baseRef: snapshot.baseRef,
        mergeBaseSha: snapshot.mergeBaseSha,
        headSha: snapshot.headSha,
        submittedAt: isoNow(this.deps.clock),
        ...target,
      });
      this.queueNewAttempt(draft.id);
    });
    return this.afterQueued(draft.id);
  }

  /** Sends again after an uncertain or failed delivery. The user decides, because herdr may have received it. */
  retry(reviewId: string): ReviewDto {
    const review = this.requireReview(reviewId);
    const status = this.nextStatus(review, { type: 'retry' });
    this.deps.transactor.run(() => {
      this.deps.reviews.update(review.id, { status, lastError: null });
      this.queueNewAttempt(review.id);
    });
    return this.afterQueued(review.id);
  }

  retarget(reviewId: string, targetPaneId: string): ReviewDto {
    const review = this.requireReview(reviewId);
    const status = this.nextStatus(review, { type: 'retarget' });
    const target = this.requireTarget(targetPaneId);
    this.deps.transactor.run(() => {
      this.deps.reviews.update(review.id, { status, lastError: null, ...target });
      if (this.deps.deliveries.latestForReview(review.id)?.state !== 'pending')
        this.queueNewAttempt(review.id);
    });
    return this.afterQueued(review.id);
  }

  private afterQueued(reviewId: string): ReviewDto {
    this.deps.publish({ type: 'review.updated', reviewId });
    this.deps.onQueued();
    return this.toDto(this.requireReview(reviewId));
  }
}
