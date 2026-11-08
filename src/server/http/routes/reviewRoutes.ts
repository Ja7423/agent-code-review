import { Hono } from 'hono';
import { z } from 'zod';
import type { AppServices } from '../appServices.ts';
import { parseJson } from '../validation.ts';

const submitSchema = z.object({
  summary: z
    .string()
    .max(64 * 1024)
    .default(''),
  targetPaneId: z.string().min(1).max(256),
});
const retargetSchema = z.object({ targetPaneId: z.string().min(1).max(256) });

export function reviewRoutes(services: AppServices): Hono {
  const app = new Hono();
  app.get('/review/draft', (c) => c.json({ draft: services.reviews.getDraft() }));
  app.get('/reviews', (c) => c.json(services.reviews.listRecent()));
  app.post('/review/submit', async (c) => {
    // Re-read agents first so the target and its status are current, not up to a poll interval old.
    await services.agents.refresh();
    return c.json(services.reviews.submit(await parseJson(c, submitSchema)));
  });
  app.post('/reviews/:id/retry', (c) => c.json(services.reviews.retry(c.req.param('id'))));
  app.post('/reviews/:id/retarget', async (c) => {
    const { targetPaneId } = await parseJson(c, retargetSchema);
    await services.agents.refresh();
    return c.json(services.reviews.retarget(c.req.param('id'), targetPaneId));
  });
  return app;
}
