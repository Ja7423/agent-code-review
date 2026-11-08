import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { GitCommandError } from '../adapters/git/GitClient.ts';
import { FileNotInDiffError } from '../services/DiffService.ts';
import { ConflictError, InvalidInputError, NotFoundError } from '../services/errors.ts';
import { RepoContextError } from '../services/RepoContext.ts';
import type { AppServices } from './appServices.ts';
import { agentRoutes } from './routes/agentRoutes.ts';
import { contextRoutes } from './routes/contextRoutes.ts';
import { diffRoutes } from './routes/diffRoutes.ts';
import { eventRoutes } from './routes/eventRoutes.ts';
import { replyRoutes } from './routes/replyRoutes.ts';
import { reviewRoutes } from './routes/reviewRoutes.ts';
import { threadRoutes } from './routes/threadRoutes.ts';
import { securityMiddleware } from './securityMiddleware.ts';
import type { SecuritySecrets } from './securityMiddleware.ts';

const ERROR_STATUS: ReadonlyArray<readonly [new (...args: never[]) => Error, ContentfulStatusCode]> = [
  [InvalidInputError, 400],
  [NotFoundError, 404],
  [FileNotInDiffError, 404],
  [ConflictError, 409],
  [RepoContextError, 409],
];

function statusFor(error: Error): ContentfulStatusCode {
  return ERROR_STATUS.find(([type]) => error instanceof type)?.[1] ?? 500;
}

function handleError(error: Error, c: Context, onUnexpected: (error: Error) => void) {
  const status = statusFor(error);
  if (status === 500) onUnexpected(error);
  const message = error instanceof GitCommandError ? error.stderr.trim() || error.message : error.message;
  return c.json({ error: message }, status);
}

const MISSING_BUILD_HTML =
  '<!doctype html><meta charset="utf-8"><title>revi</title><p>The web app is not built. Run <code>npm run build</code> in the revi checkout.</p>';

export function createApp(params: {
  services: AppServices;
  secrets: SecuritySecrets;
  webRoot: string;
  onUnexpectedError: (error: Error) => void;
}): Hono {
  const app = new Hono();
  app.use('*', securityMiddleware(params.secrets));

  const api = new Hono();
  for (const routes of [
    contextRoutes,
    diffRoutes,
    threadRoutes,
    reviewRoutes,
    agentRoutes,
    replyRoutes,
    eventRoutes,
  ]) {
    api.route('/', routes(params.services));
  }
  api.all('*', (c) => c.json({ error: 'Not found' }, 404));
  app.route('/api', api);

  app.use('/assets/*', serveStatic({ root: params.webRoot }));
  const indexFile = path.join(params.webRoot, 'index.html');
  // Client-side routes (/merged, /worktree, /commit/:sha) all load the single-page app.
  app.get('*', (c) => c.html(existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : MISSING_BUILD_HTML));

  app.onError((error, c) => handleError(error, c, params.onUnexpectedError));
  return app;
}
