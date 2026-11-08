import { ExecGitClient } from '../server/adapters/git/GitClient.ts';

export interface WorktreeLocation {
  worktreePath: string;
  commonDir: string;
}

/** Finds the worktree root and common git dir from any directory inside the worktree. */
export async function discoverWorktree(cwd: string): Promise<WorktreeLocation> {
  const git = new ExecGitClient(cwd);
  try {
    const [worktreePath, commonDir] = await Promise.all([
      git.run(['rev-parse', '--show-toplevel']),
      git.run(['rev-parse', '--path-format=absolute', '--git-common-dir']),
    ]);
    return { worktreePath: worktreePath.trim(), commonDir: commonDir.trim() };
  } catch {
    throw new Error(`${cwd} is not inside a git work tree.`);
  }
}
