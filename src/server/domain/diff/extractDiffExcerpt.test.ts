import { describe, expect, it } from 'vitest';
import { extractDiffExcerpt } from './extractDiffExcerpt.ts';

const hunk = ['@@ -1,6 +1,6 @@', ' a', ' b', '-c', '+C', ' d', ' e', ' f'].join('\n');

describe('extractDiffExcerpt', () => {
  it('returns the lines around a new-side range', () => {
    expect(
      extractDiffExcerpt({ hunks: [hunk], side: 'new', startLine: 3, endLine: 3, contextLines: 1 }),
    ).toBe(['-c', '+C', ' d'].join('\n'));
  });

  it('returns the lines around an old-side range', () => {
    expect(
      extractDiffExcerpt({ hunks: [hunk], side: 'old', startLine: 3, endLine: 3, contextLines: 1 }),
    ).toBe([' b', '-c', '+C'].join('\n'));
  });

  it('returns null when the range is not in any hunk', () => {
    expect(
      extractDiffExcerpt({ hunks: [hunk], side: 'new', startLine: 40, endLine: 41, contextLines: 3 }),
    ).toBeNull();
  });
});
