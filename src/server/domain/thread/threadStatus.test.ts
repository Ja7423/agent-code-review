import { describe, expect, it } from 'vitest';
import { isAgentReplyStatus, nextThreadStatus, userThreadActions } from './threadStatus.ts';

describe('nextThreadStatus', () => {
  it('lets the agent set addressed, wontfix or question', () => {
    expect(nextThreadStatus('open', 'agentReply', 'agent', 'addressed')).toEqual({
      ok: true,
      status: 'addressed',
    });
    expect(nextThreadStatus('addressed', 'agentReply', 'agent', 'question')).toEqual({
      ok: true,
      status: 'question',
    });
  });

  it('keeps the status when the agent replies without one', () => {
    expect(nextThreadStatus('open', 'agentReply', 'agent')).toEqual({ ok: true, status: 'open' });
  });

  it('does not let the agent resolve, reopen or change a resolved thread', () => {
    expect(nextThreadStatus('addressed', 'resolve', 'agent').ok).toBe(false);
    expect(nextThreadStatus('resolved', 'reopen', 'agent').ok).toBe(false);
    expect(nextThreadStatus('resolved', 'agentReply', 'agent', 'addressed').ok).toBe(false);
  });

  it('returns a thread to open when the user follows up', () => {
    expect(nextThreadStatus('addressed', 'userFollowUp', 'user')).toEqual({ ok: true, status: 'open' });
  });

  it('reopens a resolved thread automatically on a follow-up', () => {
    expect(nextThreadStatus('resolved', 'userFollowUp', 'user')).toEqual({ ok: true, status: 'open' });
  });

  it('lets the user resolve and reopen', () => {
    expect(nextThreadStatus('wontfix', 'resolve', 'user')).toEqual({ ok: true, status: 'resolved' });
    expect(nextThreadStatus('resolved', 'reopen', 'user')).toEqual({ ok: true, status: 'open' });
    expect(nextThreadStatus('resolved', 'resolve', 'user').ok).toBe(false);
    expect(nextThreadStatus('open', 'reopen', 'user').ok).toBe(false);
  });

  it('does not let the user post an agent reply', () => {
    expect(nextThreadStatus('open', 'agentReply', 'user', 'addressed').ok).toBe(false);
  });
});

describe('userThreadActions', () => {
  it('offers resolve on open threads and reopen on resolved ones', () => {
    expect(userThreadActions('open')).toEqual(['resolve']);
    expect(userThreadActions('resolved')).toEqual(['reopen']);
  });
});

describe('isAgentReplyStatus', () => {
  it('accepts answered for a question replied to without a code change', () => {
    expect(isAgentReplyStatus('answered')).toBe(true);
    expect(nextThreadStatus('open', 'agentReply', 'agent', 'answered')).toEqual({
      ok: true,
      status: 'answered',
    });
  });

  it('rejects statuses only the user may set', () => {
    expect(isAgentReplyStatus('resolved')).toBe(false);
    expect(isAgentReplyStatus('open')).toBe(false);
  });
});
