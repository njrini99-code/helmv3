# Review Scope

## Target

Performance remediation diff: **commits 850632e7..HEAD** (38 commits, 57 files, +6,476 / −1,343 lines). Work executed by 5 parallel agent teams per plan at `docs/superpowers/plans/2026-04-21-perf-remediation.md`, following the 2026-04-21 audit at `docs/perf-audit/00-morning-report.md`.

## Context

Pre-existing audit identified 33 P0 issues across 8 routes. This diff implements Waves 1 + 2 of the remediation plan — quick wins and targeted refactors. Wave 3 (structural) is explicitly out of scope. Pages impacted:

- Marketing: `/`, `/about`, `/products`
- Auth: `/golf/login`
- Admin: `/golf/admin`
- CRM: `/golf/admin/crm`
- Dashboards: `/golf/dashboard` (coach), `/golf/dashboard/hub` (player)

## Files

New files:
- `src/hooks/useVisibilityAwareInterval.ts`
- `supabase/migrations/20260421000001_admin_dashboard_rollup.sql`
- `supabase/migrations/20260421000002_crm_perf_indexes.sql`
- `supabase/migrations/20260421000003_dashboard_rpcs.sql`
- `docs/perf-audit/00-morning-report.md` + 8 per-route reports
- `docs/superpowers/plans/2026-04-21-perf-remediation.md`

Major modifications (from `git diff --stat`):
- `src/components/landing/Hero.tsx`, `Navigation.tsx`, `MobileNav.tsx`
- `src/components/products/HelmFlipAnimation.tsx` + `.module.css`, `GolfHelmSection.tsx`, `BaseballHelmSection.tsx`
- `src/app/page.tsx`, `/about/page.tsx`, `/products/page.tsx`
- `src/app/golf/(auth)/login/page.tsx`
- `src/components/golf/scenes/CoastalScene.tsx`, `CourseScene.tsx`
- `src/hooks/use-media-query.ts`
- `src/app/golf/admin/page.tsx`, `src/app/golf/admin/components/**`
- `src/app/golf/actions/admin-data.ts`
- `src/app/golf/admin/crm/page.tsx`, `src/app/golf/admin/crm/components/**` (including new Resend subtree)
- `src/app/golf/(dashboard)/dashboard/page.tsx`, `/hub/page.tsx`
- `src/app/golf/actions/dashboard-data.ts`, `player-notifications.ts`
- `src/components/golf/dashboard/**`, `src/components/golf/player-hub/PlayerHub.tsx`
- `public/hero-golf.jpg` (resized 6720×4480/3.4MB → 2560×1707/1.05MB)

## Flags

- Security Focus: no
- Performance Critical: **yes** (purpose of the diff)
- Strict Mode: no
- Framework: Next.js 16 App Router, React 19, Supabase, Tailwind

## Review Phases

1. Code Quality & Architecture (parallel: code-reviewer + architect-review)
2. Security & Performance (parallel: security-auditor + general-purpose perf engineer)
3. Testing & Documentation (parallel: two general-purpose agents)
4. Best Practices & Standards (parallel: two general-purpose agents)
5. Consolidated Report

## Review Focus Areas

Highest-risk spots specific to this diff:

1. **New Supabase RPCs** (3 migration files) — SECURITY DEFINER, search_path set, but must verify RLS respected. Any auth-bypass holes?
2. **`use cache` + `revalidateTag`** on admin-data.ts — Next.js 16 semantics. Is invalidation wired correctly on writes?
3. **Narrowed CRM SELECT** — did we drop a column someone's code still depends on?
4. **PlayerHub card memoization** — inline callbacks to memoized children; do comparators hold?
5. **LazyMotion sweep** — are all `motion` imports now `m` + wrapped in LazyMotion?
6. **PlayerHub tab unmounting** — does unmounting offscreen tabs lose scroll position / form state?
7. **Parallel-team git history** — 38 commits interleaved across 5 teams; are there any accidental cross-zone changes?
