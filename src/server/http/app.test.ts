import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAgent, startFakeHerdrServer } from '../../../test/helpers/fakeHerdrServer.ts';
import type { FakeHerdrServer } from '../../../test/helpers/fakeHerdrServer.ts';
import { createServiceHarness } from '../../../test/helpers/serviceHarness.ts';
import type { ServiceHarness } from '../../../test/helpers/serviceHarness.ts';
import { createTempRepo, lines } from '../../../test/helpers/tempRepo.ts';
import type { TempRepo } from '../../../test/helpers/tempRepo.ts';
import { createApp } from './app.ts';
import { sessionCookieName } from './securityMiddleware.ts';
import { SseHub } from './sseHub.ts';

const PORT = 4321;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const secrets = {
  port: () => PORT,
  browserToken: 'browser-token',
  sessionSecret: 'session-secret',
  replyToken: 'reply-token',
};
const cookie = `${sessionCookieName(PORT)}=${secrets.sessionSecret}`;

let repo: TempRepo;
let herdr: FakeHerdrServer;
let h: ServiceHarness;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  repo = createTempRepo();
  repo.write('a.ts', lines('one', 'two'));
  repo.commit('base');
  repo.git('checkout', '-q', '-b', 'feat');
  repo.write('a.ts', lines('one', 'TWO'));
  herdr = await startFakeHerdrServer();
  herdr.agents = [fakeAgent({ pane_id: 'p1', cwd: repo.root })];
  h = await createServiceHarness({ repoRoot: repo.root, herdr });
  await h.agents.refresh();
  app = createApp({
    services: {
      context: h.context,
      diff: h.diff,
      threads: h.threads,
      reviews: h.reviewService,
      agents: h.agents,
      replies: h.replies,
      changes: { currentFingerprint: () => 'fp' },
      hub: new SseHub(),
      publish: () => undefined,
      limits: { commentMaxBytes: 1024, replyMaxBytes: 1024, sseKeepAliveMs: 1000 },
    },
    secrets,
    webRoot: '/nonexistent',
    onUnexpectedError: () => undefined,
  });
});

afterEach(async () => {
  h.stop();
  await herdr.close();
  repo.cleanup();
});

const request = (path: string, init: RequestInit & { host?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set('host', init.host ?? `127.0.0.1:${PORT}`);
  return app.request(`${ORIGIN}${path}`, { ...init, headers });
};

const authed = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookie);
  if (init.body !== undefined) {
    headers.set('origin', ORIGIN);
    headers.set('content-type', 'application/json');
  }
  return request(path, { ...init, headers });
};

describe('security middleware', () => {
  it('rejects foreign Host headers (DNS rebinding)', async () => {
    expect((await request('/api/context', { host: 'evil.example:4321' })).status).toBe(403);
    expect((await request('/', { host: `127.0.0.1:${PORT + 1}` })).status).toBe(403);
  });

  it('exchanges the URL token for an HttpOnly, SameSite=Strict cookie', async () => {
    const response = await request('/merged?token=browser-token');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/merged');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(cookie);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect((await request('/merged?token=wrong')).status).toBe(403);
  });

  it('requires the session cookie for the API', async () => {
    expect((await request('/api/context')).status).toBe(401);
    expect((await authed('/api/context')).status).toBe(200);
  });

  it('refuses state changes without our Origin (CSRF)', async () => {
    const init = { method: 'POST', body: '{}', headers: { cookie, 'content-type': 'application/json' } };
    expect((await request('/api/threads/relocate', init)).status).toBe(403);
    const cross = { ...init, headers: { ...init.headers, origin: 'http://evil.example' } };
    expect((await request('/api/threads/relocate', cross)).status).toBe(403);
    expect((await authed('/api/threads/relocate', { method: 'POST', body: '{}' })).status).toBe(200);
  });

  it('sets a strict Content-Security-Policy', async () => {
    const response = await authed('/api/context');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('accepts only the reply token on agent routes', async () => {
    const reply = (authorization: string) =>
      request('/api/agent/threads/T/replies', {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'hi' }),
      });
    expect((await reply('Bearer session-secret')).status).toBe(401);
    expect((await reply('Bearer reply-token')).status).toBe(404);
  });
});

describe('API routes', () => {
  it('lists files and refuses paths outside the diff', async () => {
    const files = (await (await authed('/api/diff?view=merged')).json()) as { files: { newPath: string }[] };
    expect(files.files.map((f) => f.newPath)).toEqual(['a.ts']);
    expect((await authed('/api/diff/file?view=merged&path=a.ts')).status).toBe(200);
    expect((await authed('/api/diff/file?view=merged&path=../../etc/passwd')).status).toBe(404);
    expect((await authed('/api/diff?view=bogus')).status).toBe(400);
  });

  it('creates a thread, submits it and accepts the agent reply', async () => {
    const created = await authed('/api/threads', {
      method: 'POST',
      body: JSON.stringify({
        view: 'merged',
        path: 'a.ts',
        side: 'new',
        startLine: 2,
        endLine: 2,
        body: 'Why caps?',
      }),
    });
    expect(created.status).toBe(201);
    const thread = (await created.json()) as { id: string };

    const submitted = await authed('/api/review/submit', {
      method: 'POST',
      body: JSON.stringify({ summary: '', targetPaneId: 'p1' }),
    });
    expect(submitted.status).toBe(200);
    await h.worker.idle();
    expect(herdr.prompts).toHaveLength(1);

    const reply = await request(`/api/agent/threads/${thread.id}/replies`, {
      method: 'POST',
      headers: { authorization: 'Bearer reply-token', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'addressed', body: 'Lowered it.', agentLabel: 'claude' }),
    });
    expect(reply.status).toBe(201);
    const threads = (await (await authed('/api/threads?view=merged')).json()) as { status: string }[];
    expect(threads[0]?.status).toBe('addressed');
  });

  it('maps validation and state errors to 400 and 409', async () => {
    const bad = await authed('/api/threads', {
      method: 'POST',
      body: JSON.stringify({
        view: 'merged',
        path: 'a.ts',
        side: 'new',
        startLine: 3,
        endLine: 2,
        body: 'x',
      }),
    });
    expect(bad.status).toBe(400);
    const outside = await authed('/api/threads', {
      method: 'POST',
      body: JSON.stringify({
        view: 'merged',
        path: 'a.ts',
        side: 'new',
        startLine: 9,
        endLine: 9,
        body: 'x',
      }),
    });
    expect(outside.status).toBe(400);
    const noDraft = await authed('/api/review/submit', {
      method: 'POST',
      body: JSON.stringify({ targetPaneId: 'p1' }),
    });
    expect(noDraft.status).toBe(409);
  });

  it('serves a placeholder page when the web app is not built', async () => {
    const response = await request('/commit/abc1234');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('npm run build');
  });
});
