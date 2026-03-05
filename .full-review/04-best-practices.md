# Phase 4: Best Practices & Standards

**Date**: 2026-03-04
**Scope**: Full working tree (~39 files, ~2,170 insertions, ~1,429 deletions)

## Executive Summary

The codebase follows many modern patterns correctly (discriminated unions, proper `import type`, App Router server actions, Svix webhook verification). Key gaps are: stale closures in async hooks, missing memoization for a 165-line pure function, `z.any()` bypassing validation, TypeScript build errors disabled in production, and no tests executed in CI.

---

## Framework & Language Findings

### Critical (1)

#### BP-01: `typescript: { ignoreBuildErrors: true }` in `next.config.mjs`

Type errors ship to production undetected. The build passes even with TypeScript errors. While `npm run typecheck` is a separate CI step, any developer only running `npm run build` locally gets false confidence. Comment says "checks hang on this codebase" — underlying issue unresolved.

**Fix**: Investigate root cause (likely circular imports), re-enable type checking.

---

### High (4)

#### BP-02: Stale Closures in Async Hook Callbacks
**Files**: `use-edit-shot-modal.ts`, `use-undo-manager.ts`

`useCallback` depends on the entire `state` object, but async bodies capture stale snapshots. Pattern already solved in `use-shot-state-machine.ts` via refs.

**Fix**: Use `stateRef.current` pattern in all async callbacks.

---

#### BP-03: `z.any()` in `partialRoundSchema` + Zero Validation in `round-drafts.ts`

Two server action files accept unvalidated input while the third (`submitGolfRoundComprehensive`) correctly validates. Inconsistent pattern creates false confidence.

**Fix**: Add Zod schemas to `round-drafts.ts`, replace `z.any()` with typed schema in `partialRoundSchema`.

---

#### BP-04: No Tests Executed in CI Pipeline

GitHub Actions runs typecheck + lint + build but NOT `npm run test:run`. The 36 existing test cases are never verified in CI. Broken schema validators could ship.

**Fix**: Add `npm run test:run` step and `npm audit --audit-level=high`.

---

#### BP-05: `ShotUpdateData` Uses `string` Instead of Union Types

**File**: `golf.ts`, lines 3971-3992

`shot_type`, `club_type`, `lie_before`, `result` are all typed as `string` instead of their known union types. Zod validates at runtime, but TypeScript doesn't enforce at compile time.

**Fix**: Use typed unions matching the Zod enum values.

---

### Medium (5)

| # | Finding | File |
|---|---------|------|
| BP-06 | `calculateHoleStats` recreated every render, defeats memoization | `ShotTrackingComprehensive.tsx` |
| BP-07 | No `useCallback`/`useMemo` in main component for handlers and derived values | `ShotTrackingComprehensive.tsx` |
| BP-08 | `as unknown as string` double-cast in reducer for DB distance values | `use-shot-state-machine.ts` |
| BP-09 | `as unknown as Record<string, unknown>` for draft_data (types not regenerated) | `round-drafts.ts` |
| BP-10 | `(supabase as any).rpc(...)` type escape — 5 instances across codebase | `golf.ts`, `CRMDashboard.tsx` |

### Low (5)

| # | Finding |
|---|---------|
| BP-11 | Ref callback missing cleanup for deleted shot refs |
| BP-12 | `void (5000)` dead code in auto-save hook |
| BP-13 | `@types/*`, `eslint`, `typescript` in `dependencies` instead of `devDependencies` |
| BP-14 | `requestAnimationFrame` for concurrency guard (unconventional) |
| BP-15 | JSON.stringify fingerprinting is O(n) per check |

### Positive Patterns
- Discriminated union `ShotAction` type is well-structured with 27+ typed variants
- `import type` usage is correct throughout
- Server actions use proper `'use server'` directives and auth checks
- Webhook route correctly uses `NextResponse` and raw body parsing
- `svix` dependency is the canonical choice for Resend webhook verification
- Optional chaining and nullish coalescing used correctly throughout
- No deprecated React 18/19 or Next.js 14+ APIs detected

---

## CI/CD & DevOps Findings

### Critical (2)

#### OPS-01: Migration `000002` Data Migration Is Irreversible

The `UPDATE` at lines 11-18 destroys `notes` data (`notes = NULL`) after moving it to `draft_data`. No rollback path exists. The `notes LIKE '{%'` heuristic could match non-JSON text. The `notes::JSONB` cast can abort the entire migration on invalid JSON.

**Fix**: Create pre-migration backup table, wrap in PL/pgSQL with exception handling, add rollback comments.

---

#### OPS-02: `save_partial_round_atomic` RPC Authorization Gap

SECURITY DEFINER function trusts client `player_id` from JSONB payload instead of verifying `auth.uid()`. Callable directly via PostgREST. (Covered extensively in prior phases — included here for completeness.)

---

### High (2)

| # | Finding |
|---|---------|
| OPS-03 | No unit/integration tests in CI (tests exist but `npm run test:run` not in workflow) |
| OPS-04 | `typescript: { ignoreBuildErrors: true }` silently allows type-broken builds |

### Medium (4)

| # | Finding |
|---|---------|
| OPS-05 | Webhook handler errors not captured in Sentry (`console.error` only) |
| OPS-06 | No migration execution in CI (syntax/constraint errors caught only in production) |
| OPS-07 | DB type staleness check silently passes when `SUPABASE_PROJECT_ID` absent |
| OPS-08 | No rollback documentation for any of the 3 migrations |

### Low (5)

| # | Finding |
|---|---------|
| OPS-09 | `crm_email_events` missing `occurred_at` index |
| OPS-10 | Unique constraint on `(resend_message_id, event_type, occurred_at)` not using svix delivery ID |
| OPS-11 | Webhook endpoint URL not documented in `.env.example` |
| OPS-12 | No `npm audit` step in CI |
| OPS-13 | No health check endpoint for webhook route |

### Positive Practices
- Sentry properly configured on server + edge with 100% trace sampling
- `console.error`/`warn` excluded from production removal
- `npm ci` + lockfile validation in CI
- `SET search_path = public` on SECURITY DEFINER functions (Supabase best practice)
- `.env.example` properly documents new secrets with placeholder values
- No hardcoded secrets found
