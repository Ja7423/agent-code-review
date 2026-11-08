import type { Side, ViewRef } from '../../../shared/types.ts';
import { stableHash } from '../hash/stableHash.ts';

/** Where a thread is attached. Line numbers are 1-based and inclusive, on `side` of the diff. */
export interface Anchor {
  view: ViewRef;
  path: string;
  side: Side;
  startLine: number;
  endLine: number;
  lineHash: string;
  contextBefore: readonly string[];
  contextAfter: readonly string[];
  originalSnippet: string;
}

export function hashLines(lines: readonly string[]): string {
  return stableHash(lines.join('\n'));
}

export class AnchorRangeError extends Error {}

export function createAnchor(params: {
  view: ViewRef;
  path: string;
  side: Side;
  startLine: number;
  endLine: number;
  fileLines: readonly string[];
  contextLines: number;
}): Anchor {
  const { startLine, endLine, fileLines, contextLines } = params;
  if (startLine < 1 || endLine < startLine || endLine > fileLines.length) {
    throw new AnchorRangeError(
      `Lines ${startLine}-${endLine} are outside the file (${fileLines.length} lines)`,
    );
  }
  const selected = fileLines.slice(startLine - 1, endLine);
  return {
    view: params.view,
    path: params.path,
    side: params.side,
    startLine,
    endLine,
    lineHash: hashLines(selected),
    contextBefore: fileLines.slice(Math.max(0, startLine - 1 - contextLines), startLine - 1),
    contextAfter: fileLines.slice(endLine, endLine + contextLines),
    originalSnippet: selected.join('\n'),
  };
}
