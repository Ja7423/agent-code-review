import { Hono } from 'hono';
import type { AppServices } from '../appServices.ts';

export function agentRoutes(services: AppServices): Hono {
  const app = new Hono();
  app.get('/agents', (c) => c.json(services.agents.current()));
  app.post('/agents/refresh', async (c) => {
    await services.agents.refresh();
    return c.json(services.agents.current());
  });
  return app;
}
