import type { CreateThreadInput, ServerEvent, ThreadDto, ViewRef } from '../../shared/types.ts';
import { isLiveView, isSameView } from '../../shared/viewRef.ts';
import type { Clock } from '../adapters/runtime/clock.ts';
import { isoNow } from '../adapters/runtime/clock.ts';
import type { IdGenerator } from '../adapters/runtime/idGenerator.ts';
import type { Transactor } from '../adapters/store/database.ts';
import type { CommentRecord, Scope, ThreadRecord } from '../adapters/store/records.ts';
import type { ReviewRepository } from '../adapters/store/ReviewRepository.ts';
import type { ThreadRepository } from '../adapters/store/ThreadRepository.ts';
import { AnchorRangeError, createAnchor } from '../domain/anchor/anchor.ts';
import { relocateAnchor } from '../domain/anchor/relocateAnchor.ts';
import { nextThreadStatus } from '../domain/thread/threadStatus.ts';
import type { ThreadAction } from '../domain/thread/threadStatus.ts';
import type { DiffService } from './DiffService.ts';
import { ensureDraftReview } from './DraftReviews.ts';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts';
import { toThreadDto } from './mappers.ts';
import type { RepoContext } from './RepoContext.ts';

export interface ThreadServiceDeps {
  threads: ThreadRepository;
  reviews: ReviewRepository;
  transactor: Transactor;
  diff: DiffService;
  context: RepoContext;
  clock: Clock;
  ids: IdGenerator;
  contextLines: number;
  publish: (event: ServerEvent) => void;
}

/** User-side thread operations: drafting comments, follow-ups, resolve/reopen and relocation. */
export class ThreadService {
  private readonly deps: ThreadServiceDeps;

  constructor(deps: ThreadServiceDeps) {
    this.deps = deps;
  }

  private scope(): Scope {
    const { worktreePath, branch } = this.deps.context.current();
    return { worktreePath, branch };
  }

  private draftId(): string | null {
    return this.deps.reviews.getDraft(this.scope())?.id ?? null;
  }

  listThreads(view?: ViewRef): ThreadDto[] {
    const scope = this.scope();
    const draftId = this.draftId();
    const comments = Map.groupBy(this.deps.threads.listCommentsInScope(scope), (comment) => comment.threadId);
    return this.deps.threads
      .listThreads(scope)
      .filter((thread) => view === undefined || isSameView(thread.anchor.view, view))
      .map((thread) => toThreadDto(thread, comments.get(thread.id) ?? [], draftId));
  }

  getThread(threadId: string): ThreadDto {
    const thread = this.requireThread(threadId);
    return toThreadDto(thread, this.deps.threads.listComments(thread.id), this.draftId());
  }

  private requireThread(threadId: string): ThreadRecord {
    const thread = this.deps.threads.getThread(threadId);
    const scope = this.scope();
    if (!thread || thread.worktreePath !== scope.worktreePath)
      throw new NotFoundError(`Thread ${threadId} not found`);
    return thread;
  }

  private requireDraftComment(commentId: string): CommentRecord {
    const comment = this.deps.threads.getComment(commentId);
    if (!comment) throw new NotFoundError(`Comment ${commentId} not found`);
    this.requireThread(comment.threadId);
    if (comment.author !== 'user' || comment.reviewId === null || comment.reviewId !== this.draftId()) {
      throw new ConflictError('Only draft comments can be changed');
    }
    return comment;
  }

  private async validateSidePath(input: CreateThreadInput): Promise<void> {
    const summary = await this.deps.diff.findFile(input.view, input.path);
    const sidePath = input.side === 'old' ? summary.oldPath : summary.newPath;
    if (sidePath !== input.path)
      throw new InvalidInputError(`${input.path} has no ${input.side} side in this diff`);
  }

