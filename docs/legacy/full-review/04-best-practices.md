# Phase 4: Best Practices & Standards

**Status:** consolidated from static analysis — full parallel agent run skipped at user direction.

## Framework & language best practices

### High

**H1. 17 admin files still import `motion` directly instead of `m` + `LazyMotion`**
- Surfaced in Phase 2B; deferred to wave-3 due to scope (mechanical sweep across 17 files).
- Marketing + dashboards already migrated this session via Teams A + D.
- `admin/layout.tsx` now wraps children in `<LazyMotion features={domAnimation}>` so once the admin imports flip to `m`, the savings (~30KB gz per admin chunk) land.
- **Recommendation:** wave-3.

**H2. Next.js 16 `'use server'` export rule tripped up once**
- `export const ADMIN_DASHBOARD_CACHE_TAG` broke the production build — `'use server'` files only allow async function exports. Fixed by making it non-exported.
- Pattern-level lesson: any constant needed across server-action files should live in a non-`'use server'` module.
- **Recommendation:** add an ESLint rule via `eslint-plugin-next` or a custom check that catches non-async exports in `'use server'` files before build.

**H3. `unstable_cache` + cookies / request state is a known footgun in Next.js 16**
- Team B's original admin-data.ts violated this; Phase 1A/1B caught it; fixed this session.
- Team D (parallel) correctly removed the same pattern in `dashboard-data.ts` (with a comment explaining why).
- **Recommendation:** add a project lint rule or Husky hook that greps for `createClient` / `cookies` / `auth.getUser` inside `unstable_cache` bodies. Or document in `CLAUDE.md`.

### Medium

**M1. Inline callback props defeat React.memo**
- PlayerHub cards were `React.memo`'d (good), but parent passes `onExpand={() => setSelectedTrip(trip)}` inline (defeats memoization).
- Multiple reviewers flagged this; deferred to wave-3.
- **Recommendation:** either `useCallback` keyed by id, or drop `React.memo` as dead weight. Fixing this is the highest-leverage wave-3 perf item.

**M2. `as any` / `as unknown as` on RPC calls**
- 4 new RPCs not in `database.ts` (types not regenerated locally). All call sites use casts.
- **Recommendation:** run `npm run db:types` locally and commit. Removes the casts and provides compile-time validation.

**M3. Tab-content mount/unmount pattern**
- PlayerHub uses `{activeTab === X && <TabBody />}` — unmounts offscreen tabs.
- Trade-off: saves JS work but loses scroll position, in-flight form state, and animation state.
- **Recommendation:** document the trade-off; consider `display: none` for tabs that own form state. Defer to wave-3.

### Low

**L1. Pre-existing TS6133 unused-import warnings (93+)**
- Background noise throughout the codebase. None introduced by this diff.
- **Recommendation:** periodic cleanup. Not urgent.

## CI/CD & DevOps

### Medium

**M1. No pre-push hook validates migrations**
- `supabase db push` can be run manually; nothing catches a bad migration before it hits prod. This session found 4 real migration bugs (pg_trgm order, max(uuid), is_mandatory, wrong team_id columns) — all would have been caught by a `supabase db diff` against a fresh local instance.
- **Recommendation:** add a CI job that runs `supabase db reset && supabase db push --local` on PRs touching `supabase/migrations/**`.

**M2. Database types not auto-synced**
- `scripts/stamp-sw.mjs` runs as pre-build but `db:types` doesn't. Types drift silently until a migration changes something.
- **Recommendation:** add `db:types:check` to the pre-push Husky hook OR run `db:types` on every `db push`.

**M3. Production pushes have no smoke test**
- After `supabase db push` succeeds, nothing verifies the functions work. This session's smoke test (`scripts/rpc-smoke.mjs`) is a good seed.
- **Recommendation:** wire `rpc-smoke.mjs` into a GitHub Action that runs after `supabase db push` on main.

### Low

**L1. No deployment pipeline for the perf changes**
- 42 commits on `main` ahead of `origin/main` — they need pushing. No CI gate on the push.
- **Recommendation:** this is operational; push when ready.

## Score

- Framework idioms: **7/10** — some motion/cache patterns need cleanup, but the diff is mostly idiomatic Next 16
- CI/CD: **4/10** — no migration pre-check, no prod smoke test, types drift silently
