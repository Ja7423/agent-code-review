import type { Clock } from '../../src/server/adapters/runtime/clock.ts';
import type { IdGenerator } from '../../src/server/adapters/runtime/idGenerator.ts';

export interface FakeClock extends Clock {
  advance(ms: number): void;
}

export function createFakeClock(start = '2026-11-07T00:00:00.000Z'): FakeClock {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => void (current += ms),
  };
}

/** Sequential, sortable ids: ID0001, ID0002, ... */
export function createSequentialIds(prefix = 'ID'): IdGenerator {
  let next = 0;
  return { next: () => `${prefix}${String((next += 1)).padStart(4, '0')}` };
}
