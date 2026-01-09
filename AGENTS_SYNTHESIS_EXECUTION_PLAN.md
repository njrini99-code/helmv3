# Comprehensive Remediation Program (All 5 Agents)

## Purpose
Systematically resolve all findings from Agents 1–5 with a staged, risk‑first execution plan. This document is a detailed checklist with owners, estimates, dependencies, and validation gates. No changes should be made until Phase 0 is complete.

## Sources
- `AGENT1_SECURITY_REPORT.md` (contains Agents 1–5 reports)
- Local repo checks performed for legal/CI gaps, logo sizes, and unused deps

## Critical Constraints
- Do not ship until Phase 1 is complete (security + legal blockers).
- All security changes must be verified in staging before production.
- Legal content must be reviewed/approved by legal or owner.

## Assumptions (Validate Before Starting)
- Supabase production access is available for RLS verification.
- Tenancy model: users belong to org/team; cross‑org access is forbidden.
- Messaging is intended to be restricted within a team or organization unless explicitly allowed.
- Service role credentials are available for account deletion (server‑only).

## Required Inputs / Access
- Supabase SQL editor access (prod + staging).
- Knowledge of org/team schema for baseball and golf.
- Legal copy for Privacy Policy and Terms of Service.
- Domain/hosting details for public legal links.

## Known Missing Items (Verified Locally)
- No `/privacy` or `/terms` pages in `src/app`.
- No `.github/workflows` CI pipeline.
- Large logo assets in `/public`:
  - `public/Helm-Logo-New-Main.png` (1.4MB)
  - `public/helm-baseball-logo.png` (1.1MB)
  - `public/helm-golf-logo.png` (1.0MB)
  - `public/helm-main-logo-transparent-white-trim.png` (237KB)
- Unused deps listed in `package.json` (gsap/three/etc.).
- `src/lib/supabase/middleware.ts` is the only middleware file in repo (no root `middleware.ts`).

---

# Phase 0: Baseline & Risk Containment (Required Before Any Fixes)

**Goal:** Establish the true security state of the database and confirm data isolation boundaries.

**Owner:** Security + Backend

**Entry Criteria:** None

