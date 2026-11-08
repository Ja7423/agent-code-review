import type { Anchor } from './anchor.ts';
import { hashLines } from './anchor.ts';

export type RelocationResult = { kind: 'moved'; startLine: number; endLine: number } | { kind: 'outdated' };

interface Candidate {
  startLine: number;
  contextScore: number;
  distance: number;
}

function snippetLines(anchor: Anchor): string[] {
  return anchor.originalSnippet.split('\n');
}

function matchesAt(fileLines: readonly string[], startIndex: number, needle: readonly string[]): boolean {
  return needle.every((line, offset) => fileLines[startIndex + offset] === line);
}

/** Step 1: the selected lines are still exactly where they were. */
function isUnchangedInPlace(anchor: Anchor, fileLines: readonly string[]): boolean {
  const current = fileLines.slice(anchor.startLine - 1, anchor.endLine);
  return current.length === anchor.endLine - anchor.startLine + 1 && hashLines(current) === anchor.lineHash;
}

function contextScore(
  anchor: Anchor,
  fileLines: readonly string[],
  startIndex: number,
  length: number,
): number {
  const before = anchor.contextBefore.filter(
    (line, i) => fileLines[startIndex - anchor.contextBefore.length + i] === line,
  ).length;
  const after = anchor.contextAfter.filter((line, i) => fileLines[startIndex + length + i] === line).length;
  return before + after;
}

/** Step 2: every place in the file where the selected lines appear verbatim. */
function findCandidates(anchor: Anchor, fileLines: readonly string[]): Candidate[] {
  const needle = snippetLines(anchor);
  const candidates: Candidate[] = [];
  for (let index = 0; index + needle.length <= fileLines.length; index += 1) {
    if (!matchesAt(fileLines, index, needle)) continue;
    candidates.push({
      startLine: index + 1,
      contextScore: contextScore(anchor, fileLines, index, needle.length),
      distance: Math.abs(index + 1 - anchor.startLine),
    });
  }
  return candidates;
}

/** Step 3: prefer the best surrounding-context match, then the closest one to the old position. */
function pickBest(candidates: readonly Candidate[]): Candidate | undefined {
  return [...candidates].sort((a, b) => b.contextScore - a.contextScore || a.distance - b.distance)[0];
}

/** Finds where an anchor's lines moved to in a new version of the file, or reports it as outdated. */
export function relocateAnchor(anchor: Anchor, fileLines: readonly string[] | null): RelocationResult {
  if (fileLines === null) return { kind: 'outdated' };
  if (isUnchangedInPlace(anchor, fileLines)) {
    return { kind: 'moved', startLine: anchor.startLine, endLine: anchor.endLine };
  }
  const best = pickBest(findCandidates(anchor, fileLines));
  if (!best) return { kind: 'outdated' };
  const length = anchor.endLine - anchor.startLine;
  return { kind: 'moved', startLine: best.startLine, endLine: best.startLine + length };
}
