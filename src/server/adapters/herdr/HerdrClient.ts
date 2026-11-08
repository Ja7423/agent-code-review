import { randomUUID } from 'node:crypto';
import type { AgentDto, AgentStatus, HerdrConnection } from '../../../shared/types.ts';
import { NdjsonConnection } from './ndjsonConnection.ts';
import { ERROR_AGENT_BLOCKED, isEvent, isFailure, UNCERTAIN_ERRORS } from './herdrProtocol.ts';
import type {
  HerdrAgentInfo,
  HerdrEvent,
  HerdrMessage,
  HerdrResult,
  HerdrSubscription,
} from './herdrProtocol.ts';

export type PromptOutcome =
  | { kind: 'prompted' }
  | { kind: 'blocked' }
  | { kind: 'uncertain'; reason: string }
  | { kind: 'failed'; error: string };

export interface PromptWait {
  until: AgentStatus[];
  timeout_ms: number;
}

export interface HerdrClient {
  getServerInfo(): Promise<{ version: string; protocol: number }>;
  listAgents(): Promise<AgentDto[]>;
  prompt(target: string, text: string, wait: PromptWait): Promise<PromptOutcome>;
  subscribe(
    subscriptions: readonly HerdrSubscription[],
    onEvent: (event: HerdrEvent) => void,
    onConnectionChange: (state: HerdrConnection) => void,
  ): () => void;
}

/** Nothing was sent: the socket did not open. */
export class HerdrUnavailableError extends Error {}
/** The request was written but no answer came back; it may or may not have been applied. */
export class HerdrNoResponseError extends Error {}
export class HerdrRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export interface SocketHerdrClientOptions {
  socketPath: string;
  requestTimeoutMs: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
}

export function toAgentDto(info: HerdrAgentInfo): AgentDto {
  return {
    paneId: info.pane_id,
    name: info.name ?? null,
    kind: info.display_agent ?? info.agent ?? null,
    status: info.agent_status,
    cwd: info.foreground_cwd ?? info.cwd ?? '',
    sessionId: info.agent_session?.value ?? null,
  };
}

function promptOutcomeOf(error: unknown): PromptOutcome {
  if (error instanceof HerdrRequestError) {
    if (error.code === ERROR_AGENT_BLOCKED) return { kind: 'blocked' };
    if (UNCERTAIN_ERRORS.includes(error.code)) return { kind: 'uncertain', reason: error.message };
    return { kind: 'failed', error: error.message };
  }
  if (error instanceof HerdrNoResponseError) return { kind: 'uncertain', reason: error.message };
  return { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
}

export class SocketHerdrClient implements HerdrClient {
  private readonly options: SocketHerdrClientOptions;

  constructor(options: SocketHerdrClientOptions) {
    this.options = options;
  }

  /** One short-lived connection per request keeps request/response pairing trivial. */
  request(method: string, params: unknown, timeoutMs = this.options.requestTimeoutMs): Promise<HerdrResult> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const settle = (action: () => void): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        connection.close();
        action();
      };
      const connection = new NdjsonConnection(this.options.socketPath, {
        onConnect: () => connection.send({ id, method, params }),
        onMessage: (raw) => {
          const message = raw as HerdrMessage;
          if (isEvent(message) || message.id !== id) return;
          if (isFailure(message))
            settle(() => reject(new HerdrRequestError(message.error.code, message.error.message)));
          else settle(() => resolve(message.result));
        },
        onClose: (wasConnected, error) =>
          settle(() =>
            reject(
              wasConnected
                ? new HerdrNoResponseError(`herdr closed the connection during ${method}`)
                : new HerdrUnavailableError(`herdr is not running (${error?.message ?? 'no socket'})`),
            ),
          ),
      });
      const timer = setTimeout(
        () => settle(() => reject(new HerdrNoResponseError(`${method} got no answer in ${timeoutMs}ms`))),
        timeoutMs,
      );
    });
  }

  async getServerInfo(): Promise<{ version: string; protocol: number }> {
    const result = await this.request('ping', {});
    return 'version' in result
      ? { version: String(result.version), protocol: Number(result.protocol) }
      : { version: '?', protocol: 0 };
  }

  async listAgents(): Promise<AgentDto[]> {
    const result = await this.request('agent.list', {});
    return 'agents' in result && Array.isArray(result.agents) ? result.agents.map(toAgentDto) : [];
  }

  async prompt(target: string, text: string, wait: PromptWait): Promise<PromptOutcome> {
    try {
      // Our own timeout must outlast herdr's, so herdr reports its own `timeout` first.
      const result = await this.request('agent.prompt', { target, text, wait }, wait.timeout_ms + 5_000);
      return result.type === 'agent_prompted'
        ? { kind: 'prompted' }
        : { kind: 'uncertain', reason: `unexpected ${result.type}` };
    } catch (error) {
      return promptOutcomeOf(error);
    }
  }

  subscribe(
    subscriptions: readonly HerdrSubscription[],
    onEvent: (event: HerdrEvent) => void,
    onConnectionChange: (state: HerdrConnection) => void,
  ): () => void {
    return new HerdrSubscriptionLoop(this.options, subscriptions, onEvent, onConnectionChange).start();
  }
}

/** Keeps an `events.subscribe` connection open, reconnecting with exponential backoff. */
class HerdrSubscriptionLoop {
  private connection: NdjsonConnection | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private delayMs: number;
  private isStopped = false;
  private readonly options: SocketHerdrClientOptions;
  private readonly subscriptions: readonly HerdrSubscription[];
  private readonly onEvent: (event: HerdrEvent) => void;
  private readonly onConnectionChange: (state: HerdrConnection) => void;

  constructor(
    options: SocketHerdrClientOptions,
    subscriptions: readonly HerdrSubscription[],
    onEvent: (event: HerdrEvent) => void,
    onConnectionChange: (state: HerdrConnection) => void,
  ) {
    this.options = options;
    this.subscriptions = subscriptions;
    this.onEvent = onEvent;
    this.onConnectionChange = onConnectionChange;
    this.delayMs = options.reconnectMinMs;
  }

  start(): () => void {
    this.connect();
    return () => this.stop();
  }

  private connect(): void {
    const id = randomUUID();
    const connection = new NdjsonConnection(this.options.socketPath, {
      onConnect: () =>
        connection.send({ id, method: 'events.subscribe', params: { subscriptions: this.subscriptions } }),
      onMessage: (raw) => this.handle(raw as HerdrMessage, id),
      onClose: () => this.handleClose(connection),
    });
    this.connection = connection;
  }

  private handle(message: HerdrMessage, id: string): void {
    if (isEvent(message)) return this.onEvent(message);
    if (message.id !== id) return;
    if (isFailure(message)) return this.connection?.close();
    this.delayMs = this.options.reconnectMinMs;
    this.onConnectionChange('connected');
  }

  private handleClose(connection: NdjsonConnection): void {
    if (this.connection !== connection || this.isStopped) return;
    this.connection = null;
    this.onConnectionChange('unavailable');
    this.retryTimer = setTimeout(() => this.connect(), this.delayMs);
    this.delayMs = Math.min(this.delayMs * 2, this.options.reconnectMaxMs);
  }

  private stop(): void {
    this.isStopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connection?.close();
    this.connection = null;
  }
}
