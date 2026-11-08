import { readFile } from 'node:fs/promises';

export interface PromptTemplate {
  text: string;
  /** Where the template came from, for error messages. */
  path: string;
}

export interface PromptTemplateSource {
  /** Reads the template fresh, so edits to the file apply to the next delivery. */
  read(): Promise<PromptTemplate>;
}

export interface PromptTemplatePaths {
  /** From `--prompt-template`; must exist. */
  explicit?: string;
  /** The user's override; used when it exists. */
  user: string;
  /** Shipped with revi. */
  builtIn: string;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';

async function readTemplate(path: string): Promise<PromptTemplate> {
  return { text: await readFile(path, 'utf8'), path };
}

/** Picks the first template that applies: `--prompt-template`, then the user's file, then the built-in one. */
export class FsPromptTemplateSource implements PromptTemplateSource {
  private readonly paths: PromptTemplatePaths;

  constructor(paths: PromptTemplatePaths) {
    this.paths = paths;
  }

  async read(): Promise<PromptTemplate> {
    if (this.paths.explicit !== undefined) return readTemplate(this.paths.explicit);
    try {
      return await readTemplate(this.paths.user);
    } catch (error) {
      if (!isMissing(error)) throw error;
      return readTemplate(this.paths.builtIn);
    }
  }
}
