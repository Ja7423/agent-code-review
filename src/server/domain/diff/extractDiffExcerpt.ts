import type { Side } from '../../../shared/types.ts';

interface NumberedLine {
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function numberHunk(hunk: string): NumberedLine[] {
  const [header = '', ...body] = hunk.split('\n');
  const match = HUNK_HEADER.exec(header);
  if (!match) return [];
  let oldLine = Number(match[1]);
  let newLine = Number(match[2]);
  return body.map((text) => {
    if (text.startsWith('\\')) return { text, oldLine: null, newLine: null };
    if (text.startsWith('+')) return { text, oldLine: null, newLine: newLine++ };
    if (text.startsWith('-')) return { text, oldLine: oldLine++, newLine: null };
    return { text, oldLine: oldLine++, newLine: newLine++ };
  });
}

function lineNumberOn(line: NumberedLine, side: Side): number | null {
  return side === 'old' ? line.oldLine : line.newLine;
}

/**
 * Returns the diff lines covering `startLine..endLine` on `side`, plus `contextLines` lines around them,
 * taken from the first hunk that contains the range. Returns `null` when no hunk shows those lines.
 */
export function extractDiffExcerpt(params: {
  hunks: readonly string[];
  side: Side;
  startLine: number;
  endLine: number;
  contextLines: number;
}): string | null {
  for (const hunk of params.hunks) {
    const lines = numberHunk(hunk);
    const hits = lines.flatMap((line, index) => {
      const number = lineNumberOn(line, params.side);
      return number !== null && number >= params.startLine && number <= params.endLine ? [index] : [];
    });
    const first = hits[0];
    const last = hits.at(-1);
    if (first === undefined || last === undefined) continue;
    const from = Math.max(0, first - params.contextLines);
    const to = Math.min(lines.length, last + params.contextLines + 1);
    return lines
      .slice(from, to)
      .map((line) => line.text)
      .join('\n');
  }
  return null;
}
