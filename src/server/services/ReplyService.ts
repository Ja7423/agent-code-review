import type { AgentReplyStatus, CommentDto, ServerEvent } from '../../shared/types.ts';
import type { Clock } from '../adapters/runtime/clock.ts';
import { isoNow } from '../adapters/runtime/clock.ts';
import type { IdGenerator } from '../adapters/runtime/idGenerator.ts';
import type { Transactor } from '../adapters/store/database.ts';
import type { CommentRecord } from '../adapters/store/records.ts';
import type { ThreadRepository } from '../adapters/store/ThreadRepository.ts';
import { nextThreadStatus } from '../domain/thread/threadStatus.ts';
import { ConflictError, InvalidInputError, NotFoundError } from './errors.ts';
import { toCommentDto } from './mappers.ts';

export interface ReplyParams {
  threadId: string;
  worktreePath: string;
  status?: AgentReplyStatus;
  body: string;
  agentLabel: string | null;
}

/**
 * The one place that applies agent replies. The HTTP route and `revi reply` writing straight to the
 * database both call it, so the reply rules exist only once.
 */
export class ReplyService {
  private readonly deps: {
    threads: ThreadRepository;
    transactor: Transactor;
    clock: Clock;
    ids: IdGenerator;
    publish?: (event: ServerEvent) => void;
  };

  constructor(deps: ReplyService['deps']) {
    this.deps = deps;
  }

  reply(params: ReplyParams): CommentDto {
    if (params.body.trim() === '') throw new InvalidInputError('The reply body is empty');
    const comment = this.deps.transactor.run(() => {
      const thread = this.deps.threads.getThread(params.threadId);
      if (!thread || thread.worktreePath !== params.worktreePath) {
        throw new NotFoundError(`Thread ${params.threadId} does not belong to ${params.worktreePath}`);
      }
      const next = nextThreadStatus(thread.status, 'agentReply', 'agent', params.status);
      if (!next.ok) throw new ConflictError(next.reason);
      const record: CommentRecord = {
        id: this.deps.ids.next(),
        threadId: thread.id,
        reviewId: null,
        author: 'agent',
        agentLabel: params.agentLabel,
        body: params.body,
        createdAt: isoNow(this.deps.clock),
      };
      this.deps.threads.insertComment(record);
      this.deps.threads.updateStatus(thread.id, next.status);
      return record;
    });
    this.deps.publish?.({ type: 'thread.updated', threadId: params.threadId });
    return toCommentDto(comment, null);
  }
}
