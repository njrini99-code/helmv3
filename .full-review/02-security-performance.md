# Phase 2: Security & Performance Review

**Date**: 2026-03-04
**Scope**: Full working tree (~39 files, ~2,170 insertions, ~1,429 deletions)

## Executive Summary

The security audit identified **16 findings** (2 Critical, 4 High, 5 Medium, 5 Low). The performance analysis identified **15 findings** (4 Critical, 6 High, 5 Medium/Low). The most urgent issue is the IDOR vulnerability in the `save_partial_round_atomic` RPC function, which allows any authenticated user to overwrite another player's round data. Performance-wise, the triple-redundant save path with DELETE+INSERT pattern creates significant database load.

---

## Security Findings

### Critical (2)

#### SEC-01: IDOR in `save_partial_round_atomic` SECURITY DEFINER RPC (CVSS 8.1)
**CWE**: CWE-639, CWE-284 | **OWASP**: A01:2021 - Broken Access Control
**File**: `supabase/migrations/20260304000001_atomic_partial_round_save.sql`, line 29

The RPC extracts `player_id` from client-supplied JSONB instead of `auth.uid()`. Any authenticated user can overwrite another player's round data (metadata, holes, shots) via PostgREST. The function DELETEs all existing holes/shots before inserting new ones, so an attacker can destroy a victim's entire round.

**PoC**: `supabase.rpc('save_partial_round_atomic', { p_round_id: 'victim-uuid', p_round_data: { player_id: 'victim-player-uuid', ... }, p_holes: [], p_shots: [] })`

**Fix**: Replace `v_player_id := (p_round_data->>'player_id')::UUID` with:
```sql
SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();
```

---

#### SEC-02: Validation Bypass via `z.array(z.any())` in `partialRoundSchema` (CVSS 7.5)
**CWE**: CWE-20, CWE-1287 | **OWASP**: A03:2021 - Injection
**File**: `src/app/golf/actions/golf.ts`, line 419

The `holes` array accepts ANY data type, bypassing Zod for the most data-rich part of the payload. Allows integer overflow, negative values, type mismatches, arbitrary extra properties, and potential prototype pollution.

**Fix**: `holes: z.array(comprehensiveHoleSchema.partial().nullable()).max(18)`

---

### High (4)

#### SEC-03: Zero Input Validation on All `round-drafts.ts` Exports (CVSS 6.5)
**CWE**: CWE-20 | **File**: `src/app/golf/actions/round-drafts.ts`

All 5 server actions (`saveRoundDraft`, `loadRoundDraft`, `checkForDraft`, `clearRoundDraft`, `convertDraftToRound`) have no Zod validation. Draft data is stored as raw JSONB and cast back to `RoundDraftData` on retrieval without validation.

**Fix**: Add Zod schemas for all exports, matching the pattern in `golf.ts`.

---

#### SEC-04: No Email Format Validation in CRM Send-Email Route (CVSS 6.1)
**CWE**: CWE-20, CWE-93 | **File**: `src/app/api/admin/crm/send-email/route.ts`, lines 37-44

Recipient email addresses are not validated before being passed to the Resend API. Enables spam relay, CRLF injection, and API abuse.

**Fix**: Add `z.string().email().max(254)` validation for recipient emails.

---

#### SEC-05: Fire-and-Forget Cascade Updates Cause Silent Data Corruption (CVSS 5.9)
**CWE**: CWE-754 | **File**: `src/hooks/golf/use-edit-shot-modal.ts`, lines 155-161

Cascade distance updates to the next shot are fire-and-forget. Failure leaves the database inconsistent with client state. No retry mechanism, no user notification.

**Fix**: Await cascade, dispatch `SET_AUTO_SAVE_STATUS: 'error'` on failure, trigger reconciliation auto-save.

---

#### SEC-06: PostgREST Filter Injection in CRM Search (CVSS 5.4)
**CWE**: CWE-943 | **File**: `src/app/golf/admin/crm/page.tsx`, line 166

User search input is interpolated directly into PostgREST `.or()` filter strings without sanitization. Special chars (`,`, `.`, `(`, `)`) can manipulate query logic.

**Fix**: Sanitize: `search.replace(/[%_\\]/g, '\\$&').replace(/[,.()"']/g, '')`

---

### Medium (5)

| # | Finding | CWE | File |
|---|---------|-----|------|
| SEC-07 | Unvalidated JSONB storage in `draft_data` column | CWE-502 | `round-drafts.ts` line 121, migration `000002` |
| SEC-08 | Raw webhook payload stored without size limits | CWE-400 | `src/app/api/webhooks/resend/route.ts` line 79 |
| SEC-09 | Multiple `as any` type escapes for untyped Supabase calls | CWE-843 | `golf.ts` (5 instances), `CRMDashboard.tsx` |
| SEC-10 | localStorage draft backup stores round data unencrypted | CWE-922 | `ShotTrackingComprehensive.tsx` |
| SEC-11 | Migration JSON cast may abort on invalid data | CWE-252 | migration `000002`, lines 9-17 |

### Low (5)

| # | Finding | CWE | File |
|---|---------|-----|------|
| SEC-12 | `console.error` leaks error details in production | CWE-532 | `use-undo-manager.ts`, `use-edit-shot-modal.ts` |
| SEC-13 | No rate limiting on auto-save server actions | CWE-770 | `golf.ts`, `round-drafts.ts` |
| SEC-14 | Missing CSRF beyond Next.js defaults | CWE-352 | API routes |
| SEC-15 | Double-submit guard inconsistent between new/continue round | CWE-362 | `continue-round-client.tsx` |
| SEC-16 | `GolfEventInsertData` uses `[key: string]: unknown` index signature | CWE-915 | `PremiumCalendarClient.tsx` |

