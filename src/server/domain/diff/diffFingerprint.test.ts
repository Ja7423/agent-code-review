import { describe, expect, it } from 'vitest';
import { diffFingerprint } from './diffFingerprint.ts';

describe('diffFingerprint', () => {
  const base = { headSha: 'abc', diffText: 'diff', untracked: ['b', 'a'] };

  it('is stable and ignores untracked order', () => {
    expect(diffFingerprint(base)).toBe(diffFingerprint({ ...base, untracked: ['a', 'b'] }));
  });

  it('changes with HEAD, the diff or the untracked list', () => {
    const value = diffFingerprint(base);
    expect(diffFingerprint({ ...base, headSha: 'abd' })).not.toBe(value);
    expect(diffFingerprint({ ...base, diffText: 'diff2' })).not.toBe(value);
    expect(diffFingerprint({ ...base, untracked: ['a'] })).not.toBe(value);
  });

  it('does not mutate its input', () => {
    const untracked = ['b', 'a'];
    diffFingerprint({ ...base, untracked });
    expect(untracked).toEqual(['b', 'a']);
  });
});
