import { describe, expect, it } from 'vitest';
import { createAnchor } from './anchor.ts';
import { relocateAnchor } from './relocateAnchor.ts';

const original = [
  'import x',
  '',
  'function a() {',
  '  return 1;',
  '}',
  '',
  'function b() {',
  '  return 2;',
  '}',
];

const anchorOn = (start: number, end: number) =>
  createAnchor({
    view: { kind: 'merged' },
    path: 'f.ts',
    side: 'new',
    startLine: start,
    endLine: end,
    fileLines: original,
    contextLines: 2,
  });

describe('createAnchor', () => {
  it('captures the snippet and surrounding context', () => {
    const anchor = anchorOn(4, 4);
    expect(anchor.originalSnippet).toBe('  return 1;');
    expect(anchor.contextBefore).toEqual(['', 'function a() {']);
    expect(anchor.contextAfter).toEqual(['}', '']);
  });

  it('rejects ranges outside the file', () => {
    expect(() => anchorOn(0, 1)).toThrow();
    expect(() => anchorOn(9, 10)).toThrow();
  });
});

describe('relocateAnchor', () => {
  it('keeps an unchanged anchor in place', () => {
    expect(relocateAnchor(anchorOn(3, 5), original)).toEqual({ kind: 'moved', startLine: 3, endLine: 5 });
  });

  it('follows lines shifted by an insertion above', () => {
    const shifted = ['// header', '// more', ...original];
    expect(relocateAnchor(anchorOn(3, 5), shifted)).toEqual({ kind: 'moved', startLine: 5, endLine: 7 });
  });

  it('reports outdated when the lines were edited', () => {
    const edited = original.map((line) => (line === '  return 1;' ? '  return 42;' : line));
    expect(relocateAnchor(anchorOn(4, 4), edited)).toEqual({ kind: 'outdated' });
  });

  it('picks the duplicate whose context matches, then the nearest', () => {
    // `}` appears at lines 5 and 9; the anchor on line 9 has context `  return 2;` before it.
    const shifted = ['// new line', ...original];
    expect(relocateAnchor(anchorOn(9, 9), shifted)).toEqual({ kind: 'moved', startLine: 10, endLine: 10 });
    const noContext = ['}', 'x', 'y', 'z', '}'];
    expect(relocateAnchor(anchorOn(5, 5), noContext)).toEqual({ kind: 'moved', startLine: 5, endLine: 5 });
  });

  it('reports outdated when the file was deleted', () => {
    expect(relocateAnchor(anchorOn(1, 1), null)).toEqual({ kind: 'outdated' });
  });
});
