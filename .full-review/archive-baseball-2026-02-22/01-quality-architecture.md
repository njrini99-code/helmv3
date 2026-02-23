# Phase 1: Code Quality & Architecture Review

## Code Quality Findings

### Critical

| ID | File | Issue |
|----|------|-------|
| C-1 | coach-onboarding/page.tsx:513 | `handlePlanSelectAndSubmit` uses `setTimeout(() => handleSubmit(), 300)` — creates stale closure race condition. If state changes during the 300ms delay, `handleSubmit` captures old values. |
| C-2 | CompleteSignupClient.tsx:110-157 | Client-side DB writes (`supabase.from('users').upsert(...)`, `baseball_coaches.insert(...)`) bypass server-side validation entirely. Only RLS protects these writes. |
| C-3 | coach-onboarding/page.tsx:437-508 | Client-side `supabase.auth.signUp()` in onboarding bypasses rate limiting, password validation, and account lockout that exists in the server action `signupAction`. |

### High

| ID | File | Issue |
|----|------|-------|
| H-1 | 3 dashboard layouts | ~90% identical code across `(dashboard)/layout.tsx`, `(coach-dashboard)/coach/layout.tsx`, `(player-dashboard)/player/layout.tsx`. Shell rendering is copy-pasted. |
| H-2 | auth.ts, layout.tsx, route.ts, CompleteSignupClient.tsx | Role resolution logic ("is this user a coach or player, have they completed onboarding?") duplicated in 6 locations with subtle differences. |
| H-3 | auth.ts, route.ts, coach-onboarding/page.tsx | Inconsistent redirect destinations across entry points after login/signup. |
| H-4 | signup, login, coach/player onboarding | Animated orb background CSS copy-pasted across 4+ files. |
| H-5 | useOnboardingFlow.ts | 175-line hook is dead code — never imported anywhere. Has different step model and separate localStorage key. |

### Medium

| ID | File | Issue |
|----|------|-------|
| M-1 | signup/page.tsx:11 | `export const dynamic = 'force-dynamic'` in a `'use client'` component — silently ignored by Next.js. |
| M-2 | login/page.tsx:29 | Supabase client recreated every render (not using `useRef`), causing `useEffect` to re-run every render. |
| M-3 | sign-up-form.tsx:77, sign-in-form.tsx:64 | Hardcoded `setTimeout` delays (100-150ms) for cookie propagation — fragile across network conditions. |
| M-4 | CompleteSignupClient.tsx:128,150 | Raw Supabase errors exposed to user (may contain SQL-level details like table/constraint names). |
| M-5 | CompleteSignupClient.tsx:30,49,65,76 | `console.error` in client components — violates CLAUDE.md "no console.log" rule. |
| M-6 | coach-onboarding/page.tsx:310-318 | Email stored in localStorage — privacy concern on shared devices. |
| M-7 | callback/route.ts:138-176 | Redundant sequential DB queries — queries golf_coaches/golf_players twice (once for detection, once for onboarding status). |
| M-8 | player/page.tsx:176-187 | Auth guard checks `user.role !== 'player'` but role may not be set yet after signup, causing redirect to login. |

### Low

| ID | File | Issue |
|----|------|-------|
| L-1 | sign-in-form.tsx, callback/route.ts | Two different `returnTo` validation implementations (should be shared utility). |
| L-2 | coach-onboarding/page.tsx:390 | `Math.random()` for join codes — not cryptographically secure. |
| L-3 | sign-up-form.tsx, auth.ts, coach-onboarding | Password minimum is 6 in onboarding but 8 in signup form; `validatePassword()` in server action may be stricter. |
| L-4 | player/page.tsx:225 | `as unknown as` double-cast on Supabase query bypasses type safety. |
| L-5 | player/page.tsx:149-166 | `useState` initializers read `player` before it loads — fields stay empty if player data arrives after mount. |

---

## Architecture Findings

### Critical

| ID | Impact | Issue |
|----|--------|-------|
| A-1 | System-wide | **Duplicated role-resolution logic in 6 locations.** Any change to how coach/player roles are resolved must be replicated 6 times, guaranteeing drift. Need a single `resolveBaseballUserProfile()` function. |
| A-2 | Security | **Coach onboarding contains its own signup flow** that bypasses all server-side security (rate limiting, password validation, account lockout). Two completely independent signup paths exist. |

### High

| ID | Impact | Issue |
|----|--------|-------|
| A-3 | Maintenance | **Two competing coach onboarding implementations.** `useOnboardingFlow.ts` (dead) vs `coach-onboarding/page.tsx` (active) + a redirect stub at `coach/page.tsx`. |
| A-4 | Security | **Password policy inconsistency.** 6-char minimum in onboarding, 8-char in signup form, structured validation in server action. Users can create weak accounts via onboarding path. |
| A-5 | Consistency | **CompleteSignupClient writes directly to DB from client** — the only place in the auth flow that does this. Violates the server-action pattern. |

### Medium

| ID | Impact | Issue |
|----|--------|-------|
| A-6 | UX | **Potential redirect loop:** dashboard → onboarding → login → dashboard. Occurs when `users.role` is null (not yet set) and player onboarding auth guard redirects to login. |
| A-7 | Data integrity | **`users.role` can be null/out-of-sync.** Set in multiple places with different logic. OAuth callback doesn't set it. `useAuth` hook relies on it for routing decisions. |
| A-8 | Maintainability | **Monolithic onboarding components** (1000+ lines each). Mix form state, API calls, navigation, animations, and sub-components in single files. |
| A-9 | Maintenance | **Three identical dashboard shell components.** Only differences are auth check and mobile nav items. Should be extracted to shared `BaseballDashboardShell`. |
| A-10 | UX | **`handlePlanSelectAndSubmit` uses setTimeout for sequencing.** Fragile coupling between animation timing and business logic. Error shown after "complete" animation starts. |

### Low

| ID | Impact | Issue |
|----|--------|-------|
| A-11 | Performance | Auth callback makes redundant golf profile queries (4 DB calls when 2 would suffice). |
| A-12 | UX | Middleware doesn't protect onboarding routes — unauthenticated users see loading flash before client-side redirect. |
| A-13 | UX | `sessionStorage` for `returnTo` creates cross-tab issues. Invite links opened in new tabs lose the return path. |
| A-14 | Correctness | Dead `export const dynamic` in client component signup page. |

---

## Critical Issues for Phase 2 Context

These findings should inform the security and performance reviews:

1. **Client-side signup in coach onboarding** (C-3, A-2) — no rate limiting, no password validation, no account lockout
2. **Client-side DB writes in CompleteSignupClient** (C-2, A-5) — bypasses server validation, relies solely on RLS
3. **Raw Supabase errors exposed to users** (M-4) — potential information leakage of SQL internals
4. **Email stored in localStorage** (M-6) — privacy concern
5. **`Math.random()` for join codes** (L-2) — predictable values
6. **Password policy inconsistency** (A-4, L-3) — weak passwords possible via onboarding path
7. **Potential redirect loop** (A-6) — users can get stranded between dashboard/onboarding/login
8. **`users.role` reliability** (A-7) — routing decisions based on potentially null/stale data
