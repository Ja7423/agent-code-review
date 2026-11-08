// Minimal hand-written types for the herdr socket API (protocol 22). Only the fields revi reads.
// Full schema: `herdr api schema --output <file>`.

import type { AgentStatus } from '../../../shared/types.ts';

export const SUPPORTED_PROTOCOL = 22;

export interface HerdrRequest {
  id: string;
  method: string;
  params: unknown;
}

export interface HerdrAgentInfo {
  pane_id: string;
  agent?: string | null;
  display_agent?: string | null;
  name?: string | null;
  agent_status: AgentStatus;
  cwd?: string | null;
  foreground_cwd?: string | null;
  agent_session?: { value: string } | null;
}

export type HerdrResult =
  | { type: 'pong'; version: string; protocol: number }
  | { type: 'agent_list'; agents: HerdrAgentInfo[] }
  | { type: 'agent_prompted'; agent: HerdrAgentInfo }
  | { type: 'subscription_started' }
  | { type: string };

export interface HerdrSuccess {
  id: string;
  result: HerdrResult;
}

export interface HerdrFailure {
  id: string;
  error: { code: string; message: string };
}

export interface HerdrEvent {
  event: string;
  data: unknown;
}

export type HerdrMessage = HerdrSuccess | HerdrFailure | HerdrEvent;

/** `pane.agent_status_changed` requires a `pane_id`; the other pane events are global. */
export type HerdrSubscription = { type: string; pane_id?: string };

export const ERROR_AGENT_BLOCKED = 'agent_blocked';
/** Both mean "the prompt may or may not have been submitted". */
export const UNCERTAIN_ERRORS: readonly string[] = ['agent_prompt_stalled', 'timeout'];

export function isEvent(message: HerdrMessage): message is HerdrEvent {
  return 'event' in message;
}

export function isFailure(message: HerdrMessage): message is HerdrFailure {
  return 'error' in message;
}
