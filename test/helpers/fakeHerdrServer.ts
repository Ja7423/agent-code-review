import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { HerdrAgentInfo } from '../../src/server/adapters/herdr/herdrProtocol.ts';

export type FakePromptBehavior =
  | { kind: 'prompted' }
  | { kind: 'error'; code: string; message?: string }
  | { kind: 'hang' }
  | { kind: 'drop' };

export interface ReceivedPrompt {
  target: string;
  text: string;
  wait: unknown;
}

export interface FakeHerdrServer {
  socketPath: string;
  agents: HerdrAgentInfo[];
  promptBehavior: FakePromptBehavior;
  prompts: ReceivedPrompt[];
  subscriptions: unknown[][];
  emit(event: string, data: unknown): void;
  dropSubscribers(): void;
  close(): Promise<void>;
}

interface Request {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

/** A herdr stand-in on a temporary unix socket, speaking the same NDJSON envelope. */
export async function startFakeHerdrServer(): Promise<FakeHerdrServer> {
  const dir = mkdtempSync(path.join(tmpdir(), 'revi-herdr-'));
  const socketPath = path.join(dir, 'herdr.sock');
  const subscribers = new Set<Socket>();
  const sockets = new Set<Socket>();

  const fake: FakeHerdrServer = {
    socketPath,
    agents: [],
    promptBehavior: { kind: 'prompted' },
    prompts: [],
    subscriptions: [],
    emit(event, data) {
      for (const socket of subscribers) socket.write(`${JSON.stringify({ event, data })}\n`);
    },
    dropSubscribers() {
      for (const socket of subscribers) socket.destroy();
      subscribers.clear();
    },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          rmSync(dir, { recursive: true, force: true });
          resolve();
        });
      }),
  };

  const reply = (socket: Socket, payload: unknown): void => void socket.write(`${JSON.stringify(payload)}\n`);

  const handlePrompt = (socket: Socket, request: Request): void => {
    fake.prompts.push(request.params as unknown as ReceivedPrompt);
    const behavior = fake.promptBehavior;
    if (behavior.kind === 'hang') return;
    if (behavior.kind === 'drop') return void socket.destroy();
    if (behavior.kind === 'error') {
      return reply(socket, {
        id: request.id,
        error: { code: behavior.code, message: behavior.message ?? behavior.code },
      });
    }
    reply(socket, { id: request.id, result: { type: 'agent_prompted', agent: fake.agents[0] } });
  };

  const handle = (socket: Socket, request: Request): void => {
    if (request.method === 'ping')
      return reply(socket, { id: request.id, result: { type: 'pong', version: 'fake', protocol: 22 } });
    if (request.method === 'agent.list')
      return reply(socket, { id: request.id, result: { type: 'agent_list', agents: fake.agents } });
    if (request.method === 'agent.prompt') return handlePrompt(socket, request);
    if (request.method === 'events.subscribe') {
      fake.subscriptions.push(request.params.subscriptions as unknown[]);
      subscribers.add(socket);
      return reply(socket, { id: request.id, result: { type: 'subscription_started' } });
    }
    reply(socket, { id: request.id, error: { code: 'unknown_method', message: request.method } });
  };

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        handle(socket, JSON.parse(buffer.slice(0, newline)) as Request);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => {
      subscribers.delete(socket);
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return fake;
}

export function fakeAgent(overrides: Partial<HerdrAgentInfo> & { pane_id: string }): HerdrAgentInfo {
  return {
    agent: 'claude',
    agent_status: 'idle',
    cwd: '/repo',
    agent_session: { value: 'session-1' },
    ...overrides,
  };
}
