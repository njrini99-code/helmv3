# Phase 2: Security & Performance Review

## Security Findings

### Critical

| ID | CVSS | CWE | File | Issue |
|----|------|-----|------|-------|
| S-1 | 8.1 | CWE-602 | coach-onboarding/page.tsx:437-508 | **Client-side signup bypasses all server-side security.** `supabase.auth.signUp()` called from browser — no rate limiting, no password validation, no account lockout. Attacker can automate unlimited account creation. |
| S-2 | 7.5 | CWE-330 | coach-onboarding/page.tsx:390 | **`Math.random()` for join codes.** Only ~31 bits of entropy from a predictable PRNG. Join codes are brute-forceable. |

### High

| ID | CVSS | CWE | File | Issue |
|----|------|-----|------|-------|
| S-3 | 7.1 | CWE-284 | CompleteSignupClient.tsx:110-157, coach-onboarding/page.tsx:342-418 | **Client-side DB writes without server validation.** Direct inserts into `users`, `organizations`, `baseball_coaches`, `baseball_teams` from browser. User can set own role, create orgs with injected data. |
| S-4 | 5.3 | CWE-209 | CompleteSignupClient.tsx:128,150; coach-onboarding/page.tsx:364,385,483 | **Raw Supabase errors exposed to users.** May leak table names, column names, constraint details. |
| S-5 | 6.5 | CWE-521 | coach-onboarding:786-793, sign-up-form:47, auth.ts:253 | **Password policy inconsistency.** 6-char in onboarding, 8-char in signup, full validation in server action. Weakest link via onboarding path. |
| S-6 | 4.3 | CWE-922 | coach-onboarding/page.tsx:310-318 | **Email stored in localStorage.** Accessible to XSS, browser extensions, shared computers. Persists indefinitely. |

### Medium

| ID | CVSS | CWE | File | Issue |
|----|------|-----|------|-------|
| S-7 | 4.7 | CWE-601 | coach-onboarding:409-416, player/page.tsx:284-291 | **Unvalidated `returnTo` from sessionStorage.** No validation applied unlike login form. XSS or extension could plant arbitrary URL. |
| S-8 | 5.3 | CWE-799 | rate-limit.ts:21 | **In-memory rate limiting ineffective in serverless.** Each cold start resets the store. No bounds on Map size — memory leak under distributed attack. |
| S-9 | 4.3 | CWE-754 | auth.ts:192-218, layout.tsx:149-176 | **Null role causes unpredictable routing.** When `users.role` is null and no profile exists, `resolvedRole` is null. User sent to dashboard with no profile. |
| S-10 | 3.7 | CWE-209 | auth.ts:324-327 | **Server action fallback error leaks raw Supabase messages.** Unhandled error types returned verbatim. |

### Low

| ID | CVSS | CWE | File | Issue |
|----|------|-----|------|-------|
| S-11 | 3.1 | CWE-284 | auth.ts:177-189 | **Admin email allowlist env-only.** No DB-level admin role. If email confirmation disabled, attacker can claim admin email first. |
| S-12 | 2.4 | CWE-367 | 3 dashboard layouts | **Client-side auth guard TOCTOU race.** Component renders briefly before useEffect check completes. Server-rendered content could leak. |
| S-13 | 2.1 | CWE-532 | auth.ts:147-151, callback/route.ts:122-128 | **PII (email, IP) logged to console.** Persisted in Vercel/CloudWatch logs accessible to dev staff. |

### Positive Security Observations

- Login action has defense-in-depth: rate limiting + DB-persistent account lockout + anti-enumeration
- OAuth callback validates redirects against whitelist, blocks protocol-relative URLs
- Login page uses predefined message codes (not query params) preventing reflected XSS
- Sign-in form validates `returnTo` with proper prefix check
- Password reset returns identical responses regardless of email existence

---

## Performance Findings

### Critical

| ID | Impact | Issue |
|----|--------|-------|
| P-1 | 400-800ms latency, 3-4x DB load | **Cascading redundant auth checks — up to 12 DB queries per navigation.** Login → dashboard triggers: 5x `getUser()`, 4x `baseball_coaches`, 3x `baseball_players`, 3x `users`. Middleware, server action, dashboard layout, sub-layout, and `useAuth` hook each independently query for overlapping data. Fix: `React.cache()`-wrapped `getSessionProfile()` function. |

### High

| ID | Impact | Issue |
|----|--------|-------|
| P-2 | 200-400ms per OAuth login | **OAuth callback sequential + duplicate queries.** Queries golf_coaches/players twice (existence check then onboarding check). Baseball path also sequential. Fix: single `Promise.all()` batch. |
| P-3 | Infinite re-fire loop | **Supabase client recreated every render** in login page, CompleteSignupClient, coach-onboarding. `useEffect` deps change every render. Fix: `useRef(createClient())`. |
| P-4 | Security gap + memory leak | **In-memory rate limiting breaks under horizontal scaling.** No bounds on Map size. Resets on deploy. Fix: add size guard, migrate to Supabase/Redis. |

### Medium

| ID | Impact | Issue |
|----|--------|-------|
| P-5 | 100-300ms per auth action | **Hardcoded setTimeout delays** (100-300ms) for cookie propagation. Fragile and wasteful. |
| P-6 | ~12-15 KB bundle bloat | **Three near-identical dashboard layouts** (~430 lines duplicated). Identical shell/providers/sidebar. |
| P-7 | 150-300ms latency | **useAuth hook waterfall queries.** 3 sequential round-trips. Fetches `select('*')` when only `role` needed. Fix: `Promise.all()`. |
| P-8 | 100-200ms per page load | **CompleteSignupClient sequential queries.** Checks coach then player sequentially. Also re-calls `getUser()` unnecessarily. |
| P-9 | 40-60 KB per page | **Monolithic onboarding components** (1000+ lines each). Full framer-motion + all steps loaded upfront. Fix: `React.lazy`/`dynamic`. |
| P-10 | 30-80ms per request | **Middleware DB query on every dashboard route.** `checkRouteAuthorization` called unconditionally but only needed for recruiting/org/team routes. |
| P-11 | Duplicate records | **Race condition in onboarding submit.** `setTimeout` + `handleSubmit` allows double-click to create duplicate orgs/coaches/teams. |

### Low

| ID | Impact | Issue |
|----|--------|-------|
| P-12 | 10-20ms, pool pressure | **Admin client created per lockout call.** Two separate clients per login attempt. |
| P-13 | UI flicker | **Stale auth data in localStorage.** Zustand persist hydrates old user's data before fresh fetch. |
| P-14 | ~50-100ms TTFB | **`force-dynamic` on static client signup page.** Prevents CDN-served static shell. |

---

## Critical Issues for Phase 3 Context

1. **Client-side signup in onboarding (S-1)** needs integration tests covering both signup paths
2. **Client-side DB writes (S-3)** need RLS policy verification tests
3. **Rate limiting (S-8, P-4)** needs load testing to verify effectiveness
4. **Redirect loop (S-9)** needs E2E test covering null-role edge case
5. **Race condition (P-11)** needs test for rapid double-click on plan selection
6. **Auth waterfall (P-1)** needs performance benchmarking before/after optimization
7. **Password policy (S-5)** needs test verifying all paths enforce same minimum
