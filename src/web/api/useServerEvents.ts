import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AgentsDto, ServerEvent } from '../../shared/types.ts';
import { keys } from './queries.ts';

const EVENT_TYPES: readonly ServerEvent['type'][] = [
  'diff.changed',
  'context.changed',
  'thread.updated',
  'review.updated',
  'agents.updated',
];

export interface ServerEventsState {
  isConnected: boolean;
  /** True once the code changed after the diff on screen was loaded. */
  hasNewChanges: boolean;
  /** Call after reloading the diff, so the banner hides until the next change. */
  acknowledgeChanges: () => void;
}

/**
 * Turns SSE events into query invalidations. The diff itself is never refreshed automatically:
 * a change only raises `hasNewChanges`, so the line a user is commenting on does not jump.
 */
export function useServerEvents(): ServerEventsState {
  const client = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [hasNewChanges, setHasNewChanges] = useState(false);
  const shownFingerprint = useRef<string | null>(null);
  const latestFingerprint = useRef<string | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/events');
    const handle = (event: ServerEvent): void => {
      if (event.type === 'diff.changed') {
        latestFingerprint.current = event.fingerprint;
        shownFingerprint.current ??= event.fingerprint;
        setHasNewChanges(event.fingerprint !== shownFingerprint.current);
      } else if (event.type === 'context.changed') {
        void client.invalidateQueries({ queryKey: keys.context });
        void client.invalidateQueries({ queryKey: keys.commits });
      } else if (event.type === 'thread.updated') {
        void client.invalidateQueries({ queryKey: keys.threads });
        void client.invalidateQueries({ queryKey: keys.draft });
      } else if (event.type === 'review.updated') {
        void client.invalidateQueries({ queryKey: ['review'] });
      } else {
        client.setQueryData<AgentsDto>(keys.agents, { herdr: event.herdr, agents: event.agents });
      }
    };
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (message) =>
        handle(JSON.parse((message as MessageEvent<string>).data) as ServerEvent),
      );
    }
    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);
    return () => source.close();
  }, [client]);

  return {
    isConnected,
    hasNewChanges,
    acknowledgeChanges: () => {
      shownFingerprint.current = latestFingerprint.current;
      setHasNewChanges(false);
    },
  };
}
