import type { Actor, AgentReplyStatus, ThreadStatus, ThreadUserAction } from '../../../shared/types.ts';

export type ThreadAction = 'agentReply' | 'userFollowUp' | 'resolve' | 'reopen';

export type ThreadTransition = { ok: true; status: ThreadStatus } | { ok: false; reason: string };

const ACTION_OWNER: Readonly<Record<ThreadAction, Actor>> = {
  agentReply: 'agent',
  userFollowUp: 'user',
  resolve: 'user',
  reopen: 'user',
};

type Rule = (current: ThreadStatus, requested: AgentReplyStatus | undefined) => ThreadTransition;

const reject = (reason: string): ThreadTransition => ({ ok: false, reason });

const RULES: Readonly<Record<ThreadAction, Rule>> = {
  agentReply: (current, requested) => {
    if (current === 'resolved' && requested !== undefined)
      return reject('Thread is resolved; only the user can reopen it');
    return { ok: true, status: requested ?? current };
  },
  // A user follow-up always reopens the conversation, including on a resolved thread.
  userFollowUp: () => ({ ok: true, status: 'open' }),
  resolve: (current) =>
    current === 'resolved' ? reject('Thread is already resolved') : { ok: true, status: 'resolved' },
  reopen: (current) =>
    current === 'resolved' ? { ok: true, status: 'open' } : reject('Only resolved threads can be reopened'),
};

export function nextThreadStatus(
  current: ThreadStatus,
  action: ThreadAction,
  actor: Actor,
  requested?: AgentReplyStatus,
): ThreadTransition {
  if (ACTION_OWNER[action] !== actor) return reject(`Only the ${ACTION_OWNER[action]} can ${action}`);
  return RULES[action](current, requested);
}

/** The buttons the web app may show for a thread, derived from the same rules. */
export function userThreadActions(current: ThreadStatus): ThreadUserAction[] {
  const actions: ThreadUserAction[] = ['resolve', 'reopen'];
  return actions.filter((action) => nextThreadStatus(current, action, 'user').ok);
}

/** The statuses an agent may set, in the order they are documented to it. */
export const AGENT_REPLY_STATUSES = [
  'addressed',
  'answered',
  'wontfix',
  'question',
] as const satisfies readonly AgentReplyStatus[];

export function isAgentReplyStatus(value: string): value is AgentReplyStatus {
  return (AGENT_REPLY_STATUSES as readonly string[]).includes(value);
}
