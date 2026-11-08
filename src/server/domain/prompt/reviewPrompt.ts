import Mustache from 'mustache';
import type { Actor, ViewRef } from '../../../shared/types.ts';
import type { Anchor } from '../anchor/anchor.ts';
import { AGENT_REPLY_STATUSES } from '../thread/threadStatus.ts';

export interface PromptThread {
  id: string;
  anchor: Anchor;
  /** Diff lines around the anchor, or `null` when the lines are no longer in the diff. */
  diffExcerpt: string | null;
  history: ReadonlyArray<{ author: Actor; body: string }>;
  newComments: readonly string[];
}

export interface PromptInput {
  review: {
    id: string;
    summary: string;
    branch: string;
    worktreePath: string;
    baseRef: string;
    mergeBaseSha: string;
    headSha: string;
  };
  threads: readonly PromptThread[];
  replyCommand: string;
}

/** The values a prompt template can use. The template's header comment documents each one. */
export interface PromptView {
  review: {
    id: string;
    worktreePath: string;
    branch: string;
    baseRef: string;
    mergeBase: string;
    head: string;
    summary: string;
  };
  threads: PromptThreadView[];
  threadIds: string;
  replyCommand: string;
  statuses: string;
}

export interface PromptThreadView {
  label: string;
  id: string;
  path: string;
  lines: string;
  /** `new` or `old`. */
  side: string;
  isNewSide: boolean;
  /** English view name, e.g. `merged diff`. Templates in other languages use the flags below. */
  view: string;
  isMergedView: boolean;
  isWorktreeView: boolean;
  /** Short SHA when the thread is on a single-commit view, otherwise empty. */
  commit: string;
  hasExcerpt: boolean;
  excerpt: string;
  originalSnippet: string;
  fence: string;
  hasHistory: boolean;
  history: Array<{ author: Actor; isUser: boolean; quotedBody: string }>;
  newComments: Array<{ quotedBody: string }>;
}

const short = (sha: string): string => sha.slice(0, 7);

function viewLabel(view: ViewRef): string {
  if (view.kind === 'merged') return 'merged diff';
  if (view.kind === 'worktree') return 'uncommitted changes';
  return `commit ${short(view.sha)}`;
}

function lineLabel(anchor: Anchor): string {
  return anchor.startLine === anchor.endLine
    ? `${anchor.startLine}`
    : `${anchor.startLine}-${anchor.endLine}`;
}

/** A code fence longer than any backtick run inside the content, so repo text cannot close it. */
export function fenceFor(content: string): string {
  const longest = Math.max(2, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
  return '`'.repeat(longest + 1);
}

function quote(body: string): string {
  return body
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function threadView(thread: PromptThread, label: string): PromptThreadView {
  const { anchor } = thread;
  const shown = thread.diffExcerpt ?? anchor.originalSnippet;
  return {
    label,
    id: thread.id,
    path: anchor.path,
    lines: lineLabel(anchor),
    side: anchor.side,
    isNewSide: anchor.side === 'new',
    view: viewLabel(anchor.view),
    isMergedView: anchor.view.kind === 'merged',
    isWorktreeView: anchor.view.kind === 'worktree',
    commit: anchor.view.kind === 'commit' ? short(anchor.view.sha) : '',
    hasExcerpt: thread.diffExcerpt !== null,
    excerpt: thread.diffExcerpt ?? '',
    originalSnippet: anchor.originalSnippet,
    fence: fenceFor(shown),
    hasHistory: thread.history.length > 0,
    history: thread.history.map((entry) => ({
      author: entry.author,
      isUser: entry.author === 'user',
      quotedBody: quote(entry.body),
    })),
    newComments: thread.newComments.map((body) => ({ quotedBody: quote(body) })),
  };
}

/** Everything a template may reference, computed from the review. */
export function toPromptView(input: PromptInput): PromptView {
  const { review } = input;
  const threads = input.threads.map((thread, i) => threadView(thread, `T${i + 1}`));
  return {
    review: {
      id: review.id,
      worktreePath: review.worktreePath,
      branch: review.branch,
      baseRef: review.baseRef,
      mergeBase: short(review.mergeBaseSha),
      head: short(review.headSha),
      summary: review.summary.trim(),
    },
    threads,
    threadIds: threads.map((thread) => `${thread.label}=${thread.id}`).join(', '),
    replyCommand: input.replyCommand,
    statuses: AGENT_REPLY_STATUSES.join('|'),
  };
}

/** Throws when the template is not valid Mustache (for example an unclosed section). */
export function checkPromptTemplate(template: string): void {
  Mustache.parse(template);
}

/** Renders a Mustache prompt template. Values are inserted verbatim: the prompt is Markdown, not HTML. */
export function renderReviewPrompt(template: string, input: PromptInput): string {
  return Mustache.render(template, toPromptView(input), {}, { escape: String });
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The short prompt sent instead when the full review is too large to paste into a terminal. */
export function buildPromptFilePointer(params: { reviewId: string; filePath: string }): string {
  return `Code review from revi (review ${params.reviewId}) is too long to paste. Read ${params.filePath} and follow its "How to respond" section.`;
}
