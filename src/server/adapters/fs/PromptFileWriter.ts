import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PromptFileWriter {
  /** Writes a review prompt that is too large to paste and returns its absolute path. */
  write(name: string, text: string): Promise<string>;
}

export class FsPromptFileWriter implements PromptFileWriter {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async write(name: string, text: string): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.md`);
    await writeFile(file, text, { mode: 0o600 });
    return file;
  }
}
