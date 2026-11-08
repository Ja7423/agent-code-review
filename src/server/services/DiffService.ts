import type { GitClient } from '../adapters/git/GitClient.ts';
import type { WorkingTreeReader } from '../adapters/fs/WorkingTreeReader.ts';
import type { CommitDto, FileDiff, FileDiffSummary, FileListDto, Side, ViewRef } from '../../shared/types.ts';
import {
  buildFileSummaries,
  displayPath,
  isBinaryContent,
  parseNameStatusZ,
  splitLines,
} from '../domain/diff/buildFileSummaries.ts';
import type { UntrackedFile } from '../domain/diff/buildFileSummaries.ts';
import { diffFingerprint } from '../domain/diff/diffFingerprint.ts';
import { parseNumstatZ } from '../domain/diff/parseNumstatZ.ts';
import { parseUnifiedDiff } from '../domain/diff/parseUnifiedDiff.ts';
import { revRangeArgs, revRangeFor } from '../domain/diff/revRangeFor.ts';
import type { RevRange } from '../domain/diff/revRangeFor.ts';
import type { RepoContext } from './RepoContext.ts';

export interface DiffLimits {
  largeFileChangedLines: number;
  maxUntrackedFiles: number;
}

export class FileNotInDiffError extends Error {}

/** Flags that make `git diff` output independent of user config (external tools, prefixes, relative mode). */
const DIFF_FLAGS = [
  '-M',
  '--no-ext-diff',
  '--no-relative',
  '--no-color',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];
const FIELD = '\x1f';
const RECORD = '\x1e';

const decoder = new TextDecoder();

export class DiffService {
  private readonly git: GitClient;
  private readonly context: RepoContext;
  private readonly files: WorkingTreeReader;
  private readonly limits: DiffLimits;

  constructor(deps: { git: GitClient; context: RepoContext; files: WorkingTreeReader; limits: DiffLimits }) {
    this.git = deps.git;
    this.context = deps.context;
    this.files = deps.files;
    this.limits = deps.limits;
  }

  async listCommits(): Promise<CommitDto[]> {
    const { mergeBaseSha } = this.context.current();
    const format = ['%H', '%P', '%s', '%an', '%aI'].join('%x1f') + '%x1e';
    const raw = await this.git.run(['log', `--format=${format}`, `${mergeBaseSha}..HEAD`, '--']);
    return raw
      .split(RECORD)
      .map((record) => record.replace(/^\n/, ''))
      .filter((record) => record !== '')
      .map((record) => {
        const [sha = '', parents = '', subject = '', author = '', date = ''] = record.split(FIELD);
        return { sha, parents: parents === '' ? [] : parents.split(' '), subject, author, date };
      });
  }

  async rangeFor(view: ViewRef): Promise<RevRange> {
    const snapshot = this.context.current();
    const parents = view.kind === 'commit' ? await this.parentsOf(view.sha) : [];
    return revRangeFor(view, { ...snapshot, parentsOf: () => parents });
  }

  private async parentsOf(sha: string): Promise<string[]> {
    const raw = await this.git.run(['rev-list', '--parents', '-n', '1', '--end-of-options', sha]);
    return raw.trim().split(' ').slice(1);
  }

  async listFiles(view: ViewRef): Promise<FileListDto> {
    const rangeArgs = revRangeArgs(await this.rangeFor(view));
    const [numstat, nameStatus, untracked] = await Promise.all([
      this.git.run(['diff', ...DIFF_FLAGS, '--numstat', '-z', ...rangeArgs, '--']),
      this.git.run(['diff', ...DIFF_FLAGS, '--name-status', '-z', ...rangeArgs, '--']),
      view.kind === 'commit' ? Promise.resolve({ paths: [], isTruncated: false }) : this.listUntracked(),
    ]);
    const untrackedFiles = await Promise.all(untracked.paths.map((path) => this.describeUntracked(path)));
    const files = buildFileSummaries({
      nameStatus: parseNameStatusZ(nameStatus),
      numstat: parseNumstatZ(numstat),
      untracked: untrackedFiles,
      limits: this.limits,
    });
    return { files, isUntrackedTruncated: untracked.isTruncated };
  }

  private async listUntracked(): Promise<{ paths: string[]; isTruncated: boolean }> {
    const raw = await this.git.run(['ls-files', '--others', '--exclude-standard', '-z']);
    const all = raw.split('\0').filter((path) => path !== '');
    return {
      paths: all.slice(0, this.limits.maxUntrackedFiles),
      isTruncated: all.length > this.limits.maxUntrackedFiles,
    };
  }

  private async describeUntracked(path: string): Promise<UntrackedFile> {
    const bytes = (await this.files.readBytes(path)) ?? new Uint8Array();
    const isBinary = isBinaryContent(bytes);
    return { path, isBinary, lineCount: isBinary ? 0 : splitLines(decoder.decode(bytes)).length };
  }

  async findFile(view: ViewRef, path: string): Promise<FileDiffSummary> {
    const { files } = await this.listFiles(view);
    const summary = files.find((file) => file.newPath === path || file.oldPath === path);
    if (!summary) throw new FileNotInDiffError(`${path} is not part of this diff`);
    return summary;
  }

  async getFileDiff(view: ViewRef, path: string): Promise<FileDiff> {
    const summary = await this.findFile(view, path);
    if (summary.isBinary) return { ...summary, hunks: [] };
    const raw = await this.rawFileDiff(view, summary);
    const parsed = parseUnifiedDiff(raw)[0];
    return { ...summary, hunks: parsed?.hunks ?? [] };
  }

  private async rawFileDiff(view: ViewRef, summary: FileDiffSummary): Promise<string> {
    if (summary.status === 'untracked') {
      const args = ['diff', ...DIFF_FLAGS, '--no-index', '--', '/dev/null', displayPath(summary)];
      return this.git.run(args, { allowExitCodes: [1] });
    }
    const paths = [summary.oldPath, summary.newPath].filter(
      (p, i, all): p is string => p !== null && all.indexOf(p) === i,
    );
    const rangeArgs = revRangeArgs(await this.rangeFor(view));
    return this.git.run(['diff', ...DIFF_FLAGS, ...rangeArgs, '--', ...paths]);
  }

  /** Full content of one side of a view, or `null` when the file does not exist on that side. */
  async readFileLines(view: ViewRef, side: Side, path: string): Promise<string[] | null> {
    const range = await this.rangeFor(view);
    const rev = side === 'old' ? range.from : range.to;
    if (rev === null) {
      const bytes = await this.files.readBytes(path);
      return bytes === null ? null : splitLines(decoder.decode(bytes));
    }
    try {
      return splitLines(await this.git.run(['show', `${rev}:${path}`]));
    } catch {
      return null;
    }
  }

  /** Changes whenever anything visible in the merged or uncommitted views changes. */
  async fingerprint(): Promise<string> {
    const { mergeBaseSha, headSha } = this.context.current();
    const [diffText, untracked] = await Promise.all([
      this.git.run(['diff', ...DIFF_FLAGS, mergeBaseSha, '--']),
      this.listUntracked(),
    ]);
    const stamps = await Promise.all(
      untracked.paths.map(async (path) => {
        const stamp = await this.files.stat(path);
        return `${path}\t${stamp?.size ?? -1}\t${stamp?.mtimeMs ?? -1}`;
      }),
    );
    return diffFingerprint({ headSha, diffText, untracked: stamps });
  }
}
