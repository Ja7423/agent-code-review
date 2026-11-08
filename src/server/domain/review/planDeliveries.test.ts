import { describe, expect, it } from 'vitest';
import type { AgentDto } from '../../../shared/types.ts';
import { planDeliveries } from './planDeliveries.ts';

const agent = (paneId: string, status: AgentDto['status'], sessionId: string | null = 's1'): AgentDto => ({
  paneId,
  status,
  sessionId,
  name: null,
  kind: 'claude',
  cwd: '/repo',
});

const review = (id: string, targetPaneId: string, targetSessionId: string | null = 's1') => ({
  id,
  targetPaneId,
  targetSessionId,
});

describe('planDeliveries', () => {
  it('sends to idle or done agents and waits for working or blocked ones', () => {
    const agents = [agent('a', 'idle'), agent('b', 'working'), agent('c', 'done'), agent('d', 'blocked')];
    const plan = planDeliveries(
      [review('1', 'a'), review('2', 'b'), review('3', 'c'), review('4', 'd')],
      agents,
      'connected',
    );
    expect(plan).toEqual({ lost: [], ready: ['1', '3'] });
  });

  it('sends at most one review per agent at a time', () => {
    expect(
      planDeliveries([review('1', 'a'), review('2', 'a')], [agent('a', 'idle')], 'connected').ready,
    ).toEqual(['1']);
  });

  it('marks reviews lost when the agent is gone or replaced', () => {
    const plan = planDeliveries(
      [review('1', 'gone'), review('2', 'a')],
      [agent('a', 'idle', 's2')],
      'connected',
    );
    expect(plan).toEqual({ lost: ['1', '2'], ready: [] });
  });

  it('ignores session ids that are unknown on either side', () => {
    expect(planDeliveries([review('1', 'a', null)], [agent('a', 'idle', 's9')], 'connected').ready).toEqual([
      '1',
    ]);
    expect(planDeliveries([review('1', 'a')], [agent('a', 'idle', null)], 'connected').ready).toEqual(['1']);
  });

  it('waits without judging anything while herdr is unavailable', () => {
    expect(planDeliveries([review('1', 'gone')], [], 'unavailable')).toEqual({ lost: [], ready: [] });
  });
});
