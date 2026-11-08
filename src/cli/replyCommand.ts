import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { config } from '../server/config.ts';
import { systemClock } from '../server/adapters/runtime/clock.ts';
import { createUlidGenerator } from '../server/adapters/runtime/idGenerator.ts';
import { databasePath, serverRegistry } from '../server/adapters/runtime/serverRegistry.ts';
import type { ServerEntry } from '../server/adapters/runtime/serverRegistry.ts';
import { createTransactor, openDatabase } from '../server/adapters/store/database.ts';
import { ThreadRepository } from '../server/adapters/store/ThreadRepository.ts';
import { AGENT_REPLY_STATUSES, isAgentReplyStatus } from '../server/domain/thread/threadStatus.ts';
import { ReplyService } from '../server/services/ReplyService.ts';
import type { AgentReplyStatus } from '../shared/types.ts';
import { discoverWorktree } from './gitDiscovery.ts';

export const REPLY_USAGE = `Usage: revi reply <threadId> [--status ${AGENT_REPLY_STATUSES.join('|')}]
                  (--body <text> | --body-file <path|->) [--agent-label <name>]`;

interface ReplyInput {
  threadId: string;
  status?: AgentReplyStatus;
  body: string;
  agentLabel: string | null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(body: string | undefined, bodyFile: string | undefined): Promise<string> {
  if (body !== undefined) return body;
  if (bodyFile === '-') return readStdin();
  if (bodyFile !== undefined) return readFile(bodyFile, 'utf8');
  throw new Error(`A reply needs --body or --body-file.\n${REPLY_USAGE}`);
}

async function parseReplyArgs(argv: readonly string[]): Promise<ReplyInput> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      status: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      'agent-label': { type: 'string' },
    },
  });
  const [threadId] = positionals;
  if (!threadId) throw new Error(REPLY_USAGE);
  if (values.status !== undefined && !isAgentReplyStatus(values.status)) {
    throw new Error(`--status must be one of ${AGENT_REPLY_STATUSES.join(', ')} (got "${values.status}")`);
  }
  return {
    threadId,
    status: values.status,
    body: (await readBody(values.body, values['body-file'])).trim(),
    agentLabel: values['agent-label'] ?? process.env.REVI_AGENT_LABEL ?? null,
  };
}

/** Returns `false` when the server is unreachable, so the caller can write to the database instead. */
async function replyOverHttp(entry: ServerEntry, input: ReplyInput): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(
      `http://127.0.0.1:${entry.port}/api/agent/threads/${encodeURIComponent(input.threadId)}/replies`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.replyToken}` },
        body: JSON.stringify({ status: input.status, body: input.body, agentLabel: input.agentLabel }),
      },
    );
  } catch {
    return false;
  }
  if (response.ok) return true;
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(payload.error ?? `revi server answered ${response.status}`);
}

function replyDirectly(commonDir: string, worktreePath: string, input: ReplyInput): void {
  const db = openDatabase(databasePath(commonDir), { busyTimeoutMs: config.SQLITE_BUSY_TIMEOUT_MS });
  try {
    const replies = new ReplyService({
      threads: new ThreadRepository(db),
      transactor: createTransactor(db),
      clock: systemClock,
      ids: createUlidGenerator(),
    });
    replies.reply({ ...input, worktreePath });
  } finally {
    db.close();
  }
}

export async function replyCommand(argv: readonly string[]): Promise<void> {
  const input = await parseReplyArgs(argv);
  const { worktreePath, commonDir } = await discoverWorktree(process.cwd());
  const entry = serverRegistry.read(commonDir, worktreePath);
  const isSentOverHttp = entry !== null && (await replyOverHttp(entry, input));
  if (!isSentOverHttp) replyDirectly(commonDir, worktreePath, input);
  const status = input.status ? ` (status: ${input.status})` : '';
  console.log(
    `revi: reply recorded on thread ${input.threadId}${status}${isSentOverHttp ? '' : ' (revi server offline; saved for later)'}`,
  );
}
