import type { AgentDto } from '../../../shared/types.ts';

function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function isInsideDirectory(path: string, root: string): boolean {
  const normalizedPath = trimSlash(path);
  const normalizedRoot = trimSlash(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

/**
 * Keeps agents whose (already realpath-resolved) cwd is inside this worktree but not inside another
 * worktree nested in it.
 */
export function matchWorktreeAgents(
  agents: readonly AgentDto[],
  worktreeRoot: string,
  nestedWorktreeRoots: readonly string[],
): AgentDto[] {
  const nested = nestedWorktreeRoots.filter(
    (root) => trimSlash(root) !== trimSlash(worktreeRoot) && isInsideDirectory(root, worktreeRoot),
  );
  return agents.filter(
    (agent) =>
      isInsideDirectory(agent.cwd, worktreeRoot) &&
      !nested.some((root) => isInsideDirectory(agent.cwd, root)),
  );
}
