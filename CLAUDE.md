# CLAUDE.md — Helm Sports Labs

@AGENTS.md
@memory/system/golfhelm-engineering-os.md

Those are real imports and load at session start. **`AGENTS.md` is the repo
constitution and outranks this file**; the Engineering OS is the operating model
everything serves. This file holds only what Claude Code needs and AGENTS does
not already say. When they disagree, AGENTS wins and this file is the one to fix.

**Helm Sports Labs** — BaseballHelm (college baseball recruiting + team
management) and GolfHelm (college golf team management + the CoachHelm AI layer).
Next.js 16 App Router · TypeScript strict · Supabase · Tailwind.

## Where truth lives

The Engineering OS defines the source-of-truth hierarchy; read it there, it is
imported above. The short version: **live state > generated artifacts > code >
`memory/features/` > ledgers > everything else.** Prose loses to tokens, to
generated files, and to the code.

Resolve any file to its feature with `npm run knowledge:map -- --files <paths>`.
Do not hand-write a route to a doc — the registry is the router.

## The four that bite

1. **Types come from `@/lib/types`** — `BaseballCoach`, `GolfCoach`,
   `BaseballPlayer`, `GolfPlayer`. The sport is in the name on purpose; bare
   `Coach`/`Player` no longer exist. `@/types/database` and `@/types/supabase`
   never did.

2. **Two Supabase clients, not one.** Server: `await createClient()` from
   `@/lib/supabase/server`. Client: `createClient()` from
   `@/lib/supabase/client`, in a `'use client'` file.

3. **Table names carry a sport prefix** — `golf_*`, `baseball_*`,
   `helm_lifting_*`. An unprefixed name almost certainly does not exist.
   Check `npm run schema -- <table>` rather than guessing.

4. **`'use client'` on anything using `useState`/`useEffect`/`onClick`.**

## Design authority

`src/styles/design-tokens.css` (the `--fw-*` tokens) → the shipped
`src/components/fairway/**` components → `.claude/rules/design-system.md`, which
is the binding rule and declares the older glass / cream / warm vocabulary
**retired** under `src/app/golf/(dashboard)/`. Tokens beat prose, always.

## Before you submit

Auth checked first in every server action · `revalidatePath()` after mutations ·
no `any`, no `console.log` · tokens not hex · `npm run preflight` for the static
gates. Note that preflight is **not** exactly what CI runs — see
`.claude/rules/quality-gates.md`.

## Scoped rules

`.claude/rules/*.md` load automatically: those with `paths:` frontmatter when you
touch matching files, those without on every session. You do not need to open
them by hand, and this file deliberately no longer indexes them — an index of
files that load themselves is a second place for the list to rot.

<!-- Helm agent canonicality: the binding rules live in AGENTS.md. This marker
     exists only so tooling that greps for it finds it. -->
