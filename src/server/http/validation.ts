import type { Context } from 'hono';
import { z } from 'zod';
import type { ViewRef } from '../../shared/types.ts';
import { parseViewRef } from '../../shared/viewRef.ts';
import { InvalidInputError } from '../services/errors.ts';

export async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new InvalidInputError('Request body must be JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new InvalidInputError(z.prettifyError(result.error));
  return result.data;
}

export function requireView(raw: string | undefined): ViewRef {
  const view = raw === undefined ? null : parseViewRef(raw);
  if (!view) throw new InvalidInputError('view must be merged, worktree or commit:<sha>');
  return view;
}

export function optionalView(raw: string | undefined): ViewRef | undefined {
  return raw === undefined ? undefined : requireView(raw);
}

export function requireQuery(c: Context, name: string): string {
  const value = c.req.query(name);
  if (value === undefined || value === '') throw new InvalidInputError(`${name} is required`);
  return value;
}

export const viewSchema = z.string().transform((raw, ctx) => {
  const view = parseViewRef(raw);
  if (!view) {
    ctx.addIssue({ code: 'custom', message: 'view must be merged, worktree or commit:<sha>' });
    return z.NEVER;
  }
  return view;
});

export const commentBodySchema = (maxBytes: number) =>
  z
    .string()
    .trim()
    .min(1, 'Comment is empty')
    .refine(
      (body) => new TextEncoder().encode(body).length <= maxBytes,
      `Comment is larger than ${maxBytes} bytes`,
    );
