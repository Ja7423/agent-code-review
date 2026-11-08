import { Hono } from 'hono';
import type { AppServices } from '../appServices.ts';
import { requireQuery, requireView } from '../validation.ts';

export function diffRoutes(services: AppServices): Hono {
  const app = new Hono();
  app.get('/diff', async (c) => c.json(await services.diff.listFiles(requireView(c.req.query('view')))));
  // `getFileDiff` only answers for paths in the view's file list, so arbitrary paths are refused.
  app.get('/diff/file', async (c) =>
    c.json(await services.diff.getFileDiff(requireView(c.req.query('view')), requireQuery(c, 'path'))),
  );
  return app;
}
