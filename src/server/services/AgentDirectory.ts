import type { AgentDto, AgentsDto, HerdrConnection, ServerEvent } from '../../shared/types.ts';
import type { HerdrClient } from '../adapters/herdr/HerdrClient.ts';
import type { HerdrSubscription } from '../adapters/herdr/herdrProtocol.ts';
import { matchWorktreeAgents } from '../domain/agents/matchWorktreeAgents.ts';

export interface AgentDirectoryDeps {
  herdr: HerdrClient;
  worktreeRoot: () => string;
  /** Every worktree root of the repository; nested ones are excluded from matching. */
  listWorktreeRoots: () => Promise<string[]>;
  realpath: (path: string) => Promise<string>;
  pollIntervalMs: number;
  publish: (event: ServerEvent) => void;
}

/** Global pane events that can add or remove agents. Status changes need one subscription per pane. */
const GLOBAL_EVENTS: readonly HerdrSubscription[] = [
  { type: 'pane.created' },
  { type: 'pane.closed' },
  { type: 'pane.exited' },
  { type: 'pane.agent_detected' },
  { type: 'pane.updated' },
];

const REFRESH_DEBOUNCE_MS = 100;

/** Keeps the list of herdr agents that work in this worktree, and tells listeners when it changes. */
export class AgentDirectory {
  private readonly deps: AgentDirectoryDeps;
  private state: AgentsDto = { herdr: 'unavailable', agents: [] };
  private readonly listeners = new Set<() => void>();
  private stopGlobal: (() => void) | null = null;
  private stopStatus: (() => void) | null = null;
  private statusPanes = '';
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(deps: AgentDirectoryDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    await this.refresh();
    this.stopGlobal = this.deps.herdr.subscribe(
      GLOBAL_EVENTS,
      () => this.scheduleRefresh(),
      (connection) => this.onConnection(connection),
    );
    this.pollTimer = setInterval(() => void this.refresh(), this.deps.pollIntervalMs);
  }

  stop(): void {
    this.stopGlobal?.();
    this.stopStatus?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  current(): AgentsDto {
    return this.state;
  }

  find(paneId: string): AgentDto | undefined {
    return this.state.agents.find((agent) => agent.paneId === paneId);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private onConnection(connection: HerdrConnection): void {
    if (connection === 'connected') this.scheduleRefresh();
    else this.apply({ herdr: 'unavailable', agents: [] });
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
  }

  /** Re-reads `agent.list`. Concurrent calls share one in-flight refresh. */
  refresh(): Promise<void> {
    this.refreshing ??= this.load().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async load(): Promise<void> {
    try {
      const [agents, roots] = await Promise.all([
        this.deps.herdr.listAgents(),
        this.deps.listWorktreeRoots(),
      ]);
      const resolved = await Promise.all(
        agents.map(async (agent) => ({ ...agent, cwd: await this.safeRealpath(agent.cwd) })),
      );
      this.apply({
        herdr: 'connected',
        agents: matchWorktreeAgents(resolved, this.deps.worktreeRoot(), roots),
      });
    } catch {
      this.apply({ herdr: 'unavailable', agents: [] });
    }
  }

  private async safeRealpath(path: string): Promise<string> {
    if (path === '') return path;
    try {
      return await this.deps.realpath(path);
    } catch {
      return path;
    }
  }

  private apply(next: AgentsDto): void {
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    this.syncStatusSubscription();
    this.deps.publish({ type: 'agents.updated', herdr: next.herdr, agents: next.agents });
    for (const listener of this.listeners) listener();
  }

  /** `pane.agent_status_changed` must name a pane, so resubscribe whenever the set of panes changes. */
  private syncStatusSubscription(): void {
    const panes = this.state.agents.map((agent) => agent.paneId).sort();
    const key = panes.join('\0');
    if (key === this.statusPanes) return;
    this.statusPanes = key;
    this.stopStatus?.();
    this.stopStatus = null;
    if (panes.length === 0) return;
    this.stopStatus = this.deps.herdr.subscribe(
      panes.map((pane_id) => ({ type: 'pane.agent_status_changed', pane_id })),
      () => this.scheduleRefresh(),
      () => undefined,
    );
  }
}
