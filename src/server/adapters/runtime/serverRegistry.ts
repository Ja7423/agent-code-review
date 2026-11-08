import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ServerEntry {
  port: number;
  pid: number;
  replyToken: string;
  worktreePath: string;
  startedAt: string;
}

/** `<common-dir>/revi/`: the database, the server registry and oversized prompt files. */
export function reviDataDir(commonDir: string): string {
  return path.join(commonDir, 'revi');
}

export function databasePath(commonDir: string): string {
  return path.join(reviDataDir(commonDir), 'revi.db');
}

function entryPath(commonDir: string, worktreePath: string): string {
  const hash = createHash('sha256').update(worktreePath).digest('hex').slice(0, 16);
  return path.join(reviDataDir(commonDir), 'servers', `${hash}.json`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Lets `revi reply` find the server for its worktree. Files are private to the user (0600). */
export const serverRegistry = {
  write(commonDir: string, entry: ServerEntry): void {
    const file = entryPath(commonDir, entry.worktreePath);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(entry, null, 2), { mode: 0o600 });
  },

  /** The live server for a worktree, or `null` when none is registered or its process is gone. */
  read(commonDir: string, worktreePath: string): ServerEntry | null {
    try {
      const entry = JSON.parse(readFileSync(entryPath(commonDir, worktreePath), 'utf8')) as ServerEntry;
      return isProcessAlive(entry.pid) ? entry : null;
    } catch {
      return null;
    }
  },

  remove(commonDir: string, worktreePath: string): void {
    rmSync(entryPath(commonDir, worktreePath), { force: true });
  },
};
