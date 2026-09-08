<!-- markdownlint-disable MD022 MD012 -->
# CLAUDE.md — Claude Code adapter
@AGENTS.md

AGENTS.md owns operating policy. This file adds technical context only.
Use path-scoped rules for the files you are changing.

## What this is
Helm Sports Labs — multi-sport SaaS: BaseballHelm, GolfHelm (+ CoachHelm),
Lift Lab. Next.js App Router, TypeScript strict, Supabase, Tailwind.

## Finding context for a task
    npm run knowledge:map -- --files <paths...>
    npm run knowledge:context -- --files <paths...> --task "<task>"

`memory/registry.yml` routes a path to its feature doc. Context gaps are
DETECTED, not prevented, by diagnostic tools; Stop reminders never require
another full gate pass. `docs/CONTROL_PLANE_ENFORCEMENT.md` lists actual wiring.

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
Follow AGENTS.md. Use `/worktree`, `/context`, `/gates`, `/status`, and
`/land` when they help the task. `helm-reader` inspects using inherited tools;
`helm-worker` implements within the authorization of its assigned task.
