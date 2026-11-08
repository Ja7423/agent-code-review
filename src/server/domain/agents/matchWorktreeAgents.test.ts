import { describe, expect, it } from 'vitest';
import type { AgentDto } from '../../../shared/types.ts';
import { matchWorktreeAgents } from './matchWorktreeAgents.ts';

const agent = (paneId: string, cwd: string): AgentDto => ({
  paneId,
  name: null,
  kind: 'claude',
  status: 'idle',
  cwd,
  sessionId: null,
});

describe('matchWorktreeAgents', () => {
  const agents = [
    agent('root', '/repo'),
    agent('sub', '/repo/src/lib'),
    agent('nested', '/repo/.worktrees/feature/src'),
    agent('sibling', '/repo-other'),
    agent('elsewhere', '/tmp'),
  ];

  it('keeps agents in the worktree or its subdirectories', () => {
    expect(matchWorktreeAgents(agents, '/repo', []).map((a) => a.paneId)).toEqual(['root', 'sub', 'nested']);
  });

  it('excludes agents inside a nested worktree', () => {
    const nested = ['/repo', '/repo/.worktrees/feature', '/elsewhere'];
    expect(matchWorktreeAgents(agents, '/repo', nested).map((a) => a.paneId)).toEqual(['root', 'sub']);
  });

  it('does not treat a path prefix as containment', () => {
    expect(matchWorktreeAgents([agent('x', '/repo-other')], '/repo', [])).toEqual([]);
  });

  it('accepts a trailing slash on the root', () => {
    expect(matchWorktreeAgents([agent('x', '/repo/a')], '/repo/', [])).toHaveLength(1);
  });
});
