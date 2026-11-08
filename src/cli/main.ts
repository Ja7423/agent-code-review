#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { replyCommand, REPLY_USAGE } from './replyCommand.ts';
import { serveCommand, SERVE_USAGE } from './serveCommand.ts';

const HELP = `revi: review this worktree's changes in the browser and send comments to a herdr agent.

${SERVE_USAGE}
${REPLY_USAGE}

  revi                 start the review server for the current worktree and open the browser
  revi reply <id> ...  answer a review thread (run by the agent)`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'reply') return replyCommand(rest);
  if (command === 'serve') return serveCommand(rest);
  if (command === '--help' || command === '-h' || command === 'help') return void console.log(HELP);
  if (command === '--version' || command === '-v') return void console.log(version());
  return serveCommand(argv);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`revi: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
