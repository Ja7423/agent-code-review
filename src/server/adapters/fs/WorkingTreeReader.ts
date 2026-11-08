import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isInsideDirectory } from '../../domain/agents/matchWorktreeAgents.ts';

export interface FileStamp {
  size: number;
  mtimeMs: number;
}

export interface WorkingTreeReader {
  /** Raw bytes of a worktree file, or `null` when it does not exist or escapes the worktree. */
  readBytes(relativePath: string): Promise<Uint8Array | null>;
  stat(relativePath: string): Promise<FileStamp | null>;
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
}

/** Reads files under one worktree root, refusing paths (or symlinks) that resolve outside it. */
export class FsWorkingTreeReader implements WorkingTreeReader {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private async resolveInside(relativePath: string): Promise<string | null> {
    const absolute = path.resolve(this.root, relativePath);
    if (!isInsideDirectory(absolute, this.root)) return null;
    try {
      const real = await realpath(absolute);
      return isInsideDirectory(real, await realpath(this.root)) ? real : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async readBytes(relativePath: string): Promise<Uint8Array | null> {
    const resolved = await this.resolveInside(relativePath);
    if (resolved === null) return null;
    try {
      return await readFile(resolved);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async stat(relativePath: string): Promise<FileStamp | null> {
    const resolved = await this.resolveInside(relativePath);
    if (resolved === null) return null;
    try {
      const info = await stat(resolved);
      return { size: info.size, mtimeMs: info.mtimeMs };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
}
