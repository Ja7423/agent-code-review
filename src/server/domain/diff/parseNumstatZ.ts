export interface NumstatEntry {
  oldPath: string | null;
  newPath: string;
  /** `null` means git reported `-`, i.e. a binary file. */
  additions: number | null;
  deletions: number | null;
}

function parseCount(raw: string): number | null {
  return raw === '-' ? null : Number.parseInt(raw, 10);
}

/**
 * Parses `git diff --numstat -z`.
 * Regular entry: `add\tdel\tpath\0`. Rename or copy: `add\tdel\t\0old\0new\0`.
 */
export function parseNumstatZ(raw: string): NumstatEntry[] {
  const tokens = raw.split('\0');
  const entries: NumstatEntry[] = [];
  let index = 0;
  while (index < tokens.length) {
    const head = tokens[index] ?? '';
    index += 1;
    if (head === '') continue;
    const [add = '', del = '', ...rest] = head.split('\t');
    const inlinePath = rest.join('\t');
    const counts = { additions: parseCount(add), deletions: parseCount(del) };
    if (inlinePath !== '') {
      entries.push({ oldPath: inlinePath, newPath: inlinePath, ...counts });
      continue;
    }
    const oldPath = tokens[index] ?? '';
    const newPath = tokens[index + 1] ?? '';
    index += 2;
    entries.push({ oldPath, newPath, ...counts });
  }
  return entries;
}

export function isRenameEntry(entry: NumstatEntry): boolean {
  return entry.oldPath !== null && entry.oldPath !== entry.newPath;
}
