import { useState } from 'react';
import type { AgentsDto, ReviewDto } from '../../../shared/types.ts';
import { useReviewMutations } from '../../api/queries.ts';
import { REVIEW_STATUS_LABEL } from '../../labels.ts';
import { AgentTargetPicker } from './AgentTargetPicker.tsx';

/** One submitted review: where it went, how delivery is going, and retry / retarget when allowed. */
export function DeliveryStatus({ review, agents }: { review: ReviewDto; agents: AgentsDto | undefined }) {
  const { retry, retarget } = useReviewMutations();
  const [target, setTarget] = useState('');
  const fallbackTarget = target || agents?.agents[0]?.paneId || '';
  const error = retry.error ?? retarget.error;
  return (
    <li className={`delivery review-${review.status}`}>
      <div className="delivery-line">
        <span className={`badge review-${review.status}`}>{REVIEW_STATUS_LABEL[review.status]}</span>
        <span>{review.commentCount} 則留言</span>
        <span className="muted">→ {review.targetLabel ?? '未指定'}</span>
      </div>
      {review.submittedAt && <time className="muted">{new Date(review.submittedAt).toLocaleString()}</time>}
      {review.lastError && <div className="hint warn">{review.lastError}</div>}
      {review.status === 'failed' && (
        <div className="hint">送出結果不確定時，agent 可能已經收到。先看一下 agent 再決定是否重送。</div>
      )}
      {review.availableActions.includes('retry') && (
        <button type="button" onClick={() => retry.mutate(review.id)} disabled={retry.isPending}>
          重送
        </button>
      )}
      {review.availableActions.includes('retarget') && (
        <div className="retarget">
          <AgentTargetPicker agents={agents} value={fallbackTarget} onChange={setTarget} />
          <button
            type="button"
            disabled={!fallbackTarget || retarget.isPending}
            onClick={() => retarget.mutate({ reviewId: review.id, targetPaneId: fallbackTarget })}
          >
            改送給這個 agent
          </button>
        </div>
      )}
      {error && <div className="error-text">{error.message}</div>}
    </li>
  );
}
