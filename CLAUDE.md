# revi

Local code review for a git worktree. `revi` serves a web page that shows the branch's diff, collects
GitHub-style line comments, and delivers a submitted review to a herdr agent in the same worktree.
The spec is `doc/plan/cli-code-review-2026-11-07.md`.

## Commands

- `npm test`: Vitest (unit and integration). Run one area with `npm test -- src/server/domain`.
- `npm run typecheck`: server (`tsconfig.json`) and web (`tsconfig.web.json`).
- `npm run lint`: ESLint with typescript-eslint strict, complexity ≤ 15, depth ≤ 4, functions ≤ 80 lines.
- `npm run build`: `tsc` for the server into `dist/`, Vite for the web app into `dist/web`.
- `npm start -- [--base <ref>]`: runs the server from source (Node 26 strips types natively).

## Layers

Dependencies point down only: `cli → http → services → domain`, and `services → adapter interfaces`.

- `src/server/domain/`: pure functions and types. No Node APIs, no I/O, no clock, no randomness.
  Inputs are `readonly`; functions never mutate their arguments.
- `src/server/adapters/`: the only code that touches processes, sockets, SQLite, files, time or ids.
  SQL appears only in `adapters/store/`.
- `src/server/services/`: use cases. Dependencies arrive through the constructor; services never
  import a concrete adapter.
- `src/server/http/`: Hono routes validate input with zod, call a service, serialize the result.
- `src/cli/`: composition roots (`serveCommand.ts`, `replyCommand.ts`). The only place that wires
  concrete adapters into services.
- `src/web/`: React 19. Server data goes through TanStack Query (`api/queries.ts`); SSE events only
  invalidate queries. Only `components/diff/DiffFileView.tsx` imports `@git-diff-view/react`.
- `src/shared/`: DTO types and tiny pure helpers used by both sides.

## Conventions

- Server imports use explicit `.ts` extensions (`rewriteRelativeImportExtensions` turns them into
  `.js` on build), and only erasable TypeScript syntax (no enums, no parameter properties).
- Booleans start with `is`/`has`/`can`/`should`. Query methods (`list*`, `get*`, `read*`) never mutate.
- Vocabulary: a **review** groups the user's comments sent together; a **thread** is the comment chain on
  one anchor; a **delivery** is one attempt to send a review to an agent.
- Tunable numbers belong in `src/server/config.ts`.
- The agent prompt's wording lives in `templates/review-prompt.md` (Mustache, excluded from Prettier because
  its whitespace is the prompt's). `domain/prompt/reviewPrompt.ts` computes the values it can use; a new
  value goes in `PromptView` and in the template's header comment.
- Tests sit next to the code as `*.test.ts`; shared fixtures live in `test/helpers/`.
