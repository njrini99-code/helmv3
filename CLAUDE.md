<!-- markdownlint-disable MD022 MD012 MD013 -->
# CLAUDE.md — Claude Code adapter
@AGENTS.md

AGENTS.md is the policy. This file adds Claude Code specifics only.

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

## Commands
    npm run dev / typecheck / typecheck:fast / lint / test / test:all
    npm run test:file -- <paths>   # inner loop
    npm run build                  # when a 'use server' surface changed
    npm run test:rls               # pgTAP, for policies and migrations
    npm run docs:check             # generated docs, drift, enforcement inventory
    npm run doctor / repo:doctor / release:status

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
| `debugger` | a failure whose cause isn't obvious after a first look |
| `verifier` | an independent check of a done-claim on risky work |
| `code-reviewer` | fresh-context review of a non-trivial diff |
| `security-reviewer` | auth, RLS, PII, API routes, storage, secrets |
| `db-migration-reviewer` | schema, RLS, grants, or migrations headed to production |
| `ui-polish-reviewer` | Fairway UI/UX review of a changed screen |

Skills: `finish-task` (definition of done and green-gate traps),
`helm-supabase` (Supabase client and query traps), `helm-sentry` (read-only
production error investigation).
