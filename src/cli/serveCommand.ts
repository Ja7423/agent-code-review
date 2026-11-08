import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { ServerEvent } from '../shared/types.ts';
import { config, PROMPT_TEMPLATE_FILE, REPLY_COMMAND } from '../server/config.ts';
import { FsPromptFileWriter } from '../server/adapters/fs/PromptFileWriter.ts';
import { FsPromptTemplateSource } from '../server/adapters/fs/PromptTemplateSource.ts';
import { FsChangeWatcher } from '../server/adapters/fs/FsWatcher.ts';
import { FsWorkingTreeReader } from '../server/adapters/fs/WorkingTreeReader.ts';
import { ExecGitClient } from '../server/adapters/git/GitClient.ts';
import { SocketHerdrClient } from '../server/adapters/herdr/HerdrClient.ts';
import { SUPPORTED_PROTOCOL } from '../server/adapters/herdr/herdrProtocol.ts';
import { systemClock } from '../server/adapters/runtime/clock.ts';
import { createUlidGenerator } from '../server/adapters/runtime/idGenerator.ts';
import { reviDataDir, databasePath, serverRegistry } from '../server/adapters/runtime/serverRegistry.ts';
import { createTransactor, openDatabase } from '../server/adapters/store/database.ts';
import type { Database, Transactor } from '../server/adapters/store/database.ts';
import { DeliveryRepository } from '../server/adapters/store/DeliveryRepository.ts';
import { ReviewRepository } from '../server/adapters/store/ReviewRepository.ts';
import { ThreadRepository } from '../server/adapters/store/ThreadRepository.ts';
import { createApp } from '../server/http/app.ts';
import type { AppServices } from '../server/http/appServices.ts';
import { SseHub } from '../server/http/sseHub.ts';
import { AgentDirectory } from '../server/services/AgentDirectory.ts';
import { ChangeMonitor } from '../server/services/ChangeMonitor.ts';
import { DeliveryWorker } from '../server/services/DeliveryWorker.ts';
import { DiffService } from '../server/services/DiffService.ts';
import { checkPromptTemplate } from '../server/domain/prompt/reviewPrompt.ts';
import { PromptAssembler } from '../server/services/PromptAssembler.ts';
import { RepoContext } from '../server/services/RepoContext.ts';
import { ReplyService } from '../server/services/ReplyService.ts';
import { ReviewService } from '../server/services/ReviewService.ts';
import { ThreadService } from '../server/services/ThreadService.ts';
import { discoverWorktree } from './gitDiscovery.ts';

export const SERVE_USAGE = `Usage: revi [serve] [--base <ref>] [--port <n>] [--no-open] [--herdr-socket <path>]
            [--prompt-template <path>]`;

interface ServeOptions {
  base?: string;
  port: number;
  shouldOpen: boolean;
  herdrSocket: string;
  promptTemplate?: string;
}

function parseServeArgs(argv: readonly string[]): ServeOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      base: { type: 'string' },
      port: { type: 'string', default: '0' },
      'no-open': { type: 'boolean', default: false },
      'herdr-socket': { type: 'string' },
      'prompt-template': { type: 'string' },
    },
  });
  return {
    base: values.base,
    port: Number.parseInt(values.port, 10),
    shouldOpen: !values['no-open'],
    herdrSocket:
      values['herdr-socket'] ??
      process.env.HERDR_SOCKET_PATH ??
      path.join(homedir(), '.config', 'herdr', 'herdr.sock'),
    promptTemplate: values['prompt-template'],
  };
}

/** A path inside this package, whether running from `src/cli` or `dist/cli`. */
function packagePath(...segments: string[]): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', ...segments);
}

/** `--prompt-template`, else `$XDG_CONFIG_HOME/revi/review-prompt.md` when present, else the built-in one. */
function promptTemplateSource(explicit: string | undefined): FsPromptTemplateSource {
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
  return new FsPromptTemplateSource({
    explicit: explicit === undefined ? undefined : path.resolve(explicit),
    user: path.join(configHome, 'revi', PROMPT_TEMPLATE_FILE),
    builtIn: packagePath('templates', PROMPT_TEMPLATE_FILE),
  });
}

