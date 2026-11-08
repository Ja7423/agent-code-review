const ESCAPES: Readonly<Record<string, string>> = {
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '"': '"',
  '\\': '\\',
};

/** Reads one C-quoted token starting at `start` (which must be `"`). Returns the text and the index after it. */
export function readQuotedToken(text: string, start: number): { value: string; end: number } {
  const bytes: number[] = [];
  let index = start + 1;
  while (index < text.length && text[index] !== '"') {
    const char = text[index] ?? '';
    if (char !== '\\') {
      bytes.push(...new TextEncoder().encode(char));
      index += 1;
      continue;
    }
    const next = text[index + 1] ?? '';
    const octal = /^[0-7]{3}/.exec(text.slice(index + 1, index + 4));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      index += 4;
      continue;
    }
    bytes.push(...new TextEncoder().encode(ESCAPES[next] ?? next));
    index += 2;
  }
  return { value: new TextDecoder().decode(new Uint8Array(bytes)), end: index + 1 };
}

/** Undoes git's C-style path quoting (`"a/sp\303\251cial\ttab"`). Unquoted input is returned as is. */
export function unquoteGitPath(raw: string): string {
  return raw.startsWith('"') ? readQuotedToken(raw, 0).value : raw;
}

/** Turns `a/src/x.ts` into `src/x.ts` and `/dev/null` into `null`. */
export function stripDiffPrefix(path: string): string | null {
  if (path === '/dev/null') return null;
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

/** Parses the path in a `--- a/x` or `+++ b/x` line (text after the marker and space). */
export function parseMarkerPath(rest: string): string | null {
  const withoutTimestamp = rest.startsWith('"') ? rest : rest.replace(/\t.*$/, '');
  return stripDiffPrefix(unquoteGitPath(withoutTimestamp));
}

/** Best-effort split of `diff --git a/X b/Y` into its two paths. */
export function parseDiffGitHeader(rest: string): { oldPath: string | null; newPath: string | null } {
  if (rest.startsWith('"')) {
    const first = readQuotedToken(rest, 0);
    return {
      oldPath: stripDiffPrefix(first.value),
      newPath: stripDiffPrefix(unquoteGitPath(rest.slice(first.end + 1))),
    };
  }
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest.slice(2, half) === rest.slice(half + 3)) {
    const path = rest.slice(2, half);
    return { oldPath: path, newPath: path };
  }
  const split = rest.indexOf(' b/');
  if (split < 0) return { oldPath: null, newPath: null };
  return {
    oldPath: stripDiffPrefix(rest.slice(0, split)),
    newPath: stripDiffPrefix(unquoteGitPath(rest.slice(split + 1))),
  };
}
