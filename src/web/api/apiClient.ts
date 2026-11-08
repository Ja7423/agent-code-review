import type {
  AgentsDto,
  CommitDto,
  ContextDto,
  CreateThreadInput,
  FileDiff,
  FileListDto,
  ReviewDto,
  ThreadDto,
  ViewRef,
} from '../../shared/types.ts';
import { formatViewRef } from '../../shared/viewRef.ts';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(payload.error ?? response.statusText, response.status);
  return payload as T;
}

const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();
const viewQuery = (view: ViewRef): string => query({ view: formatViewRef(view) });

/** The only module that knows the server's URL layout. */
export const api = {
  context: () => request<ContextDto>('GET', '/api/context'),
  setBase: (baseRef: string) => request<ContextDto>('PUT', '/api/context/base', { baseRef }),
  commits: () => request<CommitDto[]>('GET', '/api/commits'),
  files: (view: ViewRef) => request<FileListDto>('GET', `/api/diff?${viewQuery(view)}`),
  fileDiff: (view: ViewRef, path: string) =>
    request<FileDiff>('GET', `/api/diff/file?${query({ view: formatViewRef(view), path })}`),
  threads: (view?: ViewRef) =>
    request<ThreadDto[]>('GET', view ? `/api/threads?${viewQuery(view)}` : '/api/threads'),
  createThread: (input: CreateThreadInput) =>
    request<ThreadDto>('POST', '/api/threads', { ...input, view: formatViewRef(input.view) }),
  followUp: (threadId: string, body: string) =>
    request<ThreadDto>('POST', `/api/threads/${encodeURIComponent(threadId)}/comments`, { body }),
  editComment: (commentId: string, body: string) =>
    request<ThreadDto>('PATCH', `/api/comments/${encodeURIComponent(commentId)}`, { body }),
  deleteComment: (commentId: string) =>
    request<undefined>('DELETE', `/api/comments/${encodeURIComponent(commentId)}`),
  resolve: (threadId: string) =>
    request<ThreadDto>('POST', `/api/threads/${encodeURIComponent(threadId)}/resolve`),
  reopen: (threadId: string) =>
    request<ThreadDto>('POST', `/api/threads/${encodeURIComponent(threadId)}/reopen`),
  relocate: () => request<{ changed: number }>('POST', '/api/threads/relocate'),
  draft: () => request<{ draft: ReviewDto | null }>('GET', '/api/review/draft'),
  reviews: () => request<ReviewDto[]>('GET', '/api/reviews'),
  submit: (summary: string, targetPaneId: string) =>
    request<ReviewDto>('POST', '/api/review/submit', { summary, targetPaneId }),
  retry: (reviewId: string) =>
    request<ReviewDto>('POST', `/api/reviews/${encodeURIComponent(reviewId)}/retry`),
  retarget: (reviewId: string, targetPaneId: string) =>
    request<ReviewDto>('POST', `/api/reviews/${encodeURIComponent(reviewId)}/retarget`, { targetPaneId }),
  agents: () => request<AgentsDto>('GET', '/api/agents'),
  refreshAgents: () => request<AgentsDto>('POST', '/api/agents/refresh'),
};
