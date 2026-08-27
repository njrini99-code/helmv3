# CLAUDE.md — Claude Code adapter

@AGENTS.md

**AGENTS.md is the constitution and outranks this file.** This file holds only
what Claude Code needs on top of it. When the two disagree, AGENTS wins and
this is the file to fix.

Everything else loads when it is relevant. `.claude/rules/*.md` carry `paths:`
frontmatter and attach themselves to the files you touch — you do not need to
find them, and this file does not index them. Three load always
(`autonomy`, `shipping`, `code-review-tooling`); the rest follow your edits.

---

## What this is

**Helm Sports Labs** — multi-sport SaaS. BaseballHelm (recruiting + team
management), GolfHelm (team management + the CoachHelm AI layer), Lift Lab.
Next.js 16 App Router · TypeScript strict · Supabase · Tailwind.

## Finding context for a task

```bash
npm run knowledge:map -- --files <paths...>          # file -> feature
npm run knowledge:context -- --files <paths...> --task "<task>"
```

`memory/registry.yml` routes a path to its feature doc in `memory/features/`.
That corpus is canonical for behavior. A governed edit is blocked until the
session has actually loaded the mapped context.

## Trusting what you read

Generated artifacts outrank prose, always: `src/lib/types/database.ts`,
`src/lib/golf/surface-registry.ts`, and the `AUTOGEN:*` blocks in `memory/`.
Never hand-edit inside an AUTOGEN block. Hand-written narrative is a hint —
verify identifiers before acting. `npm run docs:schema-drift` and
`npm run docs:path-drift` are what make that checkable.

## Four rules the compiler will not catch

```typescript
import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';
import type { BaseballCoach, BaseballPlayer } from '@/lib/types';
// @/types/database and @/types/supabase do not exist.

// Server: await createClient() from '@/lib/supabase/server'
// Client: createClient() from '@/lib/supabase/client', with 'use client'

// Tables are sport-prefixed: golf_*, baseball_*, helm_lifting_*.
// An unprefixed name almost certainly does not exist.

// Anything with useState/useEffect/onClick starts with 'use client';
```

## Commands

```bash
npm run doctor        # env sanity — run FIRST when a supabase or node command fails
npm run repo:doctor   # workspace + control-plane integrity
npm run dev           # localhost:3000
npm run typecheck     # tsc --noEmit
npm run lint          # eslint, --max-warnings 0
npm test              # unit + unit-dom only (the fast loop, not coverage)
npm run test:all      # every vitest project
npm run build         # required when a 'use server' surface changed
npm run docs:check    # regen + both drift gates

./node_modules/.bin/supabase   # repo-local; do not assume a global binary
./node_modules/.bin/vercel
```

## Helm agent canonicality

The binding rules live in AGENTS.md under this same heading. This block exists
so tooling that greps for the marker finds it, and deliberately restates
nothing — a second copy is a second place to rot.
