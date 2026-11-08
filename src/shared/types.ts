// DTOs shared by the server and the web app. Types only: no runtime code here.

export type ViewRef =
  | { kind: 'merged' } // mergeBase → working tree
  | { kind: 'worktree' } // HEAD → working tree (uncommitted changes)
  | { kind: 'commit'; sha: string }; // sha^1 → sha (merge commits use the first parent)

export type Side = 'old' | 'new';
export type ThreadStatus = 'open' | 'addressed' | 'answered' | 'wontfix' | 'question' | 'resolved';
export type AgentReplyStatus = Exclude<ThreadStatus, 'open' | 'resolved'>;
export type ReviewStatus = 'draft' | 'queued' | 'delivering' | 'delivered' | 'needs_target' | 'failed';
export type DeliveryState = 'pending' | 'sending' | 'sent' | 'unknown' | 'failed';
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';
export type Actor = 'user' | 'agent';

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked';

export interface FileDiffSummary {
  oldPath: string | null;
  newPath: string | null;
  status: FileStatus;
  isBinary: boolean;
  additions: number;
  deletions: number;
  isCollapsedByDefault: boolean;
}

export interface FileDiff extends FileDiffSummary {
  hunks: string[];
}

export interface FileListDto {
  files: FileDiffSummary[];
  isUntrackedTruncated: boolean;
}

export interface ContextDto {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
  mergeBaseSha: string;
  headSha: string;
  baseCandidates: string[];
}

export interface CommitDto {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
}

export interface AnchorDto {
  view: ViewRef;
  path: string;
  side: Side;
  startLine: number;
  endLine: number;
  isOutdated: boolean;
  originalSnippet: string;
}

export interface CommentDto {
  id: string;
  author: Actor;
  agentLabel: string | null;
  body: string;
  isDraft: boolean;
  createdAt: string;
}

export type ThreadUserAction = 'resolve' | 'reopen';

export interface ThreadDto {
  id: string;
  status: ThreadStatus;
  anchor: AnchorDto;
  comments: CommentDto[];
  availableActions: ThreadUserAction[];
}

export type ReviewUserAction = 'retry' | 'retarget';

export interface ReviewDto {
  id: string;
  status: ReviewStatus;
  summary: string;
  targetPaneId: string | null;
  targetLabel: string | null;
  lastError: string | null;
  submittedAt: string | null;
  deliveredAt: string | null;
  commentCount: number;
  availableActions: ReviewUserAction[];
}

export interface AgentDto {
  paneId: string;
  name: string | null;
  kind: string | null;
  status: AgentStatus;
  cwd: string;
  sessionId: string | null;
}

export type HerdrConnection = 'connected' | 'unavailable';

export interface AgentsDto {
  herdr: HerdrConnection;
  agents: AgentDto[];
}

export type ServerEvent =
  | { type: 'diff.changed'; fingerprint: string }
  | { type: 'context.changed' }
  | { type: 'thread.updated'; threadId: string }
  | { type: 'review.updated'; reviewId: string }
  | { type: 'agents.updated'; herdr: HerdrConnection; agents: AgentDto[] };

export interface CreateThreadInput {
  view: ViewRef;
  path: string;
  side: Side;
  startLine: number;
  endLine: number;
  body: string;
}
