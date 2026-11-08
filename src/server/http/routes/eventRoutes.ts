import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ServerEvent } from '../../../shared/types.ts';
import type { AppServices } from '../appServices.ts';

export function eventRoutes(services: AppServices): Hono {
  const app = new Hono();
  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = [];
      let wake: (() => void) | null = null;
      const remove = services.hub.add((event) => {
        queue.push(event);
        wake?.();
      });
      stream.onAbort(() => {
        remove();
        wake?.();
      });
      // Tell a reconnecting client the current fingerprint, so it can notice changes it missed.
      queue.push({ type: 'diff.changed', fingerprint: services.changes.currentFingerprint() });
      while (!stream.aborted) {
        const event = queue.shift();
        if (event) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, services.limits.sseKeepAliveMs);
        });
        wake = null;
        if (queue.length === 0 && !stream.aborted) await stream.write(': keep-alive\n\n');
      }
    }),
  );
  return app;
}
