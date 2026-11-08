import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsPromptTemplateSource } from './PromptTemplateSource.ts';

describe('FsPromptTemplateSource', () => {
  let dir: string;
  let builtIn: string;
  let user: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'revi-template-'));
    builtIn = path.join(dir, 'built-in.md');
    user = path.join(dir, 'user.md');
    await writeFile(builtIn, 'built-in');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to the built-in template when the user has none', async () => {
    const source = new FsPromptTemplateSource({ user, builtIn });
    expect(await source.read()).toEqual({ text: 'built-in', path: builtIn });
  });

  it("prefers the user's template, and reads it again on every call", async () => {
    const source = new FsPromptTemplateSource({ user, builtIn });
    await writeFile(user, 'v1');
    expect((await source.read()).text).toBe('v1');
    await writeFile(user, 'v2');
    expect((await source.read()).text).toBe('v2');
  });

  it('uses --prompt-template over everything and fails when it is missing', async () => {
    await writeFile(user, 'user');
    const explicit = path.join(dir, 'explicit.md');
    await writeFile(explicit, 'explicit');
    expect((await new FsPromptTemplateSource({ explicit, user, builtIn }).read()).text).toBe('explicit');
    const missing = new FsPromptTemplateSource({ explicit: path.join(dir, 'nope.md'), user, builtIn });
    await expect(missing.read()).rejects.toThrow(/ENOENT/);
  });
});
