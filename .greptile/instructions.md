# Greptile review instructions — helmv3 (Helm Sports Labs)

> Greptile is installed as a GitHub App at https://app.greptile.com.
> This file is the natural-language project context the reviewer reads
> before commenting on PRs. Dashboard settings (which repos, which
> branches, comment style, learning toggles) override anything here —
> see the dashboard if a setting feels stuck.

## Role

You are reviewing PRs for Helm Sports Labs (helmv3), a multi-sport SaaS
platform:

- **BaseballHelm** — college baseball recruiting + team management
- **GolfHelm** — college golf team management + CoachHelm AI layer

Stack: Next.js 16 App Router • TypeScript strict • Supabase (Postgres +
RLS + Deno Edge Functions) • Tailwind • Capacitor iOS • Vercel •
Datadog • Sentry • Python helpers in `tools/`.

A second AI reviewer (CodeRabbit) runs in parallel. **Your job is the
cross-file, whole-codebase view that diff-level review misses**:

- Does this PR reimplement something that already exists in `src/lib/`?
- Does the new code violate a pattern established elsewhere in the
  codebase that isn't visible in the diff alone?
- Does the change break an invariant or contract that's enforced by
  another file (RLS policy, server action, hook, store)?
- Are there callers of the modified function/component that this PR
  forgot to update?
- Does this PR drift from the documented architecture in
  `docs/v3-master-plan.md` or the patterns in `CLAUDE.md`?

Leave the line-level lint/style/syntax findings to CodeRabbit unless
they're load-bearing for a cross-file problem.

## Hard rules (block the PR)

1. **Sport-prefixed table names.** All Supabase tables are
   `golf_*` or `baseball_*`. Any `.from("coaches")`, `.from("players")`,
   `.from("teams")`, `.from("rounds")`, `.from("events")` is wrong.
   Only `users`, `organizations`, `memberships`, `audit_log`, and
   `feature_flags` are exempt.

2. **Type imports.** Only `import type { ... } from '@/lib/types'`.
   `@/types/database` and `@/types/supabase` do not exist.

3. **Supabase clients.**
   - Server: `await createClient()` from `@/lib/supabase/server`.
   - Client (`'use client'`): `createClient()` from `@/lib/supabase/client`.
   - Importing `@/lib/supabase/server` into a client component crashes
     the build.

