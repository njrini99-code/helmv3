# Combined Agent Findings and Systematic Remediation Plan

This plan synthesizes all five agent reports captured in `AGENT1_SECURITY_REPORT.md` and converts them into a single, staged remediation strategy. It is designed to resolve launch blockers first, then stabilize functionality, performance, UX/accessibility, and code health.

## Context Summary (Condensed)

### Security and Data Isolation (Agent 1)
- Critical risk of cross-tenant messaging due to a SECURITY DEFINER RPC and permissive RLS.
- Unauthenticated write access to `putt_details` via `/api/golf/putts`.
- RLS was disabled in dev migrations; production state must be verified.

### Core Functionality (Agent 2)
- Auth and CRUD flows are solid.
- Gaps: onboarding routes commented out in middleware, limited Zod validation coverage, missing `loading.tsx` in many routes.

### Performance and Database (Agent 3)
- Large unoptimized logo assets (~4MB total) in `/public`.
- Heavy unused dependencies; no lazy loading for charts.
- Missing pagination in some queries and recommended indexes.

### UX, Accessibility, and Deployment (Agent 4)
- Legal/compliance launch blockers: missing `/privacy`, `/terms`, and account deletion.
- A11y gaps: hundreds of icon buttons missing aria-labels and labels missing htmlFor.
- No CI/CD workflow, no health endpoint.
- Hardcoded timezone in calendar feed.

### Dead Code Elimination (Agent 5)
- Many unused dependencies and UI components.
- Unused variables and @ts-nocheck usages.

## Current Verification (Local)
- No `/privacy` or `/terms` routes found in `src/app`.
- No `.github/workflows` present.
- Large logo assets confirmed in `/public`.
- Unused dependencies still in `package.json` (gsap, three, etc.).

## Strategy Principles
1. Fix launch blockers first (security + legal).
2. Protect data boundaries in the database, then enforce in API and UI.
3. Ship high-impact performance wins early (logo compression, unused deps).
4. Improve accessibility and deployment hygiene before public launch.
5. Avoid large refactors until critical safety, compliance, and stability are in place.

## Systematic Remediation Plan

### Phase 0: Baseline and Safety Checks (Prerequisite)
Goal: Establish current production/staging security state and prevent accidental regressions.

Tasks:
- Run SQL checks in Supabase to confirm RLS enabled on all tenant tables.
- Validate existence and schema for `putt_details` and confirm RLS/policies.
- Verify whether dev-only RLS disable migrations ever ran in production.
- Capture a short baseline report: RLS status, policies per table, and high-risk tables.

Deliverables:
- RLS status report (tables + policies).
- Decision on whether new corrective migrations are required.

Validation:
- SQL checks from Agent 1 executed and archived.

### Phase 1: Launch Blockers (Security + Legal)
Goal: Remove all launch-blocking risks.

Security fixes:
- Lock down `create_conversation_with_participants` RPC to enforce same team/org membership.
- Replace permissive `conversation_participants` insert policy with tenant-scoped checks.
- Require auth in `/api/golf/putts` and validate shot ownership before upsert.
- Create a proper `putt_details` migration with RLS and tenant-scoped policies.
- Remove or guard any dev-only migrations that disable RLS from production usage.

Legal/compliance fixes:
- Add `/privacy` and `/terms` pages.
- Add `/api/account/delete` endpoint and ensure it uses server-only credentials.
- Add a minimal account deletion UI entry point (dashboard settings or profile page).

Deliverables:
- Updated DB policies and RPC code (security).
- Legal pages and account deletion endpoint (compliance).

Validation:
- Cross-tenant tests for messaging and golf putts (two org accounts).
- Unauthenticated `putt_details` write returns 401.
- `/privacy` and `/terms` pages accessible and linked.
- Account deletion test in staging (user removed from auth and related tables).

### Phase 2: Core Stability and Form Integrity
Goal: Reduce UX regressions and improve reliability in common flows.

Tasks:
- Re-enable onboarding route protection in middleware.
- Extend Zod validation to all server actions (beyond auth/profile forms).
- Add missing `loading.tsx` in high-traffic dashboards to prevent blank states.
- Standardize toast usage (choose custom toast or Sonner, not both).

Deliverables:
- Consistent validation across server actions.
- Improved loading and error feedback.

Validation:
- `npm run typecheck`, `npm run lint`.
- Manual smoke test: login, onboarding, core dashboard flows.

### Phase 3: Performance and Database Optimization
Goal: Reduce load times and improve responsiveness.

Tasks:
- Compress logo assets and/or convert to SVG; replace large PNGs.
- Replace remaining `<img>` tags for avatars with `next/image`.
- Remove unused dependencies from `package.json`.
- Lazy-load Recharts components.
- Add pagination to large queries (`use-colleges.ts`).
- Apply recommended database indexes from Agent 3.
- Consider React Query for caching (optional but recommended).

Deliverables:
- Smaller bundle size and optimized assets.
- Indexed DB tables for key queries.

Validation:
- `npm run analyze` for bundle size.
- `find public/ -type f -size +100k` should be clean for logos.
- Recheck largest JS chunks.

### Phase 4: UX, Accessibility, and Observability
Goal: Meet accessibility standards and establish baseline operational readiness.

Tasks:
- Add aria-labels to icon-only buttons.
- Associate labels with inputs (`htmlFor` + `id`).
- Increase touch target sizes where below 44px.
- Audit color contrast for text/placeholder styles.
- Add `/api/health` endpoint.
- Add GitHub Actions CI workflow.
- Fix hardcoded timezone handling; adopt `date-fns-tz` for user-facing dates.

Deliverables:
- A11y compliance improvements.
- CI pipeline and health endpoint.

Validation:
- Run lighthouse or axe scan on core pages.
- CI workflow runs typecheck/lint/build on PR.

### Phase 5: Cleanup and Maintenance (Post-Launch)
Goal: Reduce technical debt without destabilizing core features.

Tasks:
- Remove unused UI components.
- Fix unused variables and remove @ts-nocheck where feasible.
- Remove commented console logs.
- Address TODO items in critical paths.

Deliverables:
- Cleaner codebase and smaller bundle.

Validation:
- `npm run lint` after cleanup.
- Targeted smoke tests on messaging, calendar, and documents.

## Testing and Verification Matrix

Security:
- Two-org cross-tenant access tests (messaging, golf putts, calendar feeds).
- RLS policy audit (SQL output saved).

Compliance:
- Manual review of `/privacy` and `/terms` content by legal.
- Account deletion flow verified in staging.

Performance:
- Bundle analysis with `npm run analyze`.
- Public asset size check.

Quality:
- `npm run typecheck`, `npm run lint`, `npm run build`.
- E2E tests (`npm run test:e2e`) after critical phases.

## Risks and Mitigations
- Risk: RLS changes could break existing flows.
  Mitigation: apply in staging first; add explicit integration tests per table.
- Risk: Account deletion requires elevated Supabase admin access.
  Mitigation: restrict to server-only env vars and strict auth checks.
- Risk: Removal of unused deps/components may break hidden usage.
  Mitigation: run `npx depcheck` and targeted smoke tests.

## Recommended Execution Order (High-Level)
1. Phase 0 (Baseline and safety checks)
2. Phase 1 (Security + Legal launch blockers)
3. Phase 2 (Core stability and validation)
4. Phase 3 (Performance and DB optimizations)
5. Phase 4 (UX, accessibility, observability, CI)
6. Phase 5 (Cleanup and debt reduction)

---

If you want, I can convert this plan into a tracked checklist (tasks with owners, estimates, and PR grouping) before we implement any changes.
