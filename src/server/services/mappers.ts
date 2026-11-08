import type { CommentDto, ReviewDto, ThreadDto } from '../../shared/types.ts';
import type { CommentRecord, ReviewRecord, ThreadRecord } from '../adapters/store/records.ts';
import { userReviewActions } from '../domain/review/reviewTransition.ts';
import { userThreadActions } from '../domain/thread/threadStatus.ts';

export function toCommentDto(comment: CommentRecord, draftReviewId: string | null): CommentDto {
  return {
    id: comment.id,
    author: comment.author,
    agentLabel: comment.agentLabel,
    body: comment.body,
    isDraft: comment.reviewId !== null && comment.reviewId === draftReviewId,
    createdAt: comment.createdAt,
  };
}

export function toThreadDto(
  thread: ThreadRecord,
  comments: readonly CommentRecord[],
  draftReviewId: string | null,
): ThreadDto {
  const { anchor } = thread;
  return {
    id: thread.id,
    status: thread.status,
    anchor: {
      view: anchor.view,
      path: anchor.path,
      side: anchor.side,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      isOutdated: thread.isOutdated,
      originalSnippet: anchor.originalSnippet,
    },
    comments: comments.map((comment) => toCommentDto(comment, draftReviewId)),
    availableActions: userThreadActions(thread.status),
  };
}

export function toReviewDto(review: ReviewRecord, commentCount: number): ReviewDto {
  return {
    id: review.id,
    status: review.status,
    summary: review.summary,
    targetPaneId: review.targetPaneId,
    targetLabel: review.targetLabel,
    lastError: review.lastError,
    submittedAt: review.submittedAt,
    deliveredAt: review.deliveredAt,
    commentCount,
    availableActions: userReviewActions(review.status),
  };
}
