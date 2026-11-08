import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeAgent, startFakeHerdrServer } from '../../../test/helpers/fakeHerdrServer.ts';
import type { FakeHerdrServer } from '../../../test/helpers/fakeHerdrServer.ts';
import { createServiceHarness } from '../../../test/helpers/serviceHarness.ts';
import type { ServiceHarness } from '../../../test/helpers/serviceHarness.ts';
import { createTempRepo, lines } from '../../../test/helpers/tempRepo.ts';
import type { TempRepo } from '../../../test/helpers/tempRepo.ts';
import { openDatabase } from '../adapters/store/database.ts';
import { BLOCKED_MESSAGE } from './DeliveryWorker.ts';

let repo: TempRepo;
let herdr: FakeHerdrServer;
let h: ServiceHarness;

beforeEach(async () => {
  repo = createTempRepo();
  repo.write('src/user.ts', lines('export function user(id) {', '  return db.find(id);', '}'));
  repo.commit('base');
  repo.git('checkout', '-q', '-b', 'feat');
  repo.write(
    'src/user.ts',
    lines('export function user(id) {', '  const row = db.find(id);', '  return row.name;', '}'),
  );
  herdr = await startFakeHerdrServer();
  herdr.agents = [fakeAgent({ pane_id: 'p1', cwd: repo.root, name: 'claude-main' })];
  h = await createServiceHarness({ repoRoot: repo.root, herdr });
  await h.agents.refresh();
});

afterEach(async () => {
  h.stop();
  await herdr.close();
  repo.cleanup();
});

const commentOnRow = () =>
  h.threads.createThread({
    view: { kind: 'merged' },
    path: 'src/user.ts',
    side: 'new',
    startLine: 2,
    endLine: 3,
    body: 'row can be undefined here',
  });

