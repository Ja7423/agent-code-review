const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(text: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Deterministic, dependency-free 64-bit hash (two FNV-1a passes with different seeds).
 * Used for change detection and anchor matching, never for security.
 */
export function stableHash(text: string): string {
  const high = fnv1a(text, FNV_OFFSET);
  const low = fnv1a(text, FNV_OFFSET ^ 0x5bd1e995);
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
