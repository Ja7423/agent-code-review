import type { ServerEvent } from '../../shared/types.ts';
import type { AgentDirectory } from '../services/AgentDirectory.ts';
import type { DiffService } from '../services/DiffService.ts';
import type { RepoContext } from '../services/RepoContext.ts';
import type { ReplyService } from '../services/ReplyService.ts';
import type { ReviewService } from '../services/ReviewService.ts';
import type { ThreadService } from '../services/ThreadService.ts';
import type { SseHub } from './sseHub.ts';

/** Everything the HTTP layer calls. Built by `serveCommand`. */
export interface AppServices {
  context: RepoContext;
  diff: DiffService;
  threads: ThreadService;
  reviews: ReviewService;
  agents: Pick<AgentDirectory, 'current' | 'refresh'>;
  replies: ReplyService;
  changes: { currentFingerprint(): string };
  hub: SseHub;
  publish: (event: ServerEvent) => void;
  limits: { commentMaxBytes: number; replyMaxBytes: number; sseKeepAliveMs: number };
}
