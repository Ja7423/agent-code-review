import { Hono } from 'hono';
import { z } from 'zod';
import type { AppServices } from '../appServices.ts';
import { parseJson } from '../validation.ts';

const baseSchema = z.object({ baseRef: z.string().trim().min(1).max(256) });

export function contextRoutes(services: AppServices): Hono {
  const app = new Hono();
  app.get('/context', async (c) => c.json(await services.context.toDto()));
  app.put('/context/base', async (c) => {
    const { baseRef } = await parseJson(c, baseSchema);
    await services.context.setBase(baseRef);
    services.publish({ type: 'context.changed' });
    return c.json(await services.context.toDto());
  });
  app.get('/commits', async (c) => c.json(await services.diff.listCommits()));
  return app;
}
