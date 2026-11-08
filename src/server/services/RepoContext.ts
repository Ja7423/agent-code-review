import { BASE_FALLBACKS } from '../config.ts';
import type { GitClient } from '../adapters/git/GitClient.ts';
import type { ContextDto } from '../../shared/types.ts';

export interface RepoSnapshot {
  worktreePath: string;
  gitDir: string;
  commonDir: string;
  branch: string;
  baseRef: string;
  mergeBaseSha: string;
  headSha: string;
  emptyTreeSha: string;
}

export class RepoContextError extends Error {}

const trimmed = (text: string): string => text.trim();

async function tryRun(git: GitClient, args: readonly string[]): Promise<string | null> {
  try {
    return trimmed(await git.run(args));
  } catch {
    return null;
  }
}

async function verifyCommit(git: GitClient, ref: string): Promise<boolean> {
  return (
    (await tryRun(git, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`])) !== null
  );
}

/** `origin/HEAD`, then local `main`, then `master`. */
async function detectBase(git: GitClient): Promise<string> {
  const originHead = await tryRun(git, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead && (await verifyCommit(git, originHead))) return originHead;
  for (const candidate of BASE_FALLBACKS) {
    if (await verifyCommit(git, candidate)) return candidate;
  }
  throw new RepoContextError(
    'Could not detect a base branch (origin/HEAD, main, master). Pass --base <ref>.',
  );
}

async function currentBranch(git: GitClient, headSha: string): Promise<string> {
  return (
    (await tryRun(git, ['symbolic-ref', '--quiet', '--short', 'HEAD'])) ?? `(detached ${headSha.slice(0, 7)})`
  );
}

/** The repository facts every view depends on. Recomputed when refs change. */
export class RepoContext {
  private readonly git: GitClient;
  private snapshot: RepoSnapshot;

  private constructor(git: GitClient, snapshot: RepoSnapshot) {
    this.git = git;
    this.snapshot = snapshot;
  }

  static async load(git: GitClient, opts: { baseOverride?: string } = {}): Promise<RepoContext> {
    const isRepo = await tryRun(git, ['rev-parse', '--is-inside-work-tree']);
    if (isRepo !== 'true') throw new RepoContextError('Not inside a git work tree.');
    const baseRef = opts.baseOverride ?? (await detectBase(git));
    const context = new RepoContext(git, await RepoContext.compute(git, baseRef));
    return context;
  }

  private static async compute(git: GitClient, baseRef: string): Promise<RepoSnapshot> {
    if (!(await verifyCommit(git, baseRef)))
      throw new RepoContextError(`Base ref "${baseRef}" is not a commit.`);
    const [worktreePath, gitDir, commonDir, headSha, emptyTreeSha] = await Promise.all([
      git.run(['rev-parse', '--show-toplevel']).then(trimmed),
      git.run(['rev-parse', '--absolute-git-dir']).then(trimmed),
      git.run(['rev-parse', '--path-format=absolute', '--git-common-dir']).then(trimmed),
      git.run(['rev-parse', '--verify', 'HEAD']).then(trimmed),
      git.run(['hash-object', '-t', 'tree', '/dev/null']).then(trimmed),
    ]);
    const mergeBaseSha = await tryRun(git, ['merge-base', '--end-of-options', baseRef, 'HEAD']);
    if (!mergeBaseSha) throw new RepoContextError(`"${baseRef}" and HEAD have no common ancestor.`);
    const branch = await currentBranch(git, headSha);
    return { worktreePath, gitDir, commonDir, branch, baseRef, mergeBaseSha, headSha, emptyTreeSha };
  }

  current(): RepoSnapshot {
    return this.snapshot;
  }

  /** Recomputes HEAD, branch and merge-base. Returns whether anything changed. */
  async refresh(): Promise<boolean> {
    const next = await RepoContext.compute(this.git, this.snapshot.baseRef);
    const isChanged = JSON.stringify(next) !== JSON.stringify(this.snapshot);
    this.snapshot = next;
    return isChanged;
  }

  async setBase(baseRef: string): Promise<void> {
    this.snapshot = await RepoContext.compute(this.git, baseRef);
  }

  /** Local and remote branches, for the base picker. */
  async listBaseCandidates(): Promise<string[]> {
    const raw = await this.git.run([
      'for-each-ref',
      '--count=200',
      '--sort=-committerdate',
      '--format=%(refname:short)',
      'refs/heads',
      'refs/remotes',
    ]);
    return raw
      .split('\n')
      .map(trimmed)
      .filter((ref) => ref !== '' && !ref.endsWith('/HEAD') && ref !== 'origin');
  }

  /** Every worktree root of this repository, including this one. */
  async listWorktreeRoots(): Promise<string[]> {
    const raw = await this.git.run(['worktree', 'list', '--porcelain', '-z']);
    return raw
      .split('\0')
      .filter((field) => field.startsWith('worktree '))
      .map((field) => field.slice('worktree '.length));
  }

  async toDto(): Promise<ContextDto> {
    const { worktreePath, branch, baseRef, mergeBaseSha, headSha, commonDir } = this.snapshot;
    return {
      repoRoot: commonDir.endsWith('/.git') ? commonDir.slice(0, -'/.git'.length) : commonDir,
      worktreePath,
      branch,
      baseRef,
      mergeBaseSha,
      headSha,
      baseCandidates: await this.listBaseCandidates(),
    };
  }
}
