import { Hono } from 'hono';
import { z } from 'zod';
import type { AppServices } from '../appServices.ts';
import { commentBodySchema, optionalView, parseJson, viewSchema } from '../validation.ts';

export function threadRoutes(services: AppServices): Hono {
  const app = new Hono();
  const body = commentBodySchema(services.limits.commentMaxBytes);
  const createSchema = z
    .object({
      view: viewSchema,
      path: z.string().min(1).max(4096),
      side: z.enum(['old', 'new']),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      body,
    })
    .refine((input) => input.endLine >= input.startLine, 'endLine must not be before startLine');
  const bodySchema = z.object({ body });

  app.get('/threads', (c) => c.json(services.threads.listThreads(optionalView(c.req.query('view')))));
  app.post('/threads', async (c) =>
    c.json(await services.threads.createThread(await parseJson(c, createSchema)), 201),
  );
  app.post('/threads/relocate', async (c) => c.json({ changed: await services.threads.relocate() }));
  app.post('/threads/:id/comments', async (c) => {
    const input = await parseJson(c, bodySchema);
    return c.json(services.threads.addFollowUp(c.req.param('id'), input.body), 201);
  });
  app.post('/threads/:id/resolve', (c) => c.json(services.threads.resolve(c.req.param('id'))));
  app.post('/threads/:id/reopen', (c) => c.json(services.threads.reopen(c.req.param('id'))));
  app.patch('/comments/:id', async (c) => {
    const input = await parseJson(c, bodySchema);
    return c.json(services.threads.editComment(c.req.param('id'), input.body));
  });
  app.delete('/comments/:id', (c) => {
    services.threads.deleteComment(c.req.param('id'));
    return c.body(null, 204);
  });
  return app;
}