/** Fails at startup, not on the first Submit, when the template is missing or malformed. */
async function checkTemplateSource(source: FsPromptTemplateSource): Promise<void> {
  const template = await source.read();
  try {
    checkPromptTemplate(template.text);
  } catch (error) {
    throw new Error(`Prompt template ${template.path} is invalid: ${(error as Error).message}`, {
      cause: error,
    });
  }
  console.log(`revi: prompt template ${template.path}`);
}

const secret = (): string => randomBytes(32).toString('base64url');

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(command, [url], (error) => {
    if (error) console.error(`Could not open a browser (${error.message}). Open the link above yourself.`);
  });
}

function logError(error: unknown): void {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
}

async function warnOnHerdrProtocol(herdr: SocketHerdrClient): Promise<void> {
  try {
    const info = await herdr.getServerInfo();
    if (info.protocol !== SUPPORTED_PROTOCOL) {
      console.warn(
        `herdr ${info.version} speaks protocol ${info.protocol}; revi was built for ${SUPPORTED_PROTOCOL}.`,
      );
    }
  } catch {
    console.warn('herdr is not running. Reviews wait as drafts until an agent appears in this worktree.');
  }
}

interface Store {
  db: Database;
  transactor: Transactor;
  threads: ThreadRepository;
  reviews: ReviewRepository;
  deliveries: DeliveryRepository;
}

function openStore(commonDir: string): Store {
  const db = openDatabase(databasePath(commonDir), { busyTimeoutMs: config.SQLITE_BUSY_TIMEOUT_MS });
  return {
    db,
    transactor: createTransactor(db),
    threads: new ThreadRepository(db),
    reviews: new ReviewRepository(db),
    deliveries: new DeliveryRepository(db),
  };
}

interface Runtime {
  context: RepoContext;
  diff: DiffService;
  store: Store;
  herdr: SocketHerdrClient;
  agents: AgentDirectory;
  publish: (event: ServerEvent) => void;
}

function createHerdrSide(context: RepoContext, socketPath: string, publish: (event: ServerEvent) => void) {
  const herdr = new SocketHerdrClient({
    socketPath,
    requestTimeoutMs: config.HERDR_REQUEST_TIMEOUT_MS,
    reconnectMinMs: config.HERDR_RECONNECT_MIN_MS,
    reconnectMaxMs: config.HERDR_RECONNECT_MAX_MS,
  });
  const agents = new AgentDirectory({
    herdr,
    worktreeRoot: () => context.current().worktreePath,
    listWorktreeRoots: () => context.listWorktreeRoots(),
    realpath,
    pollIntervalMs: config.AGENT_POLL_INTERVAL_MS,
    publish,
  });
  return { herdr, agents };
}

function createWorker(runtime: Runtime, template: FsPromptTemplateSource): DeliveryWorker {
  const { store, context } = runtime;
  return new DeliveryWorker({
    reviews: store.reviews,
    deliveries: store.deliveries,
    transactor: store.transactor,
    herdr: runtime.herdr,
    agents: runtime.agents,
    prompts: new PromptAssembler({
      threads: store.threads,
      diff: runtime.diff,
      files: new FsPromptFileWriter(path.join(reviDataDir(context.current().commonDir), 'prompts')),
      template,
      maxInlineBytes: config.MAX_INLINE_PROMPT_BYTES,
      contextLines: config.CONTEXT_LINES,
      replyCommand: REPLY_COMMAND,
    }),
    clock: systemClock,
    worktreePath: context.current().worktreePath,
    promptAckTimeoutMs: config.PROMPT_ACK_TIMEOUT_MS,
    publish: runtime.publish,
  });
}

