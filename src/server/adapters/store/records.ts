import type { Actor, DeliveryState, ReviewStatus, ThreadStatus } from '../../../shared/types.ts';
import type { Anchor } from '../../domain/anchor/anchor.ts';

/** Which worktree and branch a review or thread belongs to. */
export interface Scope {
  worktreePath: string;
  branch: string;
}

export interface ThreadRecord extends Scope {
  id: string;
  status: ThreadStatus;
  anchor: Anchor;
  isOutdated: boolean;
  createdAt: string;
}

export interface CommentRecord {
  id: string;
  threadId: string;
  /** The review a user comment belongs to; `null` for agent replies. */
  reviewId: string | null;
  author: Actor;
  agentLabel: string | null;
  body: string;
  createdAt: string;
}

export interface ReviewRecord extends Scope {
  id: string;
  status: ReviewStatus;
  summary: string;
  baseRef: string | null;
  mergeBaseSha: string | null;
  headSha: string | null;
  targetPaneId: string | null;
  targetSessionId: string | null;
  targetLabel: string | null;
  createdAt: string;
  submittedAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
}

export interface DeliveryRecord {
  id: string;
  reviewId: string;
  attempt: number;
  state: DeliveryState;
  promptFile: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}
