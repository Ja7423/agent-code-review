import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { CreateThreadInput, ViewRef } from '../../shared/types.ts';
import { formatViewRef } from '../../shared/viewRef.ts';
import { api } from './apiClient.ts';

/** Every query key in one place, so invalidation and fetching cannot drift apart. */
export const keys = {
  context: ['context'] as const,
  commits: ['commits'] as const,
  diff: ['diff'] as const,
  files: (view: ViewRef) => ['diff', 'files', formatViewRef(view)] as const,
  fileDiff: (view: ViewRef, path: string) => ['diff', 'file', formatViewRef(view), path] as const,
  threads: ['threads'] as const,
  threadsFor: (view: ViewRef | 'all') => ['threads', view === 'all' ? 'all' : formatViewRef(view)] as const,
  draft: ['review', 'draft'] as const,
  reviews: ['review', 'list'] as const,
  agents: ['agents'] as const,
};

export const useRepoContext = () => useQuery({ queryKey: keys.context, queryFn: api.context });
export const useCommits = () => useQuery({ queryKey: keys.commits, queryFn: api.commits });
export const useFiles = (view: ViewRef) =>
  useQuery({ queryKey: keys.files(view), queryFn: () => api.files(view) });

export const useFileDiff = (view: ViewRef, path: string, isEnabled: boolean) =>
  useQuery({
    queryKey: keys.fileDiff(view, path),
    queryFn: () => api.fileDiff(view, path),
    enabled: isEnabled,
  });

export const useThreads = (view: ViewRef) =>
  useQuery({ queryKey: keys.threadsFor(view), queryFn: () => api.threads(view) });
export const useAllThreads = () =>
  useQuery({ queryKey: keys.threadsFor('all'), queryFn: () => api.threads() });
export const useDraft = () =>
  useQuery({ queryKey: keys.draft, queryFn: async () => (await api.draft()).draft });
export const useReviews = () => useQuery({ queryKey: keys.reviews, queryFn: api.reviews });
export const useAgents = () => useQuery({ queryKey: keys.agents, queryFn: api.agents });

function invalidateThreadsAndDraft(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: keys.threads });
  void client.invalidateQueries({ queryKey: keys.draft });
}

/** Mutations that change threads or comments; all of them refresh threads and the draft review. */
export function useThreadMutations() {
  const client = useQueryClient();
  const onSuccess = () => invalidateThreadsAndDraft(client);
  return {
    create: useMutation({ mutationFn: (input: CreateThreadInput) => api.createThread(input), onSuccess }),
    followUp: useMutation({
      mutationFn: (v: { threadId: string; body: string }) => api.followUp(v.threadId, v.body),
      onSuccess,
    }),
    edit: useMutation({
      mutationFn: (v: { commentId: string; body: string }) => api.editComment(v.commentId, v.body),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (commentId: string) => api.deleteComment(commentId), onSuccess }),
    resolve: useMutation({ mutationFn: (threadId: string) => api.resolve(threadId), onSuccess }),
    reopen: useMutation({ mutationFn: (threadId: string) => api.reopen(threadId), onSuccess }),
  };
}

export function useReviewMutations() {
  const client = useQueryClient();
  const onSuccess = () => {
    void client.invalidateQueries({ queryKey: ['review'] });
    void client.invalidateQueries({ queryKey: keys.threads });
  };
  return {
    submit: useMutation({
      mutationFn: (v: { summary: string; targetPaneId: string }) => api.submit(v.summary, v.targetPaneId),
      onSuccess,
    }),
    retry: useMutation({ mutationFn: (reviewId: string) => api.retry(reviewId), onSuccess }),
    retarget: useMutation({
      mutationFn: (v: { reviewId: string; targetPaneId: string }) => api.retarget(v.reviewId, v.targetPaneId),
      onSuccess,
    }),
  };
}

export function useSetBase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (baseRef: string) => api.setBase(baseRef),
    onSuccess: () => void client.invalidateQueries(),
  });
}

/** Re-anchors comments against the new code, then reloads everything that depends on the diff. */
export function useReloadDiff() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.relocate(),
    onSuccess: () => {
      for (const key of [keys.diff, keys.threads, keys.commits, keys.context])
        void client.invalidateQueries({ queryKey: key });
    },
  });
}