  async createThread(input: CreateThreadInput): Promise<ThreadDto> {
    await this.validateSidePath(input);
    const fileLines = await this.deps.diff.readFileLines(input.view, input.side, input.path);
    if (fileLines === null)
      throw new InvalidInputError(`${input.path} does not exist on the ${input.side} side`);
    let anchor;
    try {
      anchor = createAnchor({ ...input, fileLines, contextLines: this.deps.contextLines });
    } catch (error) {
      if (error instanceof AnchorRangeError) throw new InvalidInputError(error.message);
      throw error;
    }
    const scope = this.scope();
    const now = isoNow(this.deps.clock);
    const thread: ThreadRecord = {
      ...scope,
      id: this.deps.ids.next(),
      status: 'open',
      anchor,
      isOutdated: false,
      createdAt: now,
    };
    const draft = this.deps.transactor.run(() => {
      const review = ensureDraftReview(this.deps, scope);
      this.deps.threads.insertThread(thread);
      this.insertUserComment(thread.id, review.id, input.body, now);
      return review;
    });
    this.notify(thread.id, draft.id);
    return this.getThread(thread.id);
  }

  private insertUserComment(threadId: string, reviewId: string, body: string, createdAt: string): void {
    this.deps.threads.insertComment({
      id: this.deps.ids.next(),
      threadId,
      reviewId,
      author: 'user',
      agentLabel: null,
      body,
      createdAt,
    });
  }

  /** A user reply. It joins the next review and puts the thread back to `open`. */
  addFollowUp(threadId: string, body: string): ThreadDto {
    const thread = this.requireThread(threadId);
    const next = this.transition(thread, 'userFollowUp');
    const draft = this.deps.transactor.run(() => {
      const review = ensureDraftReview(this.deps, this.scope());
      this.insertUserComment(thread.id, review.id, body, isoNow(this.deps.clock));
      this.deps.threads.updateStatus(thread.id, next);
      return review;
    });
    this.notify(thread.id, draft.id);
    return this.getThread(thread.id);
  }

  editComment(commentId: string, body: string): ThreadDto {
    const comment = this.requireDraftComment(commentId);
    this.deps.threads.updateCommentBody(comment.id, body);
    this.notify(comment.threadId, comment.reviewId);
    return this.getThread(comment.threadId);
  }

  /** Deletes a draft comment; a thread left without comments is deleted with it. */
  deleteComment(commentId: string): void {
    const comment = this.requireDraftComment(commentId);
    this.deps.transactor.run(() => {
      this.deps.threads.deleteComment(comment.id);
      if (this.deps.threads.countComments(comment.threadId) === 0)
        this.deps.threads.deleteThread(comment.threadId);
    });
    this.notify(comment.threadId, comment.reviewId);
  }

  resolve(threadId: string): ThreadDto {
    return this.applyStatusAction(threadId, 'resolve');
  }

  reopen(threadId: string): ThreadDto {
    return this.applyStatusAction(threadId, 'reopen');
  }

  private applyStatusAction(threadId: string, action: 'resolve' | 'reopen'): ThreadDto {
    const thread = this.requireThread(threadId);
    this.deps.threads.updateStatus(thread.id, this.transition(thread, action));
    this.notify(thread.id, null);
    return this.getThread(thread.id);
  }

  private transition(thread: ThreadRecord, action: ThreadAction) {
    const result = nextThreadStatus(thread.status, action, 'user');
    if (!result.ok) throw new ConflictError(result.reason);
    return result.status;
  }

  /** Re-anchors unresolved threads of the live views against the current files. */
  async relocate(): Promise<number> {
    const candidates = this.deps.threads
      .listThreads(this.scope())
      .filter((thread) => isLiveView(thread.anchor.view) && thread.status !== 'resolved');
    let changed = 0;
    for (const thread of candidates) {
      const { anchor } = thread;
      const fileLines = await this.deps.diff.readFileLines(anchor.view, anchor.side, anchor.path);
      const result = relocateAnchor(anchor, fileLines);
      const position =
        result.kind === 'moved'
          ? { startLine: result.startLine, endLine: result.endLine, isOutdated: false }
          : { startLine: anchor.startLine, endLine: anchor.endLine, isOutdated: true };
      const isSame =
        position.isOutdated === thread.isOutdated &&
        position.startLine === anchor.startLine &&
        position.endLine === anchor.endLine;
      if (isSame) continue;
      this.deps.threads.updatePosition(thread.id, position);
      this.deps.publish({ type: 'thread.updated', threadId: thread.id });
      changed += 1;
    }
    return changed;
  }

  private notify(threadId: string, reviewId: string | null): void {
    this.deps.publish({ type: 'thread.updated', threadId });
    if (reviewId) this.deps.publish({ type: 'review.updated', reviewId });
  }
}
