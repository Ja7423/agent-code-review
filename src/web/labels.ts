import type { AgentStatus, FileStatus, ReviewStatus, ThreadStatus, ViewRef } from '../shared/types.ts';

// User-visible labels for enum values, kept together so wording stays consistent.

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  open: '待處理',
  addressed: '已修改',
  answered: '已回答',
  wontfix: '不修改',
  question: '有疑問',
  resolved: '已解決',
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: '草稿',
  queued: '等待 agent',
  delivering: '投遞中',
  delivered: '已送達',
  needs_target: '需要重新選擇 agent',
  failed: '投遞失敗或不確定',
};

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: '閒置',
  working: '工作中',
  blocked: '等待批准',
  done: '完成',
  unknown: '未知',
};

export const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
  untracked: 'U',
};

export function viewLabel(view: ViewRef): string {
  if (view.kind === 'merged') return '全部變更';
  if (view.kind === 'worktree') return '未提交變更';
  return `commit ${view.sha.slice(0, 7)}`;
}
