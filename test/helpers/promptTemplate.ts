import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PromptTemplateSource } from '../../src/server/adapters/fs/PromptTemplateSource.ts';

/** The template shipped in `templates/`, so tests exercise the real prompt. */
export const BUILT_IN_TEMPLATE_PATH = fileURLToPath(
  new URL('../../templates/review-prompt.md', import.meta.url),
);

export const builtInTemplateText = (): string => readFileSync(BUILT_IN_TEMPLATE_PATH, 'utf8');

export const builtInPromptTemplate: PromptTemplateSource = {
  read: async () => ({ text: builtInTemplateText(), path: BUILT_IN_TEMPLATE_PATH }),
};
