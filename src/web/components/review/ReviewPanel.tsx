import { useState } from 'react';
import { useAgents, useDraft, useReviewMutations, useReviews } from '../../api/queries.ts';
import { AgentTargetPicker } from './AgentTargetPicker.tsx';
import { DeliveryStatus } from './DeliveryStatus.tsx';

/** GitHub-style "Finish your review": summary, target agent, Submit; then delivery history. */
export function ReviewPanel() {
  const draft = useDraft();
  const reviews = useReviews();
  const agents = useAgents();
  const { submit } = useReviewMutations();
  const [summary, setSummary] = useState('');
  const [target, setTarget] = useState('');
  const commentCount = draft.data?.commentCount ?? 0;
  const selectedTarget = target || agents.data?.agents[0]?.paneId || '';
  const canSubmit = commentCount > 0 && selectedTarget !== '' && !submit.isPending;
  const onSubmit = (): void =>
    submit.mutate({ summary, targetPaneId: selectedTarget }, { onSuccess: () => setSummary('') });

  return (
    <div className="review-panel">
      <h2>送出 review</h2>
      <p className="muted">
        {commentCount === 0
          ? '還沒有草稿留言。點 diff 行號旁的「+」開始。'
          : `草稿裡有 ${commentCount} 則留言。`}
      </p>
      <textarea
        className="summary"
        placeholder="整體說明（選填）"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
      />
      <AgentTargetPicker agents={agents.data} value={selectedTarget} onChange={setTarget} />
      <p className="hint">送出前請確認 agent 的輸入框是空的；agent 工作中時會排隊，等它閒置再送。</p>
      <button type="button" className="primary" disabled={!canSubmit} onClick={onSubmit}>
        Submit review
      </button>
      {submit.error && <div className="error-text">{submit.error.message}</div>}

      <h3>已送出</h3>
      {reviews.data?.length === 0 && <p className="muted">還沒有送出過 review。</p>}
      <ul className="delivery-list">
        {reviews.data?.map((review) => (
          <DeliveryStatus key={review.id} review={review} agents={agents.data} />
        ))}
      </ul>
    </div>
  );
}
