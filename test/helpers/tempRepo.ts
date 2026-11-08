import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TempRepo {
  root: string;
  git(...args: string[]): string;
  write(relativePath: string, content: string | Uint8Array): void;
  commit(message: string): string;
  cleanup(): void;
}

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function createTempRepo(): TempRepo {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'revi-test-')));
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, env: ENV, encoding: 'utf8' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  return {
    root,
    git,
    write(relativePath, content) {
      const absolute = path.join(root, relativePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    },
    commit(message) {
      git('add', '-A');
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD').trim();
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export const lines = (...items: string[]): string => `${items.join('\n')}\n`;
