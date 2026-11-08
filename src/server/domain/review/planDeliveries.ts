import type { AgentDto, AgentStatus, HerdrConnection } from '../../../shared/types.ts';

export interface QueuedReview {
  id: string;
  targetPaneId: string | null;
  targetSessionId: string | null;
}

export interface DeliveryPlan {
  /** Reviews whose agent disappeared or now runs a different session. */
  lost: string[];
  /** Reviews whose agent is ready for a prompt, at most one per agent. */
  ready: string[];
}

const READY_STATUSES: readonly AgentStatus[] = ['idle', 'done'];

function isTargetLost(review: QueuedReview, agent: AgentDto | undefined): boolean {
  if (!agent) return true;
  // A different session id means the pane now runs a new agent that never saw this review's context.
  return (
    review.targetSessionId !== null && agent.sessionId !== null && agent.sessionId !== review.targetSessionId
  );
}

/** Decides what the delivery worker should do with queued reviews, given the current agents. */
export function planDeliveries(
  queued: readonly QueuedReview[],
  agents: readonly AgentDto[],
  herdr: HerdrConnection,
): DeliveryPlan {
  // Without herdr we cannot tell whether an agent is gone, so everything simply waits.
  if (herdr === 'unavailable') return { lost: [], ready: [] };
  const byPane = new Map(agents.map((agent) => [agent.paneId, agent]));
  const busyPanes = new Set<string>();
  const plan: DeliveryPlan = { lost: [], ready: [] };
  for (const review of queued) {
    const agent = byPane.get(review.targetPaneId ?? '');
    if (isTargetLost(review, agent)) {
      plan.lost.push(review.id);
      continue;
    }
    if (!agent || busyPanes.has(agent.paneId) || !READY_STATUSES.includes(agent.status)) continue;
    busyPanes.add(agent.paneId);
    plan.ready.push(review.id);
  }
  return plan;
}
