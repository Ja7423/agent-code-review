import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAgent, startFakeHerdrServer } from '../../../../test/helpers/fakeHerdrServer.ts';
import type { FakeHerdrServer } from '../../../../test/helpers/fakeHerdrServer.ts';
import type { HerdrConnection } from '../../../shared/types.ts';
import { HerdrUnavailableError, SocketHerdrClient } from './HerdrClient.ts';

let fake: FakeHerdrServer;
let client: SocketHerdrClient;

const options = (socketPath: string) => ({
  socketPath,
  requestTimeoutMs: 500,
  reconnectMinMs: 20,
  reconnectMaxMs: 80,
});

beforeEach(async () => {
  fake = await startFakeHerdrServer();
  client = new SocketHerdrClient(options(fake.socketPath));
});

afterEach(async () => {
  await fake.close();
});

const waitFor = async (check: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('SocketHerdrClient requests', () => {
  it('pairs responses with requests and maps agents', async () => {
    fake.agents = [fakeAgent({ pane_id: 'p1', foreground_cwd: '/repo/src', name: 'main' })];
    const [agents, info] = await Promise.all([client.listAgents(), client.getServerInfo()]);
    expect(agents).toEqual([
      {
        paneId: 'p1',
        name: 'main',
        kind: 'claude',
        status: 'idle',
        cwd: '/repo/src',
        sessionId: 'session-1',
      },
    ]);
    expect(info).toEqual({ version: 'fake', protocol: 22 });
  });

  it('reports a missing server as unavailable', async () => {
    const missing = new SocketHerdrClient(options('/nonexistent/herdr.sock'));
    await expect(missing.listAgents()).rejects.toBeInstanceOf(HerdrUnavailableError);
  });
});

describe('SocketHerdrClient.prompt', () => {
  const wait = { until: ['working', 'blocked'] as const, timeout_ms: 100 };

  it('sends target, text and wait options', async () => {
    expect(await client.prompt('p1', 'hello', { ...wait, until: [...wait.until] })).toEqual({
      kind: 'prompted',
    });
    expect(fake.prompts).toEqual([
      { target: 'p1', text: 'hello', wait: { until: ['working', 'blocked'], timeout_ms: 100 } },
    ]);
  });

  it('maps agent_blocked, stalls, timeouts and other errors', async () => {
    const run = () => client.prompt('p1', 'x', { ...wait, until: [...wait.until] });
    fake.promptBehavior = { kind: 'error', code: 'agent_blocked' };
    expect(await run()).toEqual({ kind: 'blocked' });
    fake.promptBehavior = { kind: 'error', code: 'agent_prompt_stalled' };
    expect((await run()).kind).toBe('uncertain');
    fake.promptBehavior = { kind: 'error', code: 'timeout' };
    expect((await run()).kind).toBe('uncertain');
    fake.promptBehavior = { kind: 'error', code: 'pane_not_found' };
    expect((await run()).kind).toBe('failed');
  });

  it('treats a dropped connection after sending as uncertain', async () => {
    fake.promptBehavior = { kind: 'drop' };
    expect((await client.prompt('p1', 'x', { until: ['working'], timeout_ms: 100 })).kind).toBe('uncertain');
  });

  it('treats a missing server as failed, since nothing was sent', async () => {
    const missing = new SocketHerdrClient(options('/nonexistent/herdr.sock'));
    expect((await missing.prompt('p1', 'x', { until: ['working'], timeout_ms: 100 })).kind).toBe('failed');
  });
});

describe('SocketHerdrClient.subscribe', () => {
  it('delivers events and reconnects after the server drops it', async () => {
    const events: string[] = [];
    const states: HerdrConnection[] = [];
    const stop = client.subscribe(
      [{ type: 'pane.closed' }],
      (event) => events.push(event.event),
      (state) => states.push(state),
    );
    await waitFor(() => states.includes('connected'));
    fake.emit('pane.closed', { pane_id: 'p1' });
    await waitFor(() => events.length === 1);
    fake.dropSubscribers();
    await waitFor(() => states.filter((s) => s === 'connected').length === 2);
    expect(states).toEqual(['connected', 'unavailable', 'connected']);
    expect(fake.subscriptions).toEqual([[{ type: 'pane.closed' }], [{ type: 'pane.closed' }]]);
    stop();
  });
});
