import { Hono } from 'hono';
import { z } from 'zod';
import { AGENT_REPLY_STATUSES } from '../../domain/thread/threadStatus.ts';
import type { AppServices } from '../appServices.ts';
import { commentBodySchema, parseJson } from '../validation.ts';

/** Used by `revi reply`. Authenticated with the reply token, not the browser cookie. */
export function replyRoutes(services: AppServices): Hono {
  const app = new Hono();
  const replySchema = z.object({
    status: z.enum(AGENT_REPLY_STATUSES).optional(),
    body: commentBodySchema(services.limits.replyMaxBytes),
    agentLabel: z.string().max(200).nullable().default(null),
  });
  app.post('/agent/threads/:id/replies', async (c) => {
    const input = await parseJson(c, replySchema);
    const comment = services.replies.reply({
      threadId: c.req.param('id'),
      worktreePath: services.context.current().worktreePath,
      ...input,
    });
    return c.json(comment, 201);
  });
  return app;
}
