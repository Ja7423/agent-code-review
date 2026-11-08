import { execFile } from 'node:child_process';
import { config } from '../../config.ts';

export interface GitRunOptions {
  /** Exit codes that still count as success, e.g. `[1]` for `git diff --no-index` when files differ. */
  allowExitCodes?: readonly number[];
}

export interface GitClient {
  run(args: readonly string[], opts?: GitRunOptions): Promise<string>;
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number | null, stderr: string) {
    super(`git ${args.join(' ')} failed (${exitCode ?? 'signal'}): ${stderr.trim()}`);
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Options that keep git output machine-readable no matter how the user configured git. */
const FIXED_CONFIG = ['-c', 'core.quotePath=false', '-c', 'color.ui=false', '-c', 'diff.noprefix=false'];

/**
 * Runs git through `execFile` (never a shell). Callers put paths after `--`.
 * `GIT_OPTIONAL_LOCKS=0` keeps read commands from taking `index.lock` while an agent runs git too.
 */
export class ExecGitClient implements GitClient {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  run(args: readonly string[], opts: GitRunOptions = {}): Promise<string> {
    const fullArgs = [...FIXED_CONFIG, ...args];
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        fullArgs,
        {
          cwd: this.cwd,
          encoding: 'utf8',
          maxBuffer: config.GIT_MAX_BUFFER_BYTES,
          env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
        },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          const exitCode = typeof error.code === 'number' ? error.code : null;
          if (exitCode !== null && opts.allowExitCodes?.includes(exitCode)) return resolve(stdout);
          reject(new GitCommandError(args, exitCode, stderr));
        },
      );
    });
  }
}
