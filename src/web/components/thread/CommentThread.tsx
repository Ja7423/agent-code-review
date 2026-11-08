import { useState } from 'react';
import type { CommentDto, ThreadDto } from '../../../shared/types.ts';
import { useThreadMutations } from '../../api/queries.ts';
import { CommentComposer } from './CommentComposer.tsx';
import { OutdatedSnippet } from './OutdatedSnippet.tsx';
import { ThreadStatusBadge } from './ThreadStatusBadge.tsx';

const errorText = (error: Error | null): string | null => error?.message ?? null;

function CommentItem({ comment }: { comment: CommentDto }) {
  const { edit, remove } = useThreadMutations();
  const [isEditing, setIsEditing] = useState(false);
  if (isEditing) {
    return (
      <CommentComposer
        initialBody={comment.body}
        submitLabel="儲存"
        isSubmitting={edit.isPending}
        error={errorText(edit.error)}
        onCancel={() => setIsEditing(false)}
        onSubmit={(body) =>
          edit.mutate({ commentId: comment.id, body }, { onSuccess: () => setIsEditing(false) })
        }
      />
    );
  }
  const author = comment.author === 'agent' ? (comment.agentLabel ?? 'agent') : '你';
  return (
    <div className={`comment author-${comment.author}`}>
      <div className="comment-meta">
        <strong>{author}</strong>
        {comment.isDraft && <span className="badge draft">草稿</span>}
        <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
        {comment.isDraft && (
          <span className="comment-tools">
            <button type="button" className="link" onClick={() => setIsEditing(true)}>
              編輯
            </button>
            <button type="button" className="link danger" onClick={() => remove.mutate(comment.id)}>
              刪除
            </button>
          </span>
        )}
      </div>
      <div className="comment-body">{comment.body}</div>
    </div>
  );
}

/** One thread: its comments, a reply box, and the resolve/reopen actions the server allows. */
export function CommentThread({
  thread,
  isSnippetShown = false,
}: {
  thread: ThreadDto;
  isSnippetShown?: boolean;
}) {
  const { followUp, resolve, reopen } = useThreadMutations();
  const [isReplying, setIsReplying] = useState(false);
  const isResolved = thread.status === 'resolved';
  return (
    <div className={`thread ${isResolved ? 'is-resolved' : ''}`} id={`thread-${thread.id}`}>
      <div className="thread-header">
        <ThreadStatusBadge status={thread.status} />
        <span className="thread-id">#{thread.id.slice(-6)}</span>
        <span className="spacer" />
        {thread.availableActions.includes('resolve') && (
          <button type="button" onClick={() => resolve.mutate(thread.id)}>
            Resolve
          </button>
        )}
        {thread.availableActions.includes('reopen') && (
          <button type="button" onClick={() => reopen.mutate(thread.id)}>
            Reopen
          </button>
        )}
      </div>
      {isSnippetShown && <OutdatedSnippet anchor={thread.anchor} />}
      {thread.comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
      {isReplying ? (
        <CommentComposer
          submitLabel="加入 review"
          isSubmitting={followUp.isPending}
          error={errorText(followUp.error)}
          onCancel={() => setIsReplying(false)}
          onSubmit={(body) =>
            followUp.mutate({ threadId: thread.id, body }, { onSuccess: () => setIsReplying(false) })
          }
        />
      ) : (
        <button type="button" className="reply-button" onClick={() => setIsReplying(true)}>
          回覆…
        </button>
      )}
    </div>
  );
}
