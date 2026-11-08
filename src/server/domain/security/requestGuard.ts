const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const;

/** Blocks DNS rebinding: the Host header must name a loopback host on our own port. */
export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) return false;
  return LOOPBACK_HOSTS.some((host) => hostHeader.toLowerCase() === `${host}:${port}`);
}

/** Blocks cross-site requests: the Origin must be exactly our own loopback origin. */
export function isAllowedOrigin(originHeader: string | undefined, port: number): boolean {
  if (originHeader === undefined) return false;
  return LOOPBACK_HOSTS.some((host) => originHeader.toLowerCase() === `http://${host}:${port}`);
}

/** Constant-time comparison for secrets of equal length. */
export function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (provided === undefined || provided.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}
