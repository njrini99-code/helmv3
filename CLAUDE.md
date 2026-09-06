<!-- markdownlint-disable MD022 MD012 -->
# CLAUDE.md — Claude Code adapter
@AGENTS.md

AGENTS.md is the constitution and outranks this file. `.claude/rules/*.md`
attach by path; `autonomy.md`, `shipping.md`, and `code-review-tooling.md`
load every session.

## What this is
Helm Sports Labs — multi-sport SaaS: BaseballHelm, GolfHelm (+ CoachHelm),
Lift Lab. Next.js App Router, TypeScript strict, Supabase, Tailwind.

## Finding context for a task
    npm run knowledge:map -- --files <paths...>
    npm run knowledge:context -- --files <paths...> --task "<task>"

`memory/registry.yml` routes a path to its feature doc; a governed edit made
without it is DETECTED, not prevented, by the Stop gate.
`docs/CONTROL_PLANE_ENFORCEMENT.md` is the live authority on what's enforced.

## Trusting what you read
Generated artifacts outrank prose: `src/lib/types/database.ts` (regen: `npm
run db:types`) and `AUTOGEN:*` blocks in `memory/` — never hand-edit inside
one. `src/lib/golf/surface-registry.ts` is hand-maintained and canonical.

## Four rules the compiler will not catch
    import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';
    import type { BaseballCoach, BaseballPlayer } from '@/lib/types';
    // Server: await createClient() from '@/lib/supabase/server'
    // Client: createClient() from '@/lib/supabase/client', with 'use client'
    // Tables are sport-prefixed: golf_*, baseball_*, helm_lifting_*.
    // Anything with useState/useEffect/onClick starts with 'use client';

## Commands
    npm run doctor / repo:doctor / dev / typecheck / lint / test / test:all
    npm run build         # required when a 'use server' surface changed
    npm run docs:check    # AUTOGEN inventory + drift + enforcement + rules-current

## How work moves
Door → context → gates → land → retire: `scripts/new-worktree.sh`,
`knowledge:map`/`context`, gates with exit codes, `/land` (never `gh pr
merge`), `worktrees:retire` (never by hand). Commands: `/worktree /context
/gates /status /land /held`. Deploy: `scripts/deploy-prod.sh` only, push
never deploys. Agents: `helm-worker`, `helm-reader`. Loop: `.claude/skills/helm-process/SKILL.md`.
