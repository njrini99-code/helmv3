# Comprehensive Code Review Report

**Date**: March 4, 2026
**Target**: Full working tree — all modified and untracked files (~39 files, ~2,170 insertions, ~1,429 deletions)
**Stack**: Next.js 16 (App Router) + TypeScript strict + Supabase + Tailwind
**Review Agents**: code-reviewer, architect-review, security-auditor, general-purpose (performance, testing, documentation, framework, devops)

---

## Executive Summary

The working tree represents a **well-motivated architectural refactor** of the shot tracking system — extracting a monolithic 2,500+ line component into a reducer-based state machine with 4 dedicated hooks, centralizing types, adding atomic database saves, and hardening Zod validation. The CRM email tracking infrastructure with Svix webhook verification is well-designed. However, there is **1 critical security vulnerability** (RPC authorization bypass allowing any authenticated user to overwrite another player's data), **stale closures in async hooks that can corrupt data on rapid operations**, and **significant performance overhead from triple-redundant saves with a DELETE-ALL/INSERT-ALL pattern**. Test coverage is ~8-10%, documentation is stale, and TypeScript build errors are disabled in production.

---

## Findings by Priority

### Critical Issues (P0 — Must Fix Before Merge)

| # | Category | Finding | File(s) | Impact |
|---|----------|---------|---------|--------|
| 1 | **Security** | `save_partial_round_atomic` RPC trusts client-supplied `player_id` — any authenticated user can overwrite another player's round data via PostgREST (CVSS 8.1) | `migrations/000001` | **Authorization bypass, data destruction** |
| 2 | **Security** | `z.array(z.any()).max(18)` in `partialRoundSchema` bypasses all hole data validation (CVSS 7.5) | `golf.ts:419` | Data integrity corruption |
| 3 | **Data Integrity** | Stale closures in `useUndoManager` and `useEditShotModal` — async callbacks capture stale state snapshots, rapid operations corrupt shot data | `use-undo-manager.ts`, `use-edit-shot-modal.ts` | Data corruption on rapid ops |
| 4 | **Data Integrity** | `UNDO_COMPLETE`/`DELETE_COMPLETE` reducer restores wrong distance (uses stale `distanceToHole` instead of hole yardage when all shots removed) | `use-shot-state-machine.ts` | Incorrect distance after undo-all |
| 5 | **Performance** | `calculateHoleStats` (165-line pure function) in component body defeats ALL hook memoization — 6+ callbacks recreated on every keystroke | `ShotTrackingComprehensive.tsx:107` | Mobile input lag |
| 6 | **Performance** | Triple redundant save path (IndexedDB + JSONB draft + relational DELETE-ALL/INSERT-ALL RPC) creates 3x write amplification every 30 seconds | `continue-round-client.tsx`, `new-round-client.tsx` | Database overload |
| 7 | **Performance** | Atomic RPC uses DELETE ALL + INSERT ALL with PL/pgSQL loops — ~150 row operations per 30-second save | `migrations/000001` | O(total_rows) per save |
| 8 | **DevOps** | `typescript: { ignoreBuildErrors: true }` — type errors ship to production undetected | `next.config.mjs` | Production type errors |
| 9 | **DevOps** | Migration `000002` data migration is irreversible — destroys `notes` data with no rollback, `notes::JSONB` cast can abort on invalid JSON | `migrations/000002` | Unrecoverable data loss |

### High Priority (P1 — Fix Before Next Release)

| # | Category | Finding | Effort |
|---|----------|---------|--------|
| 10 | Security | Zero Zod validation on all 5 `round-drafts.ts` exports | 2 hrs |
| 11 | Security | No email format validation in CRM send-email route | 30 min |
| 12 | Security | Fire-and-forget cascade updates cause silent DB inconsistency | 1 hr |
| 13 | Security | PostgREST filter injection in CRM search (admin-only, low blast radius) | 30 min |
| 14 | Architecture | Dual save-path (JSONB draft vs relational RPC) creates data divergence risk | 4 hrs |
| 15 | Architecture | `comprehensiveHoleSchema` removed `.passthrough()` without type coupling docs | 30 min |
| 16 | Performance | `state` object in hook dep arrays invalidates all callbacks on every dispatch | 1 hr |
| 17 | Performance | Two auto-save triggers race — dropped saves lose data under degraded network | 2 hrs |
| 18 | Performance | ShotTrackingComprehensive (1,948 lines) loaded eagerly — no code splitting | 30 min |
| 19 | Performance | `buildPartialRoundData` rebuilds full 15-25KB payload without change detection | 1 hr |
| 20 | Performance | `saveRoundDraft` performs 3 sequential auth queries before upsert | 2 hrs |
| 21 | Testing | State machine reducer (617 lines, 27 action types) entirely untested | 4 hrs |
| 22 | Testing | `calculateShotDistanceWithDirection` — untested directional math | 1 hr |
| 23 | Testing | No tests in CI pipeline (`npm run test:run` not in workflow) | 1 hr |
| 24 | TypeScript | `ShotUpdateData` uses `string` instead of union types | 30 min |
| 25 | Documentation | Hook extraction not reflected in any context file (12 -> 16+ hooks) | 1 hr |
| 26 | Documentation | State machine has no state/transition documentation | 1 hr |
| 27 | Documentation | New tables/columns not in database reference | 1 hr |
| 28 | Documentation | Atomic RPC missing `putt_miss_tags`, `approach_miss_direction`, `approach_miss_lie_type` in INSERT — possible data loss | 1 hr |

### Medium Priority (P2 — Plan for Next Sprint)

| # | Category | Finding |
|---|----------|---------|
| 29 | Security | Unvalidated JSONB storage in `draft_data` column |
| 30 | Security | Raw webhook payload stored without size limits |
| 31 | Security | Multiple `as any` type escapes (5 instances) |
| 32 | Performance | Scorecard aggregates recalculated on every render |
| 33 | Performance | `computeShotFingerprint` does full O(n) JSON serialization |
| 34 | Performance | `deleteShot`/`updateShot` do 3 ownership queries before mutation |
| 35 | Performance | `revalidatePath` called on every shot edit during active tracking |
| 36 | Quality | Component still 1,948 lines — rendering logic not extracted |
| 37 | Quality | `void (5000)` dead code in auto-save hook |
| 38 | Quality | GIR calculation inconsistency between client and server |
| 39 | Quality | `requestAnimationFrame` for concurrency guard (unconventional) |
| 40 | Quality | Missing email format validation in CRM route |
| 41 | Testing | `lieFromShotResult`, `computeShotFingerprint` untested |
| 42 | Testing | Webhook handler untested (signature, error paths) |
| 43 | Testing | No component tests for ShotTrackingComprehensive |
| 44 | Documentation | Dual save-path architecture undocumented |
| 45 | Documentation | `RoundDraftData` duplicated, no canonical location |
| 46 | Documentation | Webhook route not documented |
| 47 | Documentation | Round Tracking data flow description stale |
| 48 | DevOps | Webhook handler errors not captured in Sentry |
| 49 | DevOps | No migration execution in CI |
| 50 | DevOps | DB type staleness check silently passes when secret absent |

### Low Priority (P3 — Track in Backlog)

| # | Category | Finding |
|---|----------|---------|
| 51 | Quality | Dead type re-exports from ShotTrackingComprehensive |
| 52 | Quality | `type Hole = RoundHole` alias duplicated in 7 files |
| 53 | Quality | `console.error`/`console.warn` instead of structured logging |
| 54 | Quality | `RoundDraftData` interface duplicated between files |
| 55 | Quality | `editFormData` duplicates ShotRecord fields |
| 56 | Quality | Penalty shot doesn't advance distance for water/unplayable |
| 57 | Quality | Incomplete accessibility (no aria-pressed, no focus trap) |
| 58 | TypeScript | `as unknown as string` double-cast in reducer |
| 59 | TypeScript | `@types/*`, `eslint`, `typescript` in dependencies instead of devDependencies |
| 60 | Testing | No test factories for ShotRecord, RoundHole, ShotTrackingState |
| 61 | Testing | Schema rejection tests don't assert specific error messages |
| 62 | Testing | No coverage thresholds in test config |
| 63 | Documentation | `computeShotFingerprint` auto-save connection implicit |
| 64 | Documentation | `svix` dependency purpose undocumented |
| 65 | Documentation | No testing section in CLAUDE.md |
| 66 | DevOps | `crm_email_events` missing `occurred_at` index |
| 67 | DevOps | Webhook dedup uses `occurred_at` not svix delivery ID |
| 68 | DevOps | No `npm audit` step in CI |
| 69 | DevOps | No health check endpoint for webhook route |

---

## Findings by Category

| Category | Total | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| **Security** | 13 | 2 | 4 | 3 | 4 |
| **Data Integrity** | 4 | 2 | 2 | 0 | 0 |
| **Performance** | 14 | 3 | 5 | 4 | 2 |
| **Code Quality** | 12 | 0 | 1 | 5 | 6 |
| **Architecture** | 3 | 0 | 2 | 1 | 0 |
| **TypeScript** | 4 | 0 | 1 | 1 | 2 |
| **Testing** | 9 | 0 | 3 | 3 | 3 |
| **Documentation** | 11 | 0 | 4 | 4 | 3 |
| **DevOps** | 8 | 2 | 1 | 3 | 2 |
| **Totals** | **69** | **9** | **19** | **20** | **21** |

---

## Positive Findings (What Works Well)

1. **Type centralization**: `ShotRecord`, `HoleStats`, `RoundHole` moved to `@/lib/types/golf.ts` — eliminates importing types from UI components
2. **State machine extraction**: `useShotStateMachine` with proper `useReducer`, 27 typed action types, discriminated unions — massive improvement over scattered `useState`
3. **Atomic RPC**: `save_partial_round_atomic` wraps delete+insert in a single transaction, preventing crash-window data loss
4. **Zod schema hardening**: Removed `.passthrough()`, added UUID validation, exported schemas for testing
5. **Test additions**: `shot-helpers.test.ts` and `golf-schemas.test.ts` cover extracted utilities and validation
6. **CRM email tracking**: Well-designed webhook with Svix verification, idempotent upserts, admin-only RLS
7. **Calendar fix**: `||` to `??` correctly allows clearing optional fields
8. **Utility extraction**: `shot-helpers.ts` centralizes previously duplicated functions
9. **Consistent auth**: Every server action verifies authentication and ownership
10. **Sentry monitoring**: 100% trace sampling, session replays, source maps uploaded
11. **Discriminated union `ShotAction`**: Best-practice TypeScript with 27+ typed variants
12. **Proper `import type` usage** throughout the codebase

---

## Recommended Action Plan

### Immediate (Before Merge)

| # | Action | Effort | Risk |
|---|--------|--------|------|
| 1 | **Fix RPC auth**: Replace client `player_id` with `auth.uid()` lookup in `save_partial_round_atomic` | 15 min | Zero |
| 2 | **Fix `z.any()`**: Replace `holes: z.array(z.any())` with typed schema | 30 min | Low |
| 3 | **Extract `calculateHoleStats`** to module scope (zero-risk, fixes all memoization) | 10 min | Zero |
| 4 | **Add ref pattern** to `useEditShotModal` and `useUndoManager` for stale closure fix | 15 min | Low |
| 5 | **Fix reducer distance reset**: Use hole yardage instead of stale `distanceToHole` for empty history | 10 min | Low |
| 6 | **Safe migration `000002`**: Wrap JSON cast in PL/pgSQL exception handler, create backup table | 30 min | Low |

### This Sprint (After Merge)

| # | Action | Effort |
|---|--------|--------|
| 7 | Add Zod validation to all `round-drafts.ts` exports | 2 hrs |
| 8 | Add email validation to CRM send-email route | 30 min |
| 9 | Add `npm run test:run` to CI pipeline | 1 hr |
| 10 | Write state machine reducer unit tests (highest-value test target) | 4 hrs |
| 11 | Write `calculateShotDistanceWithDirection` unit tests | 1 hr |
| 12 | Consolidate save paths — choose one strategy per lifecycle | 4 hrs |
| 13 | Replace DELETE+INSERT with UPSERT in atomic RPC | 3 hrs |
| 14 | Add Sentry `captureException` to webhook error paths | 30 min |
| 15 | Update memory context files (hooks, tables, features) | 2 hrs |

### Next Sprint

| # | Action | Effort |
|---|--------|--------|
| 16 | Investigate and remove `ignoreBuildErrors: true` | 4-8 hrs |
| 17 | Lazy-load ShotTrackingComprehensive with `next/dynamic` | 30 min |
| 18 | Regenerate Supabase types to eliminate `as any` casts | 1 hr |
| 19 | Cache player/team context to reduce preamble queries | 2 hrs |
| 20 | Extract scorecard, shot input, edit modal to sub-components | 4 hrs |
| 21 | Add rollback documentation to all migrations | 1 hr |
| 22 | Add migration execution to CI (local Supabase) | 4 hrs |

---

## Review Metadata

- **Review date**: March 4, 2026
- **Phases completed**: 1 (Code Quality & Architecture), 2 (Security & Performance), 3 (Testing & Documentation), 4 (Best Practices & Standards), 5 (Consolidated Report)
- **Flags applied**: framework=nextjs
- **Total findings**: 69
- **Critical: 9 | High: 19 | Medium: 20 | Low: 21**
- **Review agents used**: code-reviewer, architect-review, security-auditor, general-purpose (performance, testing, documentation, framework, devops)
