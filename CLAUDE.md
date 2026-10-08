<!-- markdownlint-disable MD022 MD012 MD013 -->
# CLAUDE.md — Claude Code adapter
@AGENTS.md

AGENTS.md is the operating guide. This file adds Claude Code specifics only.

## What this is
Helm Sports Labs: GolfHelm (+ CoachHelm AI), BaseballHelm, Lift Lab.
Next.js App Router, TypeScript strict, Supabase, Tailwind, Capacitor iOS shell.

## Context for a task
    npm run knowledge:map -- --files <paths...>
    npm run knowledge:context -- --files <paths...> --task "<task>"
Generated truth beats prose: `src/lib/types/database.ts` (`npm run db:types`)
and `AUTOGEN:*` blocks in `memory/` (never hand-edit inside one).
`src/lib/golf/surface-registry.ts` is hand-maintained and canonical.

## Rules the compiler will not catch
    import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';
    import type { BaseballCoach, BaseballPlayer } from '@/lib/types';
    // Server: await createClient() from '@/lib/supabase/server'
    // Client: createClient() from '@/lib/supabase/client', with 'use client'
    // Tables are sport-prefixed: golf_*, baseball_*, helm_lifting_*.
    // Anything with useState/useEffect/onClick starts with 'use client'.
    // Tests: new ones go in __tests__/ next to the code (AGENTS.md); src/test/** is
    // legacy and its count may only fall (npm run lint:test-location).

## Commands
    npm run dev / typecheck / typecheck:fast / lint / test / test:all
    npm run check:changed          # inner loop: changed-file lint + tsgo + related tests
    npm run test:file -- <paths>   # one test file, fast
    npm run gates:review           # preview the Review Gate before you push
    npm run doctor                 # is this checkout healthy (deps, env, tooling)
    npm run build                  # when a 'use server' surface changed
    npm run test:rls               # pgTAP, for policies and migrations
    npm run docs:check             # generated docs, drift, enforcement inventory
    npm run release:status         # what production serves vs main
`repo:doctor`, `helm-os:check`, `knowledge:check`, `control-plane:verify` and
`guards` are CI internals (`scripts/README.md`). Scripts that hold credentials
print `--help`, and writers are a dry run until you pass `--apply`.

## Traps that waste time
- zsh errors on unmatched globs: quote them (`--include='*.ts'`). macOS has no
  `timeout`. Run slow checks (`build`, full `test`) in the background to a log
  file and read it; a foreground call stops at 10 minutes.
- Read big files with `offset` and `limit` (`golf.ts` is over 10,000 lines).
- Read `src/lib/types/database.ts` before writing SQL; guessing column names
  is the most common SQL failure.
- Server code logs with `logServerError` / `logServerEvent`
  (`src/lib/server-error-logger.ts`) and wraps actions with
  `src/lib/admin/observed-action.ts`.
- Subagents cannot use `AskUserQuestion` or slash commands and receive no hook
  output; brief them fully and have them return open questions with a default.
- Switching checkouts is allowed when the user asks: `cd` to the other
  worktree, `git switch` in a clean checkout, or EnterWorktree / ExitWorktree.
  No hook or permission rule blocks it; only another session's dirty files do.

## Slash commands
`/context` feature docs · `/gates` pick checks · `/worktree` isolate ·
`/land` merge + sync + retire · `/status` repo health · `/held` held
migrations · `/cleanup-db` dead-object report (read-only) · `/helm-review`
multi-agent PR review · `/helm-fix-ci` red CI on agent PRs.

## Subagents (use when the task warrants; none is mandatory)

| Agent | Use for |
| --- | --- |
| `helm-reader` | cited, read-only investigation (instead of Explore for Helm questions) |
| `helm-worker` | bounded or parallel implementation in an assigned checkout |
| `helm-ui-worker` | one Fairway screen redesign and implementation, in its own worktree |
| `debugger` | a failure whose cause isn't obvious after a first look |
| `verifier` | an independent check of a done-claim on risky work |
| `code-reviewer` | fresh-context review of a non-trivial diff |
| `security-reviewer` | auth, RLS, PII, API routes, storage, secrets |
| `db-migration-reviewer` | schema, RLS, grants, or migrations headed to production |
| `ui-polish-reviewer` | Fairway UI/UX review of a changed screen |
| `clubhouse-design-reviewer`, `clubhouse-polish-reviewer` | Clubhouse design and polish review |

Skills: `finish-task` (definition of done and green-gate traps),
`helm-supabase` (Supabase client and query traps), `helm-sentry` (read-only
production error investigation).
