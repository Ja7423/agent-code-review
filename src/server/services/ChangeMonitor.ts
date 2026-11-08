import type { ServerEvent } from '../../shared/types.ts';
import type { ChangeWatcher } from '../adapters/fs/FsWatcher.ts';
import type { DiffService } from './DiffService.ts';
import type { RepoContext } from './RepoContext.ts';

/** Turns noisy file events into `diff.changed` / `context.changed` only when something really changed. */
export class ChangeMonitor {
  private readonly deps: {
    watcher: ChangeWatcher;
    context: RepoContext;
    diff: DiffService;
    publish: (event: ServerEvent) => void;
    onError: (error: unknown) => void;
  };
  private fingerprint = '';
  private checking: Promise<void> | null = null;
  private hasQueuedCheck = false;

  constructor(deps: ChangeMonitor['deps']) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    this.fingerprint = await this.deps.diff.fingerprint();
    this.deps.watcher.start(() => void this.check());
  }

  stop(): void {
    this.deps.watcher.stop();
  }

  currentFingerprint(): string {
    return this.fingerprint;
  }

  /** Runs one check at a time; a request during a check runs once more afterwards. */
  check(): Promise<void> {
    if (this.checking) {
      this.hasQueuedCheck = true;
      return this.checking;
    }
    this.checking = this.runChecks().finally(() => (this.checking = null));
    return this.checking;
  }

  private async runChecks(): Promise<void> {
    do {
      this.hasQueuedCheck = false;
      try {
        await this.checkOnce();
      } catch (error) {
        this.deps.onError(error);
      }
    } while (this.hasQueuedCheck);
  }

  private async checkOnce(): Promise<void> {
    if (await this.deps.context.refresh()) this.deps.publish({ type: 'context.changed' });
    const next = await this.deps.diff.fingerprint();
    if (next === this.fingerprint) return;
    this.fingerprint = next;
    this.deps.publish({ type: 'diff.changed', fingerprint: next });
  }
}