describe('review flow', () => {
  it('drafts a comment, submits it and delivers one prompt to the idle agent', async () => {
    const thread = await commentOnRow();
    expect(thread.comments).toMatchObject([{ isDraft: true, body: 'row can be undefined here' }]);
    expect(h.reviewService.getDraft()?.commentCount).toBe(1);

    const submitted = h.reviewService.submit({ summary: 'Null safety', targetPaneId: 'p1' });
    // Submitting wakes the worker synchronously, so the review may already be on its way.
    expect(['queued', 'delivering']).toContain(submitted.status);
    await h.worker.idle();

    expect(herdr.prompts).toHaveLength(1);
    const prompt = herdr.prompts[0];
    expect(prompt?.target).toBe('p1');
    expect(prompt?.wait).toEqual({ until: ['working', 'blocked'], timeout_ms: 200 });
    expect(prompt?.text).toContain('### [T1] src/user.ts:2-3 (new side, merged diff)');
    expect(prompt?.text).toContain('+  const row = db.find(id);');
    expect(prompt?.text).toContain(`T1=${thread.id}`);
    expect(h.reviews.get(submitted.id)).toMatchObject({ status: 'delivered', targetLabel: 'claude-main' });
    expect(h.deliveries.latestForReview(submitted.id)?.state).toBe('sent');
    expect(h.threads.getThread(thread.id).comments[0]?.isDraft).toBe(false);
  });

  it('waits while the agent is working and sends once it is idle', async () => {
    herdr.agents = [fakeAgent({ pane_id: 'p1', cwd: repo.root, agent_status: 'working' })];
    await h.agents.refresh();
    await commentOnRow();
    const review = h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await h.worker.idle();
    expect(herdr.prompts).toHaveLength(0);
    expect(h.reviews.get(review.id)?.status).toBe('queued');

    herdr.agents = [fakeAgent({ pane_id: 'p1', cwd: repo.root, agent_status: 'idle' })];
    await h.agents.refresh();
    await h.worker.idle();
    expect(herdr.prompts).toHaveLength(1);
    expect(h.reviews.get(review.id)?.status).toBe('delivered');
  });

  it('keeps the review queued when herdr reports agent_blocked', async () => {
    herdr.promptBehavior = { kind: 'error', code: 'agent_blocked' };
    await commentOnRow();
    const review = h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await h.worker.idle();
    expect(h.reviews.get(review.id)).toMatchObject({ status: 'queued', lastError: BLOCKED_MESSAGE });
    expect(h.deliveries.latestForReview(review.id)).toMatchObject({ state: 'pending', attempt: 1 });
  });

  it('marks an uncertain delivery failed and lets the user retry it', async () => {
    herdr.promptBehavior = { kind: 'error', code: 'agent_prompt_stalled' };
    await commentOnRow();
    const review = h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await h.worker.idle();
    expect(h.reviews.get(review.id)?.status).toBe('failed');
    expect(h.deliveries.latestForReview(review.id)?.state).toBe('unknown');
    expect(h.reviewService.listRecent()[0]?.availableActions).toEqual(['retry', 'retarget']);

    herdr.promptBehavior = { kind: 'prompted' };
    h.reviewService.retry(review.id);
    await h.worker.idle();
    expect(h.reviews.get(review.id)?.status).toBe('delivered');
    expect(h.deliveries.latestForReview(review.id)).toMatchObject({ attempt: 2, state: 'sent' });
  });

  it('moves the review to needs_target when the agent is replaced, then retargets', async () => {
    herdr.agents = [fakeAgent({ pane_id: 'p1', cwd: repo.root, agent_status: 'working' })];
    await h.agents.refresh();
    await commentOnRow();
    const review = h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    herdr.agents = [
      fakeAgent({ pane_id: 'p1', cwd: repo.root, agent_session: { value: 'session-2' } }),
      fakeAgent({ pane_id: 'p2', cwd: `${repo.root}/src`, agent_session: { value: 'session-3' } }),
    ];
    await h.agents.refresh();
    await h.worker.idle();
    expect(h.reviews.get(review.id)?.status).toBe('needs_target');
    expect(herdr.prompts).toHaveLength(0);

    h.reviewService.retarget(review.id, 'p2');
    await h.worker.idle();
    expect(herdr.prompts.map((p) => p.target)).toEqual(['p2']);
  });

  it('refuses to submit to an agent outside the worktree or with no comments', async () => {
    expect(() => h.reviewService.submit({ summary: '', targetPaneId: 'p1' })).toThrow('no draft');
    await commentOnRow();
    expect(() => h.reviewService.submit({ summary: '', targetPaneId: 'elsewhere' })).toThrow('not available');
  });

  it('applies agent replies and lets only the user resolve', async () => {
    const thread = await commentOnRow();
    h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await h.worker.idle();
    h.replies.reply({
      threadId: thread.id,
      worktreePath: repo.root,
      status: 'addressed',
      body: 'Added a guard.',
      agentLabel: 'claude',
    });
    expect(h.threads.getThread(thread.id)).toMatchObject({
      status: 'addressed',
      availableActions: ['resolve'],
    });
    expect(() =>
      h.replies.reply({ threadId: thread.id, worktreePath: '/other', body: 'x', agentLabel: null }),
    ).toThrow('does not belong');

    const followUp = h.threads.addFollowUp(thread.id, 'Also log it?');
    expect(followUp.status).toBe('open');
    h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await h.worker.idle();
    expect(herdr.prompts[1]?.text).toContain('Earlier in this thread:');
    expect(herdr.prompts[1]?.text).toContain('Added a guard.');

    expect(h.threads.resolve(thread.id).status).toBe('resolved');
    expect(() =>
      h.replies.reply({
        threadId: thread.id,
        worktreePath: repo.root,
        status: 'addressed',
        body: 'x',
        agentLabel: null,
      }),
    ).toThrow('resolved');
  });

  it('edits and deletes only draft comments', async () => {
    const thread = await commentOnRow();
    const commentId = thread.comments[0]?.id ?? '';
    expect(h.threads.editComment(commentId, 'edited').comments[0]?.body).toBe('edited');
    h.threads.deleteComment(commentId);
    expect(h.threads.listThreads()).toEqual([]);

    const again = await commentOnRow();
    h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    expect(() => h.threads.editComment(again.comments[0]?.id ?? '', 'late')).toThrow('Only draft');
  });

  it('spills reviews larger than the inline limit into a prompt file', async () => {
    h.stop();
    h = await createServiceHarness({ repoRoot: repo.root, herdr, maxInlineBytes: 100 });
    await h.agents.refresh();
    await commentOnRow();
    const review = h.reviewService.submit({ summary: 'x'.repeat(200), targetPaneId: 'p1' });
    await h.worker.idle();
    expect(herdr.prompts[0]?.text).toContain(`/prompts/review-${review.id}-1.md`);
    expect(h.promptFiles.get(`review-${review.id}-1`)).toContain('## How to respond');
  });

  it('relocates live-view comments and marks edited lines outdated', async () => {
    const thread = await commentOnRow();
    repo.write(
      'src/user.ts',
      lines(
        '// header',
        'export function user(id) {',
        '  const row = db.find(id);',
        '  return row.name;',
        '}',
      ),
    );
    await h.context.refresh();
    expect(await h.threads.relocate()).toBe(1);
    expect(h.threads.getThread(thread.id).anchor).toMatchObject({
      startLine: 3,
      endLine: 4,
      isOutdated: false,
    });

    repo.write('src/user.ts', lines('export function user(id) {', '  return db.find(id)?.name;', '}'));
    await h.threads.relocate();
    expect(h.threads.getThread(thread.id).anchor.isOutdated).toBe(true);
  });
});

describe('recovery', () => {
  it('turns an interrupted sending attempt into unknown and the review into failed', async () => {
    const shared = openDatabase(':memory:', { busyTimeoutMs: 1_000 });
    h.stop();
    h = await createServiceHarness({ repoRoot: repo.root, herdr, db: shared });
    await h.agents.refresh();
    herdr.promptBehavior = { kind: 'hang' };
    await commentOnRow();
    const review = h.reviewService.submit({ summary: '', targetPaneId: 'p1' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.deliveries.latestForReview(review.id)?.state).toBe('sending');

    // A new process starts on the same database while the old one is gone.
    const restarted = await createServiceHarness({
      repoRoot: repo.root,
      herdr,
      db: shared,
      startWorker: false,
    });
    restarted.worker.start();
    expect(restarted.deliveries.latestForReview(review.id)?.state).toBe('unknown');
    expect(restarted.reviews.get(review.id)?.status).toBe('failed');
    restarted.stop();
    herdr.promptBehavior = { kind: 'prompted' };
    await herdr.close();
    herdr = await startFakeHerdrServer();
  });
});