### Positive Security Practices
- Consistent auth checks in every server action
- Status-based guards (can't delete/overwrite completed rounds)
- Svix webhook signature verification is solid
- CRM tables have proper admin-only RLS policies
- `deleteShot`/`updateShot` verify ownership chains
- Idempotent upserts via unique constraint on webhook events
- `isProcessingShotRef` prevents double-tap duplicates

---

## Performance Findings

### Critical (4)

#### PERF-01: `calculateHoleStats` in Component Body — Memoization Cascade Failure
**File**: `src/components/golf/ShotTrackingComprehensive.tsx`, lines 107-272
**Impact**: 6+ callbacks recreated on every keystroke/tap across all hooks

Pure 165-line function defined inside component body, passed to 3 hooks. Creates new reference every render, defeating all `useCallback` memoization in `useEditShotModal`, `useUndoManager`, `usePenaltyHandler`.

**Fix**: Extract to module scope or `shot-helpers.ts`. Zero-risk, 10-minute refactor.

---

#### PERF-02: Atomic RPC Uses DELETE ALL + INSERT ALL — O(total_rows) per Save
**File**: `supabase/migrations/20260304000001_atomic_partial_round_save.sql`, lines 72-73
**Impact**: ~150 row operations every 30 seconds per active user

PL/pgSQL loops delete and re-insert all holes/shots on every save. With 20 concurrent users, this is ~3,000 row operations/minute.

**Fix**: Replace with `INSERT ... ON CONFLICT DO UPDATE` + set-based CTEs. Reduces to ~5 operations per save.

---

#### PERF-03: Triple Redundant Save Path — 3x Write Amplification
**Files**: `continue-round-client.tsx` (lines 215-283), `new-round-client.tsx` (lines 664-736)
**Impact**: 3 independent persistence operations per 30-second save cycle

IndexedDB + JSONB draft update + relational DELETE-ALL/INSERT-ALL all fire on every save. Each path contains the same data in different formats.

**Fix**: Consolidate to single save strategy. JSONB-only during tracking, convert to relational on final submission.

---

#### PERF-04: Dual Save Path — 2 Server Round-Trips per Auto-Save
**File**: `new-round-client.tsx`, lines 664-736
**Impact**: Both `scheduleSave` (JSONB) and `savePartialRound` (relational RPC) fire simultaneously

Plus a `useEffect` on 8 state variables triggers `scheduleSave` overlapping with the auto-save callback. Combined: 4+ database queries every 30 seconds per active user.

**Fix**: Choose one persistence strategy per lifecycle phase.

---

### High (6)

| # | Finding | File | Impact |
|---|---------|------|--------|
| PERF-05 | `state` object in hook dependency arrays invalidates all callbacks | `use-edit-shot-modal.ts` | Callback recreation on every dispatch |
| PERF-06 | PL/pgSQL loop iteration instead of set-based SQL | migration `000001` | 90 individual INSERTs vs 2 batched |
| PERF-07 | Two auto-save triggers race — dropped saves lose data | `use-shot-state-machine.ts` + `new-round-client.tsx` | Silent data loss under degraded network |
| PERF-08 | ShotTrackingComprehensive (1,948 lines) loaded eagerly | `new-round-client.tsx` line 7 | ~50-70KB extra JS on page load |
| PERF-09 | `buildPartialRoundData` rebuilds full payload without change detection | Both round clients | 15-25KB JSON rebuilt every 30 seconds |
| PERF-10 | `saveRoundDraft` performs 3 sequential auth queries before upsert | `round-drafts.ts` lines 69-94 | 60-150ms overhead per save |

### Medium/Low (5)

| # | Finding | File | Impact |
|---|---------|------|--------|
| PERF-11 | Scorecard aggregates recalculated on every render | `ShotTrackingComprehensive.tsx` lines 487-496 | 6 array iterations per render |
| PERF-12 | `computeShotFingerprint` does full JSON serialization | `shot-helpers.ts` lines 122-144 | O(n) per evaluation, called twice per cycle |
| PERF-13 | `deleteShot`/`updateShot` do 3 ownership queries before mutation | `golf.ts` | 10-12 DB queries per shot edit |
| PERF-14 | Offline sync infrastructure loaded eagerly | `new-round-client.tsx` lines 22-24 | 10-20KB extra JS + IndexedDB init |
| PERF-15 | `revalidatePath` called on every shot edit during active tracking | `golf.ts` lines 3956-3958, 4141-4143 | Unnecessary cache churn |

### Positive Performance Practices
- Timer cleanup correct across all hooks (no memory leak risk)
- Concurrency guard (`isProcessingShotRef`) prevents double-tap
- Reducer architecture is pure and efficient
- Fingerprint-based auto-save deduplication concept is sound
- Existing partial index `idx_golf_rounds_in_progress` covers draft lookups

---

## Critical Issues for Phase 3 Context

1. **SECURITY**: RPC authorization bypass (SEC-01) must be fixed before deployment
2. **SECURITY**: Validation bypass (SEC-02) and missing validation (SEC-03, SEC-04) need test coverage
3. **PERFORMANCE**: Triple-redundant saves need architectural decision on single save strategy
4. **PERFORMANCE**: DELETE+INSERT pattern needs migration to UPSERT
5. **DATA INTEGRITY**: Auto-save race conditions need integration tests
6. **TESTING**: No tests exist for hook business logic (state machine, undo, edit cascade)
