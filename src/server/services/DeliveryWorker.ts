import type { DeliveryState, ServerEvent } from '../../shared/types.ts';
import type { HerdrClient, PromptOutcome } from '../adapters/herdr/HerdrClient.ts';
import type { Clock } from '../adapters/runtime/clock.ts';
import { isoNow } from '../adapters/runtime/clock.ts';
import type { Transactor } from '../adapters/store/database.ts';
import type { DeliveryRepository } from '../adapters/store/DeliveryRepository.ts';
import type { DeliveryRecord, ReviewRecord } from '../adapters/store/records.ts';
import type { ReviewRepository } from '../adapters/store/ReviewRepository.ts';
import { planDeliveries } from '../domain/review/planDeliveries.ts';
import { reviewTransition } from '../domain/review/reviewTransition.ts';
import type { ReviewEvent } from '../domain/review/reviewTransition.ts';
import type { AgentDirectory } from './AgentDirectory.ts';
import type { PromptAssembler } from './PromptAssembler.ts';

export interface DeliveryWorkerDeps {
  reviews: ReviewRepository;
  deliveries: DeliveryRepository;
  transactor: Transactor;
  herdr: HerdrClient;
  agents: AgentDirectory;
  prompts: PromptAssembler;
  clock: Clock;
  worktreePath: string;
  promptAckTimeoutMs: number;
  publish: (event: ServerEvent) => void;
}

interface ResultEffect {
  event: ReviewEvent;
  delivery: DeliveryState;
  error: string | null;
}

export const BLOCKED_MESSAGE =
  'The agent is waiting for approval; the review will be sent when it is idle again.';

/** What each herdr outcome does to the review and to the delivery attempt. */
const EFFECTS: {
  [K in PromptOutcome['kind']]: (outcome: Extract<PromptOutcome, { kind: K }>) => ResultEffect;
} = {
  prompted: () => ({ event: { type: 'sendSucceeded' }, delivery: 'sent', error: null }),
  // Nothing was typed into the agent, so the same attempt goes back to pending.
  blocked: () => ({ event: { type: 'agentBlocked' }, delivery: 'pending', error: BLOCKED_MESSAGE }),
  uncertain: (o) => ({
    event: { type: 'sendUncertain' },
    delivery: 'unknown',
    error: `Delivery uncertain: ${o.reason}`,
  }),
  failed: (o) => ({ event: { type: 'sendFailed', error: o.error }, delivery: 'failed', error: o.error }),
};

function effectOf(outcome: PromptOutcome): ResultEffect {
  return (EFFECTS[outcome.kind] as (o: PromptOutcome) => ResultEffect)(outcome);
}

/** Sends queued reviews to their agents once the agent is idle or done. */
export class DeliveryWorker {
  private readonly deps: DeliveryWorkerDeps;
  private isRunning = false;
  private hasPendingKick = false;
  private unsubscribe: (() => void) | null = null;
  private current: Promise<void> | null = null;

  constructor(deps: DeliveryWorkerDeps) {
    this.deps = deps;
  }

  /** Recovers attempts interrupted by a crash, then reacts to agent changes. */
  start(): void {
    this.recover();
    this.unsubscribe = this.deps.agents.onChange(() => this.kick());
    this.kick();
  }

  stop(): void {
    this.unsubscribe?.();
  }

  /** Resolves once the current run (if any) and any run it triggered have finished. Used by tests. */
  async idle(): Promise<void> {
    while (this.current) await this.current;
  }

  /** A `sending` attempt left behind by a previous process may or may not have reached the agent. */
  private recover(): void {
    const stuck = this.deps.deliveries.listByState(this.deps.worktreePath, 'sending');
    for (const delivery of stuck) {
      this.deps.transactor.run(() => {
        this.finishDelivery(delivery, 'unknown', 'revi stopped while sending');
        const review = this.deps.reviews.get(delivery.reviewId);
        if (review)
          this.applyEvent(
            review,
            { type: 'sendUncertain' },
            'revi stopped while sending; check the agent before retrying',
          );
      });
      this.deps.publish({ type: 'review.updated', reviewId: delivery.reviewId });
    }
  }

