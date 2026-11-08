import type { FileStatus } from '../../../shared/types.ts';
import { parseDiffGitHeader, parseMarkerPath, unquoteGitPath } from './gitPath.ts';

/** One file of a unified diff. `hunks` holds each hunk's text, starting with its `@@` line. */
export interface ParsedFileDiff {
  oldPath: string | null;
  newPath: string | null;
  status: Exclude<FileStatus, 'untracked'>;
  isBinary: boolean;
  additions: number;
  deletions: number;
  hunks: string[];
}

interface FileBuilder {
  headerPaths: { oldPath: string | null; newPath: string | null };
  markerPaths: { oldPath?: string | null; newPath?: string | null };
  renamePaths: { oldPath?: string; newPath?: string };
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  additions: number;
  deletions: number;
  hunkLines: string[][];
}

type HeaderHandler = (builder: FileBuilder, rest: string) => void;

const HEADER_HANDLERS: ReadonlyArray<readonly [string, HeaderHandler]> = [
  ['new file mode', (b) => void (b.isNew = true)],
  ['deleted file mode', (b) => void (b.isDeleted = true)],
  ['rename from ', (b, rest) => void (b.renamePaths.oldPath = unquoteGitPath(rest))],
  ['rename to ', (b, rest) => void (b.renamePaths.newPath = unquoteGitPath(rest))],
  ['Binary files ', (b) => void (b.isBinary = true)],
  ['GIT binary patch', (b) => void (b.isBinary = true)],
  ['--- ', (b, rest) => void (b.markerPaths.oldPath = parseMarkerPath(rest))],
  ['+++ ', (b, rest) => void (b.markerPaths.newPath = parseMarkerPath(rest))],
];

function newBuilder(headerRest: string): FileBuilder {
  return {
    headerPaths: parseDiffGitHeader(headerRest),
    markerPaths: {},
    renamePaths: {},
    isNew: false,
    isDeleted: false,
    isBinary: false,
    additions: 0,
    deletions: 0,
    hunkLines: [],
  };
}

function applyHeaderLine(builder: FileBuilder, line: string): void {
  for (const [prefix, handle] of HEADER_HANDLERS) {
    if (line.startsWith(prefix)) {
      handle(builder, line.slice(prefix.length));
      return;
    }
  }
}

function applyHunkLine(builder: FileBuilder, line: string): void {
  const current = builder.hunkLines.at(-1);
  if (!current) return;
  current.push(line);
  if (line.startsWith('+')) builder.additions += 1;
  else if (line.startsWith('-')) builder.deletions += 1;
}

function resolvePath(
  marker: string | null | undefined,
  rename: string | undefined,
  header: string | null,
): string | null {
  if (rename !== undefined) return rename;
  if (marker !== undefined) return marker;
  return header;
}

function statusOf(builder: FileBuilder): ParsedFileDiff['status'] {
  if (builder.isNew) return 'added';
  if (builder.isDeleted) return 'deleted';
  return builder.renamePaths.newPath !== undefined ? 'renamed' : 'modified';
}

function finish(builder: FileBuilder): ParsedFileDiff {
  const status = statusOf(builder);
  const oldPath = resolvePath(
    builder.markerPaths.oldPath,
    builder.renamePaths.oldPath,
    builder.headerPaths.oldPath,
  );
  const newPath = resolvePath(
    builder.markerPaths.newPath,
    builder.renamePaths.newPath,
    builder.headerPaths.newPath,
  );
  return {
    oldPath: status === 'added' ? null : oldPath,
    newPath: status === 'deleted' ? null : newPath,
    status,
    isBinary: builder.isBinary,
    additions: builder.additions,
    deletions: builder.deletions,
    hunks: builder.hunkLines.map((lines) => lines.join('\n')),
  };
}

function applyLine(builder: FileBuilder, line: string): void {
  if (line.startsWith('@@')) {
    builder.hunkLines.push([line]);
    return;
  }
  if (builder.hunkLines.length > 0) applyHunkLine(builder, line);
  else applyHeaderLine(builder, line);
}

/** Splits `git diff` output into files. Paths are best effort; callers that know the paths should prefer theirs. */
export function parseUnifiedDiff(raw: string): ParsedFileDiff[] {
  const lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const files: ParsedFileDiff[] = [];
  let builder: FileBuilder | null = null;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (builder) files.push(finish(builder));
      builder = newBuilder(line.slice('diff --git '.length));
      continue;
    }
    if (builder) applyLine(builder, line);
  }
  if (builder) files.push(finish(builder));
  return files;
}