function createChangeMonitor(runtime: Runtime): ChangeMonitor {
  const { worktreePath, gitDir } = runtime.context.current();
  const watcher = new FsChangeWatcher(
    [
      { directory: worktreePath, ignore: ['node_modules', '.git/objects', '.git/revi', '.git/logs'] },
      { directory: gitDir, ignore: ['objects', 'logs', 'revi'] },
    ],
    config.WATCH_DEBOUNCE_MS,
  );
  return new ChangeMonitor({
    watcher,
    context: runtime.context,
    diff: runtime.diff,
    publish: runtime.publish,
    onError: logError,
  });
}

function createAppServices(
  runtime: Runtime,
  hub: SseHub,
  worker: DeliveryWorker,
  changes: ChangeMonitor,
): AppServices {
  const { store, context, publish } = runtime;
  const shared = { transactor: store.transactor, clock: systemClock, ids: createUlidGenerator(), publish };
  return {
    context,
    diff: runtime.diff,
    threads: new ThreadService({
      ...shared,
      threads: store.threads,
      reviews: store.reviews,
      diff: runtime.diff,
      context,
      contextLines: config.CONTEXT_LINES,
    }),
    reviews: new ReviewService({
      ...shared,
      reviews: store.reviews,
      deliveries: store.deliveries,
      threads: store.threads,
      context,
      agents: runtime.agents,
      onQueued: () => worker.kick(),
    }),
    agents: runtime.agents,
    replies: new ReplyService({ ...shared, threads: store.threads }),
    changes,
    hub,
    publish,
    limits: {
      commentMaxBytes: config.COMMENT_BODY_MAX_BYTES,
      replyMaxBytes: config.REPLY_BODY_MAX_BYTES,
      sseKeepAliveMs: config.SSE_KEEPALIVE_MS,
    },
  };
}

async function listen(app: Hono, requestedPort: number): Promise<{ server: ServerType; port: number }> {
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: requestedPort });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, port: (server.address() as AddressInfo).port };
}

/** The composition root: the only place that wires concrete adapters into services. */
export async function serveCommand(argv: readonly string[]): Promise<void> {
  const options = parseServeArgs(argv);
  const template = promptTemplateSource(options.promptTemplate);
  await checkTemplateSource(template);
  const { worktreePath } = await discoverWorktree(process.cwd());
  const git = new ExecGitClient(worktreePath);
  const context = await RepoContext.load(git, { baseOverride: options.base });
  const { commonDir } = context.current();
  const hub = new SseHub();
  const publish = hub.broadcast.bind(hub);
  const diff = new DiffService({
    git,
    context,
    files: new FsWorkingTreeReader(worktreePath),
    limits: {
      largeFileChangedLines: config.LARGE_FILE_CHANGED_LINES,
      maxUntrackedFiles: config.MAX_UNTRACKED_FILES,
    },
  });
  const runtime: Runtime = {
    context,
    diff,
    store: openStore(commonDir),
    publish,
    ...createHerdrSide(context, options.herdrSocket, publish),
  };
  const worker = createWorker(runtime, template);
  const changes = createChangeMonitor(runtime);

  let port = options.port;
  const secrets = { port: () => port, browserToken: secret(), sessionSecret: secret(), replyToken: secret() };
  const app = createApp({
    services: createAppServices(runtime, hub, worker, changes),
    secrets,
    webRoot: packagePath('dist', 'web'),
    onUnexpectedError: logError,
  });
  const listening = await listen(app, options.port);
  port = listening.port;

  serverRegistry.write(commonDir, {
    port,
    pid: process.pid,
    replyToken: secrets.replyToken,
    worktreePath,
    startedAt: new Date().toISOString(),
  });
  await warnOnHerdrProtocol(runtime.herdr);
  await runtime.agents.start();
  worker.start();
  await changes.start();

  const url = `http://127.0.0.1:${port}/merged?token=${secrets.browserToken}`;
  const { branch, baseRef } = context.current();
  console.log(`revi: reviewing ${branch} against ${baseRef} in ${worktreePath}`);
  console.log(`revi: ${url}`);
  if (options.shouldOpen) openBrowser(url);

  const shutdown = (): void => {
    changes.stop();
    worker.stop();
    runtime.agents.stop();
    serverRegistry.remove(commonDir, worktreePath);
    listening.server.close();
    runtime.store.db.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