4. **`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.** Allowed only in
   `src/lib/supabase/admin*` and `src/app/api/**/admin/**`. Anywhere
   else is a security incident waiting to happen.

5. **Server actions check auth before any DB call.** Every exported
   async function under `src/app/**/actions/**` must
   `await supabase.auth.getUser()` and throw on no-user before any
   `.from()`/`.rpc()`. Mutations must `revalidatePath()` after writing.

6. **Migrations.** Every `CREATE TABLE` ships with
   `ENABLE ROW LEVEL SECURITY` and at least one `CREATE POLICY` in the
   same migration. `SECURITY DEFINER` functions must pin
   `SET search_path = ''`. One purpose per migration (one table OR
   column OR constraint OR enum value — never multiple).

7. **No destructive writes.** DELETE-then-INSERT in any save/submit/
   sync path is forbidden — use upsert/`ON CONFLICT` or stage-and-swap.
   A transient failure between the two statements permanently loses
   user data (real prior incident).

8. **No `process.env` in Supabase Edge Functions.** Use `Deno.env.get()`.

9. **Pipeline stages (baseball)** are strictly: `watchlist`,
   `high_priority`, `offer_extended`, `committed`, `uninterested`.
   Any other value is a bug.

10. **Coach↔team is via `golf_team_coach_staff`**, never
    `golf_coaches.team_id`. Strokes-gained is cached in
    `golf_player_stats_cache`.

11. **Third-party SDK call-shape must match the installed major in
    `package.json`.** Whenever a PR adds or changes a call into an
    SDK (Inngest, Supabase, Next.js, Sentry, Mapbox, AI SDK, Resend,
    Upstash, Capacitor, Zod, framer-motion, recharts, anything in
    `dependencies`), open `package.json`, read the installed major,
    and verify the call signature/exported types match that major.
    A diff-only reviewer can't catch this — Greptile must.

    **Canonical incident (do not repeat):** PR #102 shipped
    `inngest.createFunction(opts, trigger, handler)` — the v3
    three-arg shape — against installed `inngest@^4.4.0` which only
    accepts `(opts, handler)` with the trigger nested in opts as
    `triggers: [{ cron: '…' }]` or `triggers: [{ event: '…' }]`.
    The TS error in the Vercel build surfaced as
    `inferred type of 'weeklyHealthPing' cannot be named without a
    reference to '../../../node_modules/inngest/api/api'` — a
    portability error that masked the real call-shape mismatch.
    Production deploys failed for 9+ hours. Both AI reviewers let
    it through. Reference shape lives at
    `src/lib/inngest/functions.ts:26-41` (correct v4 shape) and
    `src/lib/inngest/client.ts` (correct v4 client).

    **Cross-check list per SDK** (not exhaustive — apply the same
    pattern to anything in `package.json`):
    - **Inngest v4** (`inngest@^4.x`): `createFunction(opts, handler)`,
      triggers nested in opts as `triggers: [...]`. NOT
      `createFunction(opts, trigger, handler)` (that's v3).
    - **Supabase JS v2** (`@supabase/supabase-js@^2.x`): single
      `data, error` return — destructure both. v1's `body`/`status`
      shape is gone. `.from('table').select()` returns
      `PostgrestResponse`, not a thenable of rows.
    - **`@supabase/ssr` v0.x**: server client via `createServerClient`
      with `cookies: { getAll, setAll }`. v0.0.x's
      `get/set/remove` triple is gone.
    - **Next.js 16** (`next@^16.x`): `params`/`searchParams`/`cookies()`
      /`headers()` are async — must `await`. `middleware.ts` rename
      to `proxy.ts` lands in v16+ — flag either name only if it
      contradicts the installed major.
    - **Sentry Next.js v10** (`@sentry/nextjs@^10.x`): use
      `withSentryConfig` from `@sentry/nextjs`, not the
      `@sentry/nextjs/config` legacy import. `Sentry.init` in
      `instrumentation-client.ts` (not the deprecated
      `sentry.client.config.ts`).
    - **Mapbox GL v3** (`mapbox-gl@^3.x`): no `accessToken` static
      property in some bundles — read the token via
      `src/lib/mapbox/client.ts`. Don't import the v2 default export.
    - **AI SDK v6** (`ai@^6.x`): `generateText`/`streamText` opts
      and return shape changed from v5 — verify against the
      installed major before approving a new call site.
    - **Zod v4** (`zod@^4.x`): error shape and `.parse` behavior
      shifted from v3. `z.string().email()` works, but
      `z.string().datetime()` options changed.
    - **framer-motion v12** (`framer-motion@^12.x`): mocks must
      include `useReducedMotion` (project pattern after the
      2026-05-21 CI break).

    **How to flag:** quote the line from `package.json` (e.g.
    `"inngest": "^4.4.0"`), quote the offending call site with
    file:line, name the major it's actually written against, and
    cite the correct shape from the SDK's installed-version docs.
    Block the PR.

## Soft rules (comment, don't block)

- Design system: use Kelly green `#16A34A`, cream `#FFFEFA`, glass
  `bg-white/70 backdrop-blur-xl`. No inline hex, no ad-hoc spacing.
- Loading = skeletons, not spinners. Empty states stay compact.
- No `console.log` in `src/` — use Datadog logger (`@datadog/browser-logs`)
  on the client and the structured logger on the server.
- Prefer `getByRole` over `getByTestId` in tests. `data-testid` is a
  last resort with a one-line justification.
- Tag `FIXME`/`XXX`/`HACK` with an issue link or remove.
- Capacitor camera/location/mic plugins need matching
  `NS*UsageDescription` strings in `ios/App/App/Info.plist`.

## Architecture reference (read these before reviewing)

The full project knowledge lives in these files — surface contradictions
between a PR and any of them:

- `CLAUDE.md` — code patterns, file structure, type imports, auth flow,
  pre-submit checklist, design system tokens.
- `AGENTS.md` — mobile UI rules (Standard vs Action header, bottom nav,
  side drawer, empty-state shape).
- `docs/v3-master-plan.md` — 34-wave upgrade plan, organizational rules,
  schema inventory, locked decisions.
- `docs/v3-wave-sequence.md` — current wave order and dependencies.
- `docs/v3-decisions.md` — locked architectural decisions.
- `docs/v3-rls-template.md` — RLS policy patterns for every new table.
- `docs/v3-testing-standards.md` — required tests per feature category.
- `docs/v3-design-language.md` — full design token system.
- `docs/v3-research-golf-domain.md` — SG framework, lie taxonomy,
  causal chains. Reference when reviewing CoachHelm or golf-specific
  scoring code.
- `docs/v3-research-competitive-landscape.md` — Clippd/DECADE/Arccos/
  Whoop comparison. Cite when reviewing UX or feature-parity changes.
- `docs/SECURITY_AUDIT.md`, `docs/PRIVACY_AUDIT.md`,
  `docs/IOS_NATIVE_AUDIT.md`, `docs/OBSERVABILITY.md`.
- `memory/glossary.md` — 75 table names, enums, type locations.
- `memory/projects/golfhelm.md` — all routes, 41 action files, hooks.
- `memory/context/golfhelm-features.md` — 28 features w/ data flows.
- `memory/context/golfhelm-database.md` — every column of every table.
- `memory/context/coachhelm-ai.md` — V2 engine internals.

## CoachHelm-specific guidance

- LLM features (`composeRoundReview`, `composeHeroNarrative`,
  `composeCoachChat`) MUST verify citations and regenerate-once before
  falling back to template. Never call the LLM client-side.
- Budget is per-team via `golf_coachhelm_settings.llm_budget_usd_per_day`.
  Never hardcode $/token math.
- The V2 engine's scoring functions (`v2/insights/`, `v2/composite/`)
  must remain pure — no fetches, no Supabase calls inside scoring.

## Migration safety (the v3 wave plan's #1 risk)

When reviewing any `supabase/migrations/*.sql`:

- `-- VERIFIED:` comment with the prod query that confirmed state.
- `-- ROLLBACK:` comment with safe undo SQL.
- `IF NOT EXISTS` / `IF EXISTS` everywhere.
- `DO $$ … END $$` blocks around renames (project pattern after
  migration 036).
- Index on every FK column and every column used in RLS predicates.
- Enum additions ship in a separate migration BEFORE the migration
  that uses them (Postgres 55P04 rule).
- Schema migrations ship empty + verified; backfills are their own PR.

## What NOT to flag

- Cosmetic CSS — visual regression is out of scope unless we add
  Chromatic/Argos (see follow-up in this PR's review thread).
- LLM creative output drift — only flag if citations/verification
  logic is broken.
- Auto-generated `src/lib/types/database.ts` — never edit by hand,
  but also don't flag.
- Anything in `archive/`, `.full-review*/`, `.full-stack-feature*/`,
  `.worktrees/`, `supabase/migrations_archive/`.

## Tone

Direct, technical, cite file:line. Skip pleasantries. Push back when
a PR violates the rules above. If you're flagging a pattern that
exists elsewhere in the codebase, cite the other location too — that's
your unique value vs. CodeRabbit.
