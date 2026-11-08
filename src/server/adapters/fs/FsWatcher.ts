import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

export interface ChangeWatcher {
  /** Calls `onChange` once per burst of file events, `debounceMs` after the last one. */
  start(onChange: () => void): void;
  stop(): void;
}

export interface WatchTarget {
  directory: string;
  /** Relative paths (with `/`) to ignore; a match on a whole segment prefix ignores the subtree. */
  ignore: readonly string[];
}

function isIgnored(relativePath: string, ignore: readonly string[]): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  return ignore.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/** `fs.watch` with `recursive`, used only as a trigger; callers re-check real state on each call. */
export class FsChangeWatcher implements ChangeWatcher {
  private readonly targets: readonly WatchTarget[];
  private readonly debounceMs: number;
  private watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(targets: readonly WatchTarget[], debounceMs: number) {
    this.targets = targets;
    this.debounceMs = debounceMs;
  }

  start(onChange: () => void): void {
    const schedule = (): void => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(onChange, this.debounceMs);
    };
    this.watchers = this.targets.flatMap((target) => {
      try {
        const watcher = watch(target.directory, { recursive: true }, (_event, filename) => {
          if (filename === null || !isIgnored(filename.toString(), target.ignore)) schedule();
        });
        watcher.on('error', () => watcher.close());
        return [watcher];
      } catch {
        return [];
      }
    });
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
  }
}
