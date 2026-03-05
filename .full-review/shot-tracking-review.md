# Comprehensive Shot Tracking System Review

**Review Date:** 2026-03-04
**Target:** GolfHelm Shot Tracking System (round creation, shot recording, stats, submission, resume, edit, database, security, UX)
**Agents Deployed:** 6 parallel review teams
**Total Findings:** 97

---

## Executive Summary

The shot tracking system is architecturally sound with good separation of concerns (reducer-based state machine, extracted hooks, Zod validation, RLS policies). However, the review uncovered **serious data integrity risks**, **security authorization gaps**, **calculation bugs**, and **UX issues that would impact real-world mobile use during golf rounds**. The most urgent issues are: auto-save using stale data, no transaction atomicity on submission, IDOR vulnerabilities exposing cross-team data, and broken RLS policies referencing non-existent columns.

---

## Findings by Priority

### P0 — CRITICAL (Must Fix Immediately) — 10 findings

| # | Category | Issue | File | Line |
|---|----------|-------|------|------|
| 1 | **Data Integrity** | Auto-save `buildPartialRoundData()` uses stale closure state — saves old data instead of current shots | `new-round-client.tsx` | 691 |
| 2 | **Data Integrity** | No transaction atomicity in round submission — shot insert failure leaves ghost completed round with no shots | `golf.ts` | 856-998 |
| 3 | **Data Integrity** | Round update deletes existing shots/holes BEFORE inserting new ones — failure = permanent data loss | `golf.ts` | 738-769 |
| 4 | **Data Integrity** | Auto-save draft only saves current hole's shots, overwrites other holes' in-progress data | `new-round-client.tsx` | 682 |
| 5 | **Security** | IDOR: `getStatsSummary`/`getDetailedStats` accept arbitrary `playerId` with no ownership check | `stats-data.ts` | 218, 347 |
| 6 | **Security** | IDOR: 10+ round review functions (get, mark viewed, add feedback, share) have no ownership verification | `round-reviews.ts` | Multiple |
| 7 | **Security** | RLS policies reference non-existent `golf_coaches.team_id` column — coach team-access policies silently fail | `034_all_rls_policies.sql` | 756-925 |
| 8 | **Database** | RLS on `golf_shots` filters only by nullable `hole_id` — shots with null `hole_id` become invisible to all users | `034_all_rls_policies.sql` | 862-924 |
| 9 | **Calculation** | `calculateShotDistanceWithDirection` missing `short_left`/`short_right` 0.7 diagonal factor despite JSDoc claiming it | `shot-helpers.ts` | 73-97 |
| 10 | **UX** | Auto-save error clears after 3 seconds with no retry — silent data loss on poor cell coverage | `use-shot-state-machine.ts` | 548-553 |

### P1 — HIGH (Fix Before Next Release) — 25 findings

| # | Category | Issue | File |
|---|----------|-------|------|
| 11 | Data Integrity | Concurrent auto-saves silently dropped (no queue) — shots lost on slow connections | `new-round-client.tsx:692` |
| 12 | Data Integrity | `isStartingRound` lock never released on saved-course success path — back button permanently disabled | `new-round-client.tsx:445` |
| 13 | Data Integrity | Continue-round reconstructs `completedHoleStats` with null for all detailed fields (driving distance, proximity, etc.) — lost on re-submit | `continue/[id]/page.tsx:194` |
| 14 | Data Integrity | Draft resume does not restore `holesPerRound` — defaults to 18 even for 9-hole rounds | `new-round-client.tsx:363` |
| 15 | Data Integrity | `handleSaveShot` can append duplicate shots when navigating back to uncompleted holes | `new-round-client.tsx:645` |
| 16 | Data Integrity | `requestAnimationFrame` guard release timing unreliable for double-tap prevention | `ShotTrackingComprehensive.tsx:432` |
| 17 | Security | IDOR: `getTeamComparison` accepts arbitrary `teamId` — exposes full roster stats to any user | `stats-data.ts:768` |
| 18 | Security | Unauthenticated `onRoundCompleteAction`/`markStatsStaleAction` — no auth check at all | `stats.ts:332,349` |
| 19 | Security | `getTeamShotAnalytics` missing coach authorization — any user can query any team's shot patterns | `shot-analytics.ts:767` |
| 20 | Security | `getPlayerStatsSummaryAction`/`getFullPlayerStatsAction` accept arbitrary player IDs without team verification | `stats.ts:42,104` |
| 21 | Calculation | Qualifier stats sums null scores as 0, dramatically skewing leaderboard rankings | `golf.ts:3622` |
| 22 | Calculation | Stats cache invalidation does not mark DB cache stale or trigger recalculation | `golf-stats-calculator.ts:297` |
| 23 | Calculation | 9-hole and 18-hole round scores averaged without normalization — skews scoring average | `stats-data.ts:310` |
| 24 | Calculation | Legacy fairway hit count includes par 3s in numerator but not denominator — inflates fairway % | `golf.ts:1081` |
| 25 | Calculation | `courseRating`/`courseSlope` use `||` instead of `??` — converts valid 0 to null | `golf.ts:800` |
| 26 | Calculation | Par 3 fairway tracking: server calculator sets `false`, client sets `null` — different fairway percentages | `golf-stats-calculator-shots.ts:652` |
| 27 | Calculation | `EDIT_SAVE_COMPLETE` does not call `computeRestoredState` — editing last shot leaves stale lie/distance | `use-shot-state-machine.ts:320` |
| 28 | Calculation | Edit modal uses `deriveLieAfterFromResult` instead of `deriveLieAfter` for DB updates — loses bunker context | `use-edit-shot-modal.ts:129` |
| 29 | Calculation | `CONFIRM_PENALTY` does not update `distanceToHole`/`currentLie` or clear input state | `use-shot-state-machine.ts:255` |
| 30 | Database | No unique constraint on `(round_id, hole_number, shot_number)` in `golf_shots` — allows duplicate shots | Schema |
| 31 | UX | 1914-line monolith `ShotTrackingComprehensive` — unmaintainable, untestable | `ShotTrackingComprehensive.tsx` |
| 32 | UX | Undo failure provides zero user feedback — dialog disappears silently | `use-undo-manager.ts:47` |
| 33 | UX | Edit shot modal not optimized for mobile field use — small touch targets, long scroll | `ShotTrackingComprehensive.tsx:1479` |
| 34 | UX | No accessibility labels on scorecard holes, result buttons, break/slope controls, distance inputs | `ShotTrackingComprehensive.tsx` |
| 35 | UX | Near-identical save logic duplicated between new-round and continue-round clients | Both client files |

