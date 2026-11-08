import type { FileDiffSummary, FileStatus } from '../../../shared/types.ts';
import type { NumstatEntry } from './parseNumstatZ.ts';

export interface NameStatusEntry {
  status: Exclude<FileStatus, 'untracked'>;
  oldPath: string | null;
  newPath: string | null;
}

const STATUS_BY_LETTER: Readonly<Record<string, NameStatusEntry['status']>> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
  T: 'modified',
  R: 'renamed',
  C: 'added',
};

function entryFor(letter: string, first: string, second: string | undefined): NameStatusEntry {
  const status = STATUS_BY_LETTER[letter] ?? 'modified';
  if (status === 'added') return { status, oldPath: null, newPath: second ?? first };
  if (status === 'deleted') return { status, oldPath: first, newPath: null };
  if (status === 'renamed') return { status, oldPath: first, newPath: second ?? first };
  return { status, oldPath: first, newPath: first };
}

/** Parses `git diff --name-status -z`: `M\0path\0`, or `R100\0old\0new\0` for renames and copies. */
export function parseNameStatusZ(raw: string): NameStatusEntry[] {
  const tokens = raw.split('\0');
  const entries: NameStatusEntry[] = [];
  let index = 0;
  while (index < tokens.length) {
    const code = tokens[index] ?? '';
    if (code === '') {
      index += 1;
      continue;
    }
    const letter = code[0] ?? 'M';
    const hasTwoPaths = letter === 'R' || letter === 'C';
    entries.push(entryFor(letter, tokens[index + 1] ?? '', hasTwoPaths ? tokens[index + 2] : undefined));
    index += hasTwoPaths ? 3 : 2;
  }
  return entries;
}

export interface UntrackedFile {
  path: string;
  isBinary: boolean;
  lineCount: number;
}

export interface SummaryLimits {
  largeFileChangedLines: number;
}

function withCollapse(
  summary: Omit<FileDiffSummary, 'isCollapsedByDefault'>,
  limits: SummaryLimits,
): FileDiffSummary {
  return {
    ...summary,
    isCollapsedByDefault: summary.additions + summary.deletions > limits.largeFileChangedLines,
  };
}

export function displayPath(summary: Pick<FileDiffSummary, 'oldPath' | 'newPath'>): string {
  return summary.newPath ?? summary.oldPath ?? '';
}

/** Joins name-status (what happened) with numstat (how much), adds untracked files, sorts by path. */
export function buildFileSummaries(params: {
  nameStatus: readonly NameStatusEntry[];
  numstat: readonly NumstatEntry[];
  untracked: readonly UntrackedFile[];
  limits: SummaryLimits;
}): FileDiffSummary[] {
  // numstat reports a deleted file under its old path, so keying name-status by `newPath ?? oldPath` lines up.
  const statusByPath = new Map(params.nameStatus.map((e) => [e.newPath ?? e.oldPath ?? '', e.status]));
  const tracked = params.numstat.map((entry) => {
    const status = statusByPath.get(entry.newPath) ?? 'modified';
    return withCollapse(
      {
        oldPath: status === 'added' ? null : (entry.oldPath ?? entry.newPath),
        newPath: status === 'deleted' ? null : entry.newPath,
        status,
        isBinary: entry.additions === null,
        additions: entry.additions ?? 0,
        deletions: entry.deletions ?? 0,
      },
      params.limits,
    );
  });
  const untracked = params.untracked.map((file) =>
    withCollapse(
      {
        oldPath: null,
        newPath: file.path,
        status: 'untracked',
        isBinary: file.isBinary,
        additions: file.isBinary ? 0 : file.lineCount,
        deletions: 0,
      },
      params.limits,
    ),
  );
  return [...tracked, ...untracked].sort((a, b) => displayPath(a).localeCompare(displayPath(b)));
}

const BINARY_SNIFF_BYTES = 8000;

/** git's heuristic: a NUL byte in the first 8000 bytes means binary. */
export function isBinaryContent(bytes: Uint8Array): boolean {
  return bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}
