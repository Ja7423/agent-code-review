import { realpath } from 'node:fs/promises';
import { FsWorkingTreeReader } from '../../src/server/adapters/fs/WorkingTreeReader.ts';
import type { PromptFileWriter } from '../../src/server/adapters/fs/PromptFileWriter.ts';
import { ExecGitClient } from '../../src/server/adapters/git/GitClient.ts';
import { SocketHerdrClient } from '../../src/server/adapters/herdr/HerdrClient.ts';
import { createTransactor, openDatabase } from '../../src/server/adapters/store/database.ts';
import type { Database } from '../../src/server/adapters/store/database.ts';
import { DeliveryRepository } from '../../src/server/adapters/store/DeliveryRepository.ts';
import { ReviewRepository } from '../../src/server/adapters/store/ReviewRepository.ts';
import { ThreadRepository } from '../../src/server/adapters/store/ThreadRepository.ts';
import { AgentDirectory } from '../../src/server/services/AgentDirectory.ts';
import { DeliveryWorker } from '../../src/server/services/DeliveryWorker.ts';
import { DiffService } from '../../src/server/services/DiffService.ts';
import { PromptAssembler } from '../../src/server/services/PromptAssembler.ts';
import { RepoContext } from '../../src/server/services/RepoContext.ts';
import { ReplyService } from '../../src/server/services/ReplyService.ts';
import { ReviewService } from '../../src/server/services/ReviewService.ts';
import { ThreadService } from '../../src/server/services/ThreadService.ts';
import type { ServerEvent } from '../../src/shared/types.ts';
import { createFakeClock, createSequentialIds } from './fakeClock.ts';
import { builtInPromptTemplate } from './promptTemplate.ts';
import type { FakeHerdrServer } from './fakeHerdrServer.ts';

export interface ServiceHarness {
  db: Database;
  events: ServerEvent[];
  promptFiles: Map<string, string>;
  context: RepoContext;
  diff: DiffService;
  threads: ThreadService;
  reviewService: ReviewService;
  reviews: ReviewRepository;
  deliveries: DeliveryRepository;
  agents: AgentDirectory;
  worker: DeliveryWorker;
  replies: ReplyService;
  stop(): void;
}

/** Wires the real services the way `serveCommand` does, with fakes at the edges. */
export async function createServiceHarness(params: {
  repoRoot: string;
  herdr: FakeHerdrServer;
  db?: Database;
  maxInlineBytes?: number;
  /** Defaults to true. Pass false to call `worker.start()` yourself (e.g. to observe recovery). */
  startWorker?: boolean;
}): Promise<ServiceHarness> {
  const events: ServerEvent[] = [];
  const publish = (event: ServerEvent): void => void events.push(event);
  const clock = createFakeClock();
  const ids = createSequentialIds();
  const db = params.db ?? openDatabase(':memory:', { busyTimeoutMs: 1_000 });
  const transactor = createTransactor(db);
  const git = new ExecGitClient(params.repoRoot);
  const context = await RepoContext.load(git);
  const diff = new DiffService({
    git,
    context,
    files: new FsWorkingTreeReader(params.repoRoot),
    limits: { largeFileChangedLines: 1500, maxUntrackedFiles: 200 },
  });
  const threadRepo = new ThreadRepository(db);
  const reviews = new ReviewRepository(db);
  const deliveries = new DeliveryRepository(db);
  const herdr = new SocketHerdrClient({
    socketPath: params.herdr.socketPath,
    requestTimeoutMs: 1_000,
    reconnectMinMs: 20,
    reconnectMaxMs: 100,
  });
  const agents = new AgentDirectory({
    herdr,
    worktreeRoot: () => context.current().worktreePath,
    listWorktreeRoots: () => context.listWorktreeRoots(),
    realpath,
    pollIntervalMs: 60_000,
    publish,
  });
  const promptFiles = new Map<string, string>();
  const files: PromptFileWriter = {
    write: async (name, text) => {
      promptFiles.set(name, text);
      return `/prompts/${name}.md`;
    },
  };
  const prompts = new PromptAssembler({
    threads: threadRepo,
    diff,
    files,
    template: builtInPromptTemplate,
    maxInlineBytes: params.maxInlineBytes ?? 32_768,
    contextLines: 3,
    replyCommand: 'revi reply',
  });
  const worker = new DeliveryWorker({
    reviews,
    deliveries,
    transactor,
    herdr,
    agents,
    prompts,
    clock,
    worktreePath: context.current().worktreePath,
    promptAckTimeoutMs: 200,
    publish,
  });
  const threads = new ThreadService({
    threads: threadRepo,
    reviews,
    transactor,
    diff,
    context,
    clock,
    ids,
    contextLines: 3,
    publish,
  });
  const reviewService = new ReviewService({
    reviews,
    deliveries,
    threads: threadRepo,
    transactor,
    context,
    agents,
    clock,
    ids,
    publish,
    onQueued: () => worker.kick(),
  });
  const replies = new ReplyService({ threads: threadRepo, transactor, clock, ids, publish });
  if (params.startWorker ?? true) worker.start();
  return {
    db,
    events,
    promptFiles,
    context,
    diff,
    threads,
    reviewService,
    reviews,
    deliveries,
    agents,
    worker,
    replies,
    stop: () => {
      worker.stop();
      agents.stop();
    },
  };
}