### P2 — MEDIUM (Plan for Next Sprint) — 30 findings

| # | Category | Issue |
|---|----------|-------|
| 36 | Data Integrity | Sparse `completedHoleStats` array causes `reduce` crash on continue-round |
| 37 | Data Integrity | `startHoleIndex` can exceed array bounds when all holes completed |
| 38 | Data Integrity | Edit cascade only updates one adjacent shot — downstream shots keep stale distances |
| 39 | Data Integrity | `distanceToHole` can become 0/NaN causing division-by-zero in progress bar |
| 40 | Data Integrity | `handleDeleteRound` in continue-round ignores server action failure |
| 41 | Data Integrity | Offline wrapper `handleSaveShot` captures potentially stale `currentHoleIndex` |
| 42 | Security | `generateRoundReview` missing ownership check — any user can trigger review for any round |
| 43 | Security | Missing UUID validation on `clearRoundDraft`, `getReviewById`, `getRoundReview`, `shareRoundReviewWithCoach` |
| 44 | Security | Score tampering possible on completed/verified rounds — no status check in `updateShot` |
| 45 | Security | Unvalidated draft data stored in JSONB column without schema validation or size limit |
| 46 | Security | Legacy notes field JSON parsing — deserialization of untrusted data |
| 47 | Calculation | Period comparison averages percentages instead of aggregating raw counts (Simpson's paradox) |
| 48 | Calculation | Scrambling data always null in summary/team views — not stored at round level |
| 49 | Calculation | Coach feedback uses `profile_id` instead of `user_id` — likely always fails |
| 50 | Calculation | Approach proximity on non-GIR holes uses chip proximity instead of approach shot proximity |
| 51 | Calculation | `activeShotNumber` fallback differs between new-round (always 1) and continue-round |
| 52 | Calculation | `deriveLieAfterFromResult` is case-sensitive but `isGreenHit` is case-insensitive |
| 53 | Calculation | `normalizeShotType` case-sensitive — `'PUTT'` passes through unchanged |
| 54 | Calculation | `normalizeApproachMissLieType` maps `'hazard'` to `'rough'` — incorrect for golf rules |
| 55 | Calculation | `computeShotFingerprint` missing `isPenalty` field — penalty changes may not trigger auto-save |
| 56 | Database | `golf_putting_tendencies` table never written to — dead schema |
| 57 | Database | `golf_round_stats_cache` table never written to by application code |
| 58 | Database | Missing `yardage` column on `golf_holes` — per-round yardage silently discarded |
| 59 | Database | `is_draft` column added but never used — cleanup function can't find drafts |
| 60 | Database | `putt_details`/`approach_miss_details` tables not in generated Supabase types — use `as any` |
| 61 | Database | Draft `convertDraftToRound()` sets `notes: null` — destroys player notes |
| 62 | UX | Forced putt break entry even when chipping from fringe (no fringe lie option) |
| 63 | UX | Penalty shot does not prompt for new position (re-tee vs drop zone) |
| 64 | UX | Wizard validation gaps — no range check on courseRating/courseSlope |
| 65 | Tests | `HANDLE_RESULT_SELECT` and `CLEAR_INPUT_STATE` reducer actions have zero tests |

### P3 — LOW (Track in Backlog) — 32 findings

| # | Category | Issue |
|---|----------|-------|
| 66-97 | Various | Includes: dead code (`void 5000`), unrounded scoring averages, inconsistent GIR rounding, redundant clearDraft calls, missing test fixtures for edge cases, no test file for edit-shot-modal, no-3-putt streak order dependency, round review "AI" is rule-based, coach feedback lost on regeneration, missing approach proximity for holed shots, unit conversion inconsistency in holedOutDistance, stale distance display on result change, review page direct DB queries, no scroll-snap on scorecard, duplicate GIR calculation, `roundTypeToDb` is a no-op, missing `'long'` in PuttMissTag, legacy round path no qualifier support, admin role check from user-editable table, middleware skips golf role enforcement, no server-side rate limiting on auto-save, and more. |

---

## Findings by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Data Integrity | 4 | 6 | 6 | 2 | 18 |
| Security | 3 | 4 | 5 | 3 | 15 |
| Calculation | 1 | 8 | 7 | 5 | 21 |
| Database | 1 | 1 | 6 | 2 | 10 |
| UX/Architecture | 1 | 6 | 3 | 7 | 17 |
| Test Coverage | 0 | 0 | 3 | 13 | 16 |
| **Total** | **10** | **25** | **30** | **32** | **97** |

---

## Top 10 Fixes — Recommended Action Plan

### 1. Fix auto-save stale closure (P0 #1, #4)
**Effort:** Small | **Impact:** Prevents shot data loss
Pass current shots directly to `buildPartialRoundData` instead of relying on closure. Include all holes' in-progress shots, not just current hole.

### 2. Add transaction atomicity to round submission (P0 #2, #3)
**Effort:** Medium | **Impact:** Prevents ghost rounds and permanent data loss
Create a PostgreSQL function that inserts round+holes+shots atomically. Reverse delete-then-insert order for updates.

### 3. Fix IDOR vulnerabilities in stats and reviews (P0 #5, #6; P1 #17-20)
**Effort:** Medium | **Impact:** Prevents cross-team data leakage
Add `verifyPlayerAccess()` to all stats-data functions. Add ownership checks to all review functions. Add auth to cache invalidation actions.

### 4. Fix RLS policies (P0 #7, #8)
**Effort:** Medium | **Impact:** Fixes broken coach access and invisible shots
Rewrite team-access policies to use correct join path. Add `round_id` fallback to shots RLS.

### 5. Fix stats calculation bugs (P1 #21-26)
**Effort:** Medium | **Impact:** Correct stats across the platform
Normalize 9/18-hole scoring. Filter null qualifier scores. Fix fairway par-3 handling. Use `??` instead of `||`. Mark cache stale on invalidation.

### 6. Fix state machine gaps (P1 #27-29)
**Effort:** Small | **Impact:** Correct shot tracking behavior
Add `computeRestoredState` to `EDIT_SAVE_COMPLETE`. Use `deriveLieAfter` in edit modal. Clear input state after penalty.

### 7. Add auto-save retry and error persistence (P0 #10; P1 #11)
**Effort:** Medium | **Impact:** Prevents silent data loss on-course
Implement exponential backoff retry. Queue pending saves instead of dropping. Keep error visible until successful save.

### 8. Fix continue-round data reconstruction (P1 #13, #14)
**Effort:** Small | **Impact:** Prevents stats loss when resuming rounds
Recalculate detailed stats from shots after loading. Restore `holesPerRound` from draft data.

### 9. Add missing database constraints (P1 #30)
**Effort:** Small | **Impact:** Prevents duplicate shot insertion
Add `UNIQUE(round_id, hole_number, shot_number)` to `golf_shots`.

### 10. Decompose ShotTrackingComprehensive (P1 #31)
**Effort:** Large | **Impact:** Maintainability, testability, performance
Split 1914-line monolith into ~12 focused sub-components.

---

## Positive Findings

The review also identified strong patterns worth preserving:

1. **Consistent auth checks** — Nearly all server actions verify authentication
2. **Comprehensive Zod validation** — Round submission, shot updates, and partial saves all use strict schemas
3. **RLS enabled on all 75+ tables** — Defense-in-depth security posture
4. **No SQL injection risk** — All queries use Supabase's parameterized client
5. **Well-structured state machine** — Reducer pattern with extracted hooks is a solid architecture
6. **Good test coverage for helpers** — `shot-helpers.ts` and `golf-stats-calculator-shots.ts` have thorough tests
7. **Safe error handling** — `formatSafeErrorResponse` prevents internal error leakage
8. **Division-by-zero protection** — `safePercent` and `safeAverage` utilities handle zero denominators

---

## Review Metadata

- **Review date:** 2026-03-04
- **Agents used:** 6 (Core Logic, Stats/Submit, Security, UX/Architecture, Database, Tests/Helpers)
- **Files reviewed:** 40+
- **Total tokens consumed:** ~840,000
