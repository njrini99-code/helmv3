# Review Fixes Design — Baseball Auth/Onboarding

## Scope
Fix all remaining issues from `docs/legacy/full-review/02-security-performance.md` (S-4, S-5, S-8, S-9, S-10, P-1, P-2, P-4, P-5, P-6, P-7). Defer P-9 (monolithic component split) to separate PR.

## Group A: Quick Fixes

### S-4/S-10 — Sanitize error messages
- `auth.ts:326`: Replace `error.message` with generic message
- `onboarding.ts`: Same — never expose raw Supabase errors

### S-5 — Password policy alignment
- Update UI hints to match server: "uppercase, lowercase, number, and special character"
- Add client-side validation matching `password-validation.ts` requirements

### S-9 — Null role routing
- Add null-role redirect in `loginAction` → `/baseball/complete-signup`

### P-5 — Remove setTimeout
- `baseball-sign-up-form.tsx`: Replace 150ms setTimeout with `router.refresh()`

## Group B: Parallelization

### P-2 — OAuth callback
- Batch 6 sequential queries into `Promise.all()` groups

### P-7 — useAuth waterfall
- `use-auth.ts`: Parallel `users` + `baseball_coaches` + `baseball_players` after `getUser()`

## Group C: Structural

### P-1/P-6 — Shared dashboard shell + deduplicated auth
- New: `src/hooks/use-baseball-auth.ts` — single getUser() + parallel profile queries
- New: `src/components/baseball/dashboard-shell.tsx` — shared sidebar/providers/shell
- Refactor 3 layouts to use shared hook + shell

### S-8/P-4 — Supabase-backed rate limiting
- New migration: `auth_rate_limits` table
- New: `src/lib/auth/supabase-rate-limit.ts`
- Update `auth.ts` to use DB-backed rate limiting

## Deferred
- P-9: Monolithic onboarding component split (separate PR)