  kick(): void {
    if (this.isRunning) {
      this.hasPendingKick = true;
      return;
    }
    this.isRunning = true;
    this.current = this.runUntilSettled().finally(() => {
      this.isRunning = false;
      this.current = null;
    });
  }

  private async runUntilSettled(): Promise<void> {
    do {
      this.hasPendingKick = false;
      await this.tick();
    } while (this.hasPendingKick);
  }

  private async tick(): Promise<void> {
    const queued = this.deps.reviews.listByStatus(this.deps.worktreePath, ['queued']);
    const { herdr, agents } = this.deps.agents.current();
    const plan = planDeliveries(queued, agents, herdr);
    for (const reviewId of plan.lost) this.markTargetLost(reviewId);
    for (const reviewId of plan.ready) await this.send(reviewId);
  }

  private markTargetLost(reviewId: string): void {
    const review = this.deps.reviews.get(reviewId);
    if (!review) return;
    this.applyEvent(
      review,
      { type: 'targetLost' },
      'The target agent is gone or was replaced; pick another agent.',
    );
    this.deps.publish({ type: 'review.updated', reviewId });
  }

  private async send(reviewId: string): Promise<void> {
    const started = this.startAttempt(reviewId);
    if (!started) return;
    const { review, delivery } = started;
    let outcome: PromptOutcome;
    try {
      const prompt = await this.deps.prompts.assemble(review, delivery.attempt);
      this.deps.deliveries.update(delivery.id, { promptFile: prompt.promptFile });
      outcome = await this.deps.herdr.prompt(review.targetPaneId ?? '', prompt.text, {
        until: ['working', 'blocked'],
        timeout_ms: this.deps.promptAckTimeoutMs,
      });
    } catch (error) {
      outcome = { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    this.applyResult(review.id, delivery, outcome);
  }

  /** In one transaction: review `queued → delivering`, attempt `pending → sending`. */
  private startAttempt(reviewId: string): { review: ReviewRecord; delivery: DeliveryRecord } | null {
    const result = this.deps.transactor.run(() => {
      const review = this.deps.reviews.get(reviewId);
      const delivery = this.deps.deliveries.latestForReview(reviewId);
      if (!review || delivery?.state !== 'pending') return null;
      if (!this.applyEvent(review, { type: 'sendStarted' }, review.lastError)) return null;
      this.deps.deliveries.update(delivery.id, { state: 'sending', startedAt: isoNow(this.deps.clock) });
      return { review, delivery };
    });
    if (result) this.deps.publish({ type: 'review.updated', reviewId });
    return result;
  }

  private applyResult(reviewId: string, delivery: DeliveryRecord, outcome: PromptOutcome): void {
    const effect = effectOf(outcome);
    this.deps.transactor.run(() => {
      this.finishDelivery(delivery, effect.delivery, effect.error);
      const review = this.deps.reviews.get(reviewId);
      if (!review) return;
      this.applyEvent(review, effect.event, effect.error);
      if (effect.event.type === 'sendSucceeded')
        this.deps.reviews.update(reviewId, { deliveredAt: isoNow(this.deps.clock) });
    });
    this.deps.publish({ type: 'review.updated', reviewId });
  }

  private finishDelivery(delivery: DeliveryRecord, state: DeliveryState, error: string | null): void {
    const isFinal = state !== 'pending';
    this.deps.deliveries.update(delivery.id, {
      state,
      error,
      finishedAt: isFinal ? isoNow(this.deps.clock) : null,
      startedAt: isFinal ? undefined : null,
    });
  }

  private applyEvent(review: ReviewRecord, event: ReviewEvent, lastError: string | null): boolean {
    const result = reviewTransition(review.status, event);
    if (!result.ok) return false;
    this.deps.reviews.update(review.id, { status: result.status, lastError });
    return true;
  }
}
