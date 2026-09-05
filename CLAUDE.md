<!-- markdownlint-disable MD022 MD012 -->
# CLAUDE.md — Claude Code adapter
@AGENTS.md

AGENTS.md is the constitution and outranks this file. This file holds only
what Claude Code needs on top of it. `.claude/rules/*.md` attach by path;
`autonomy.md`, `shipping.md`, and `code-review-tooling.md` load every
session.

## What this is
Helm Sports Labs — multi-sport SaaS: BaseballHelm (recruiting + team
management), GolfHelm (team management + CoachHelm), Lift Lab. Next.js App
Router, TypeScript strict, Supabase, Tailwind.

## Finding context for a task
    npm run knowledge:map -- --files <paths...>
    npm run knowledge:context -- --files <paths...> --task "<task>"

`memory/registry.yml` routes a path to its feature doc in `memory/features/`.
A governed edit made without the mapped context is DETECTED, not prevented
— the Stop gate reports it after the fact. Load context because the work
needs it. `docs/CONTROL_PLANE_ENFORCEMENT.md` is the live authority on what
is actually enforced anywhere in this repo.

## Trusting what you read
Generated artifacts outrank prose: `src/lib/types/database.ts` (regen:
`npm run db:types`) and `AUTOGEN:*` blocks in `memory/`. Never hand-edit
inside an AUTOGEN block.

`src/lib/golf/surface-registry.ts` is hand-maintained and canonical for
every golf surface name and href — nothing generates it; edit it directly.

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
