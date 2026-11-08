import type { PromptFileWriter } from '../adapters/fs/PromptFileWriter.ts';
import type { PromptTemplateSource } from '../adapters/fs/PromptTemplateSource.ts';
import type { CommentRecord, ReviewRecord } from '../adapters/store/records.ts';
import type { ThreadRepository } from '../adapters/store/ThreadRepository.ts';
import { extractDiffExcerpt } from '../domain/diff/extractDiffExcerpt.ts';
import { buildPromptFilePointer, byteLength, renderReviewPrompt } from '../domain/prompt/reviewPrompt.ts';
import type { PromptInput, PromptThread } from '../domain/prompt/reviewPrompt.ts';
import type { DiffService } from './DiffService.ts';

export interface AssembledPrompt {
  text: string;
  promptFile: string | null;
}

export interface PromptAssemblerDeps {
  threads: ThreadRepository;
  diff: DiffService;
  files: PromptFileWriter;
  template: PromptTemplateSource;
  maxInlineBytes: number;
  contextLines: number;
  replyCommand: string;
}

/** Gathers what the prompt template needs from the store and git, and spills oversized prompts to a file. */
export class PromptAssembler {
  private readonly deps: PromptAssemblerDeps;

  constructor(deps: PromptAssemblerDeps) {
    this.deps = deps;
  }

  async assemble(review: ReviewRecord, attempt: number): Promise<AssembledPrompt> {
    const ownComments = this.deps.threads.listCommentsForReview(review.id);
    const threadIds = [...new Set(ownComments.map((comment) => comment.threadId))];
    const threads = await Promise.all(threadIds.map((id) => this.promptThread(id, review.id)));
    const input: PromptInput = {
      review: {
        id: review.id,
        summary: review.summary,
        branch: review.branch,
        worktreePath: review.worktreePath,
        baseRef: review.baseRef ?? '',
        mergeBaseSha: review.mergeBaseSha ?? '',
        headSha: review.headSha ?? '',
      },
      threads: threads.filter((thread): thread is PromptThread => thread !== null),
      replyCommand: this.deps.replyCommand,
    };
    const text = await this.render(input);
    if (byteLength(text) <= this.deps.maxInlineBytes) return { text, promptFile: null };
    const promptFile = await this.deps.files.write(`review-${review.id}-${attempt}`, text);
    return { text: buildPromptFilePointer({ reviewId: review.id, filePath: promptFile }), promptFile };
  }

  private async render(input: PromptInput): Promise<string> {
    const template = await this.deps.template.read();
    try {
      return renderReviewPrompt(template.text, input);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Prompt template ${template.path} is invalid: ${reason}`, { cause: error });
    }
  }

  private async promptThread(threadId: string, reviewId: string): Promise<PromptThread | null> {
    const thread = this.deps.threads.getThread(threadId);
    if (!thread) return null;
    const comments = this.deps.threads.listComments(threadId);
    const firstOwn = comments.findIndex((comment) => comment.reviewId === reviewId);
    const history = comments.slice(0, Math.max(firstOwn, 0)).map((comment: CommentRecord) => ({
      author: comment.author,
      body: comment.body,
    }));
    return {
      id: thread.id,
      anchor: thread.anchor,
      diffExcerpt: thread.isOutdated ? null : await this.excerpt(thread.anchor),
      history,
      newComments: comments.filter((comment) => comment.reviewId === reviewId).map((comment) => comment.body),
    };
  }

  private async excerpt(anchor: PromptThread['anchor']): Promise<string | null> {
    try {
      const diff = await this.deps.diff.getFileDiff(anchor.view, anchor.path);
      return extractDiffExcerpt({ hunks: diff.hunks, ...anchor, contextLines: this.deps.contextLines });
    } catch {
      return null;
    }
  }
}
