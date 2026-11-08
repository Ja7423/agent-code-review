import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { isAllowedHost, isAllowedOrigin, secretsMatch } from '../domain/security/requestGuard.ts';

export interface SecuritySecrets {
  /** Read lazily: the port is known only after the server starts listening. */
  port: () => number;
  /** One-time-ish token in the URL that revi opens; exchanged for the session cookie. */
  browserToken: string;
  /** Value of the HttpOnly session cookie. Never appears in a URL. */
  sessionSecret: string;
  /** Bearer token for `revi reply`, stored in the 0600 server registry file. */
  replyToken: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  // React and the diff viewer set element styles at runtime.
  "style-src 'self' 'unsafe-inline'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/** Cookies are not port-scoped, so each revi server on 127.0.0.1 needs its own cookie name. */
export const sessionCookieName = (port: number): string => `revi_session_${port}`;

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/**
 * Order matters: Host first (DNS rebinding), then the token exchange, then per-route credentials.
 * Static files need no credentials; every `/api` route does.
 */
export function securityMiddleware(secrets: SecuritySecrets): MiddlewareHandler {
  return async (c, next) => {
    const port = secrets.port();
    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    if (!isAllowedHost(c.req.header('host'), port)) return c.text('Forbidden host', 403);

    const path = c.req.path;
    const urlToken = c.req.query('token');
    if (urlToken !== undefined && !path.startsWith('/api/')) {
      if (!secretsMatch(urlToken, secrets.browserToken)) return c.text('Invalid token', 403);
      setCookie(c, sessionCookieName(port), secrets.sessionSecret, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
      });
      return c.redirect(path, 302);
    }

    if (path.startsWith('/api/agent/')) {
      if (!secretsMatch(bearerToken(c.req.header('authorization')), secrets.replyToken))
        return c.json({ error: 'Unauthorized' }, 401);
      return next();
    }

    if (path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store');
      if (!secretsMatch(getCookie(c, sessionCookieName(port)), secrets.sessionSecret)) {
        return c.json({ error: 'Open revi from the link it printed in your terminal.' }, 401);
      }
      if (!SAFE_METHODS.has(c.req.method) && !isAllowedOrigin(c.req.header('origin'), port)) {
        return c.json({ error: 'Cross-origin request refused' }, 403);
      }
    }
    return next();
  };
}
