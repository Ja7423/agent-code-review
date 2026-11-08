import type { ThreadStatus } from '../../../shared/types.ts';
import { THREAD_STATUS_LABEL } from '../../labels.ts';

export function ThreadStatusBadge({ status }: { status: ThreadStatus }) {
  return <span className={`badge status-${status}`}>{THREAD_STATUS_LABEL[status]}</span>;
}