**Tasks:**
- [ ] Run RLS status check in Supabase (prod and staging):
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
  ```
- [ ] Export existing policies:
  ```sql
  SELECT * FROM pg_policies WHERE schemaname = 'public';
  ```
- [ ] Confirm whether `061_disable_golf_rls.sql` or `076_disable_conversation_participants_rls.sql` were applied in prod.
- [ ] Identify tenant scoping keys per table (team_id, organization_id, school_id).
- [ ] Verify existence and schema of `putt_details` (table and policies).
- [ ] Document current messaging policies and whether cross‑team messages are allowed by product.

**Deliverables:**
- RLS audit report (tables + policies).
- Tenancy key map per table.
- Decision note for messaging cross‑team scope.

**Exit Criteria:**
- RLS status confirmed for all tenant tables.
- High‑risk tables identified with scope keys.

---

# Phase 1: Launch Blockers (Security + Legal)

## 1A. Security Data Isolation (Critical)

**Goal:** Eliminate cross‑tenant access paths and unauthenticated writes.

**Owner:** Security + Backend

**Tasks:**
- [ ] Lock down `create_conversation_with_participants` RPC:
  - [ ] Enforce that all participants share the same org/team as `auth.uid()`.
  - [ ] Return error on mismatched org/team.
  - [ ] Add `SET search_path = public` if not already set.
- [ ] Update `conversation_participants` policies:
  - [ ] Remove any `WITH CHECK (true)` policies.
  - [ ] Restrict inserts/reads/updates to same team/org membership.
- [ ] Update messaging server actions to pass required tenant context (if needed).
- [ ] Secure `/api/golf/putts`:
  - [ ] Require `auth.getUser()`.
  - [ ] Validate that `shot_id` belongs to the authenticated player (join to `golf_shots` -> `golf_rounds` -> `golf_players`).
  - [ ] Return 401/403 on invalid ownership.
- [ ] Create `putt_details` migration:
  - [ ] Define schema (FK to `golf_shots`).
  - [ ] Enable RLS with tenant‑scoped policies.
  - [ ] Add indexes on `shot_id`.
- [ ] Add security tests for cross‑tenant messaging and golf putts.

**Deliverables:**
- New migration(s) for messaging policies and `putt_details` RLS.
- Hardened `/api/golf/putts` route.
- Security test cases documented.

**Exit Criteria:**
- Cross‑tenant messaging attempt fails.
- Unauthenticated and cross‑user putt write attempts fail.
- RLS enabled and scoped for all golf and messaging tables.

## 1B. Legal/Compliance (Critical)

**Goal:** Establish compliance pages and account deletion support.

**Owner:** Legal + Frontend + Backend

**Tasks:**
- [ ] Create `/privacy` page with approved policy.
- [ ] Create `/terms` page with approved terms.
- [ ] Add account deletion endpoint:
  - [ ] Server‑only Supabase admin key.
  - [ ] Authenticated user only.
  - [ ] Delete auth user and dependent records.
- [ ] Add UI link to Privacy/Terms (footer and/or settings).
- [ ] Add account deletion entry point in user settings.

**Deliverables:**
- `src/app/(legal)/privacy/page.tsx`
- `src/app/(legal)/terms/page.tsx`
- `src/app/api/account/delete/route.ts`

**Exit Criteria:**
- Legal pages live and linked in UI.
- Account deletion works in staging for a test user.

---

# Phase 2: Core Stability & Validation

**Goal:** Improve core flows, validation, and loading behavior.

**Owner:** Backend + Frontend

**Tasks:**
- [ ] Re‑enable onboarding route handling in `src/lib/supabase/middleware.ts` (ensure correct protection and redirects).
- [ ] Extend Zod validation to all server actions:
  - [ ] Build/extend schemas in `src/lib/validation/action-schemas.ts`.
  - [ ] Validate all inputs server‑side before DB writes.
- [ ] Add `loading.tsx` to high‑traffic dashboard routes:
  - [ ] Inventory all `/dashboard/**` routes missing `loading.tsx`.
  - [ ] Add skeleton UI for data-heavy pages.
- [ ] Standardize toast/notification library across app.

**Deliverables:**
- Updated validation coverage.
- Loading UI coverage increased to target 80%+ of routes.

**Exit Criteria:**
- Typecheck + lint clean.
- Manual smoke test: auth, onboarding, core dashboards.

---

# Phase 3: Performance & Database Optimization

**Goal:** Reduce bundle size and improve load performance.

**Owner:** Frontend + Backend

**Tasks:**
- [ ] Optimize logo assets:
  - [ ] Convert to SVG where possible.
  - [ ] Compress large PNGs to <50KB where SVG not possible.
  - [ ] Update references in components.
- [ ] Replace `<img>` with `next/image` for avatars.
- [ ] Remove unused dependencies after running `npx depcheck`.
- [ ] Lazy-load Recharts components with dynamic imports.
- [ ] Add pagination for large datasets (e.g., `use-colleges.ts`).
- [ ] Add DB indexes per Agent 3 recommendations (new migration).
- [ ] Optional: introduce React Query for caching.

**Deliverables:**
- Smaller JS bundles and public assets.
- Performance‑focused DB migration.

**Exit Criteria:**
- `npm run analyze` shows reduced bundle size.
- Largest logo files removed or minimized.

---

# Phase 4: UX, Accessibility, Observability, CI

**Goal:** Reach acceptable a11y and operational readiness.

**Owner:** Frontend + DevOps

**Tasks:**
- [ ] Add aria‑labels to icon‑only buttons.
- [ ] Fix label associations (add `htmlFor` + `id`).
- [ ] Increase touch targets below 44px.
- [ ] Audit color contrast (manual + automated where possible).
- [ ] Add `/api/health` endpoint.
- [ ] Create GitHub Actions CI pipeline for lint/typecheck/build.
- [ ] Fix hardcoded timezone in `src/lib/calendar/ical.ts` and add `date-fns-tz`.

**Deliverables:**
- CI workflow in `.github/workflows/ci.yml`.
- A11y improvements across core flows.

**Exit Criteria:**
- CI runs successfully on PR.
- A11y spot‑checks pass on core pages.

---

# Phase 5: Cleanup & Tech Debt (Post‑Launch)

**Goal:** Reduce maintenance burden and improve code quality.

**Owner:** Frontend + Backend

**Tasks:**
- [ ] Remove unused UI components (28 listed in Agent 5 report).
- [ ] Fix unused variables (lint warnings).
- [ ] Remove `@ts-nocheck` in two files after fixing type issues.
- [ ] Remove commented console logs and TODOs where feasible.

**Deliverables:**
- Reduced codebase size and lower lint noise.

**Exit Criteria:**
- `npm run lint` clean.

---

# PR Grouping Strategy (Suggested)

1. **PR-01: Security Baseline Docs**
   - Add RLS audit scripts and baseline documentation (no code changes).

2. **PR-02: Messaging Isolation + RLS Fix**
   - RPC restrictions + RLS policy changes.

3. **PR-03: Golf Putts Auth + putt_details Migration**
   - API auth + new table policies.

4. **PR-04: Legal + Account Deletion**
   - `/privacy`, `/terms`, delete endpoint, UI links.

5. **PR-05: Core Validation + Loading States**
   - Zod coverage + `loading.tsx` additions.

6. **PR-06: Performance Quick Wins**
   - Logo compression + remove unused deps + `next/image` updates.

7. **PR-07: A11y + CI + Health Endpoint**
   - aria-labels + label associations + CI + `/api/health`.

8. **PR-08: Cleanup**
   - Remove unused UI components + lint fixes.

---

# Testing Matrix

**Security:**
- Cross‑tenant messaging attempt returns 403.
- `putt_details` cannot be written by unauthenticated or non‑owner user.
- RLS enabled on all tenant tables.

**Legal:**
- `/privacy` and `/terms` accessible without auth.
- Account deletion removes auth user and related records.

**Performance:**
- Largest public assets <100KB.
- Bundle size reduced after removing unused deps.

**Quality:**
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Core flows smoke tested.

---

# Risks & Mitigations

- **Risk:** RLS changes break existing workflows.
  - Mitigation: Stage in staging environment first; add targeted tests.

- **Risk:** Account deletion requires privileged keys.
  - Mitigation: Use server‑only env vars and strict auth checks.

- **Risk:** Removing deps may break hidden imports.
  - Mitigation: Run `npx depcheck` and search usages before removal.

---

# Open Questions (Blockers to Resolve)

1. Are cross‑team conversations ever allowed by product design?
2. What is the authoritative tenant key for each domain (team_id vs org_id)?
3. Who owns legal copy approval for privacy/terms?
4. Should account deletion be immediate or scheduled (cool‑down period)?
5. Which environment is used for staging validation?

---

# Next Step (No Actions Yet)

Confirm the answers to the open questions and approve the Phase 0 baseline checklist. Once approved, implementation can begin in Phase 1 with PR‑02.
