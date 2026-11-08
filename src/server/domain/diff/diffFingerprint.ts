import { stableHash } from '../hash/stableHash.ts';

export interface FingerprintInput {
  headSha: string;
  diffText: string;
  untracked: readonly string[];
}

/** Changes whenever HEAD, the tracked diff, or the untracked file list changes. */
export function diffFingerprint(input: FingerprintInput): string {
  const untracked = [...input.untracked].sort().join('\0');
  return stableHash(`${input.headSha}\n${untracked}\n${input.diffText}`);
}
