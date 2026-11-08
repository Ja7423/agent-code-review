import type { FileDiff, Side, ThreadDto } from '../../../shared/types.ts';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** The full unified diff text the viewer parses: a git header followed by the hunks. */
export function toUnifiedText(file: Pick<FileDiff, 'oldPath' | 'newPath' | 'hunks'>): string {
  const name = file.newPath ?? file.oldPath ?? 'file';
  const oldName = file.oldPath ?? name;
  const header = [
    `diff --git a/${oldName} b/${name}`,
    `--- ${file.oldPath === null ? '/dev/null' : `a/${file.oldPath}`}`,
    `+++ ${file.newPath === null ? '/dev/null' : `b/${file.newPath}`}`,
  ];
  return `${[...header, ...file.hunks].join('\n')}\n`;
}

/** Line numbers that appear in the hunks, per side. */
export function visibleLines(hunks: readonly string[]): Record<Side, Set<number>> {
  const visible: Record<Side, Set<number>> = { old: new Set(), new: new Set() };
  for (const hunk of hunks) {
    const [header = '', ...body] = hunk.split('\n');
    const match = HUNK_HEADER.exec(header);
    if (!match) continue;
    let oldLine = Number(match[1]);
    let newLine = Number(match[2]);
    for (const line of body) {
      if (line.startsWith('\\')) continue;
      if (!line.startsWith('+')) visible.old.add(oldLine++);
      if (!line.startsWith('-')) visible.new.add(newLine++);
    }
  }
  return visible;
}

type SideData = Record<string, { data: ThreadDto[] }>;

export interface ThreadPlacement {
  /** Threads shown under their last line, in the shape the diff viewer expects. */
  extendData: { oldFile: SideData; newFile: SideData };
  /** Outdated threads and threads whose lines are not in the diff; listed above the file instead. */
  unplaced: ThreadDto[];
}

function addTo(side: SideData, line: number, thread: ThreadDto): SideData {
  const key = String(line);
  return { ...side, [key]: { data: [...(side[key]?.data ?? []), thread] } };
}

/** Places threads on diff lines. Pure: returns new objects and never touches its inputs. */
export function toExtendData(threads: readonly ThreadDto[], hunks: readonly string[]): ThreadPlacement {
  const visible = visibleLines(hunks);
  return threads.reduce<ThreadPlacement>(
    (placement, thread) => {
      const { side, endLine, isOutdated } = thread.anchor;
      if (isOutdated || !visible[side].has(endLine)) {
        return { ...placement, unplaced: [...placement.unplaced, thread] };
      }
      const key = side === 'old' ? 'oldFile' : 'newFile';
      return {
        ...placement,
        extendData: { ...placement.extendData, [key]: addTo(placement.extendData[key], endLine, thread) },
      };
    },
    { extendData: { oldFile: {}, newFile: {} }, unplaced: [] },
  );
}

/** Threads that belong to one file of the diff (old-side threads use the old path). */
export function threadsForFile(
  threads: readonly ThreadDto[],
  file: { oldPath: string | null; newPath: string | null },
): ThreadDto[] {
  return threads.filter((thread) =>
    thread.anchor.side === 'old' ? thread.anchor.path === file.oldPath : thread.anchor.path === file.newPath,
  );
}
