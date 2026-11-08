import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface CommentComposerProps {
  title?: string;
  initialBody?: string;
  submitLabel: string;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

/** A textarea with Cancel / submit. Cmd/Ctrl+Enter submits, Escape cancels. */
export function CommentComposer(props: CommentComposerProps) {
  const [body, setBody] = useState(props.initialBody ?? '');
  const canSubmit = body.trim() !== '' && !props.isSubmitting;
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') props.onCancel();
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) props.onSubmit(body);
  };
  return (
    <div className="composer">
      {props.title && <div className="composer-title">{props.title}</div>}
      <textarea
        autoFocus
        value={body}
        placeholder="留言（⌘/Ctrl + Enter 送出）"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {props.error && <div className="error-text">{props.error}</div>}
      <div className="composer-actions">
        <button type="button" onClick={props.onCancel}>
          取消
        </button>
        <button type="button" className="primary" disabled={!canSubmit} onClick={() => props.onSubmit(body)}>
          {props.submitLabel}
        </button>
      </div>
    </div>
  );
}
