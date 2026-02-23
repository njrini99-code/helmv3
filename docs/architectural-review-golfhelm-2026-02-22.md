# GolfHelm Architectural Review

**Date:** 2026-02-22
**Scope:** Full GolfHelm product -- server actions, components, CoachHelm V2 engine, types, stores, hooks, database
**Codebase Snapshot:** 42 action files, 282 components, 49 CoachHelm engine files, 75 golf tables, 114 migrations

---

## Executive Summary

The GolfHelm codebase implements a substantial golf team management + AI coaching platform atop Next.js App Router and Supabase. The overall architecture follows sensible patterns: server components by default for data fetching, client components where interactivity is needed, server actions for mutations, and a well-structured CoachHelm V2 AI pipeline. However, the rapid feature growth has introduced several structural weaknesses: a 4,760-line monolith action file, 14 duplicate `ActionResult` type definitions, pervasive type safety erosion through 177 eslint-disable directives in actions alone, and an inconsistent supabase client usage in the CoachHelm engine. The architecture is at a tipping point where continued feature growth without refactoring will compound these issues exponentially.

---

## Category 1: Server Action Architecture

### Finding 1 -- `golf.ts` is a 4,760-line God Module

**Severity:** Critical
**Architectural Impact:** High -- violates Single Responsibility, makes code discovery difficult, increases merge conflict risk, and bloats the import graph

The file `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/golf.ts` contains **41 exported async functions** spanning round management, event lifecycle, qualifiers, announcements, course management, shot editing, and test data seeding. This single file handles at least 7 distinct domains:

- Round submission and management (`submitGolfRound`, `submitGolfRoundComprehensive`, `deleteGolfRound`, `verifyRound`)
- In-progress round management (`savePartialRound`, `getInProgressRounds`, `loadInProgressRound`, `deleteInProgressRound`)
- Event CRUD (`createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent`)
- Qualifier management (`createGolfQualifier`, `updateQualifierStatus`, `getQualifierLeaderboard`)
- RSVP and scheduling (`respondToEvent`, `checkScheduleConflicts`, `getPlayerAvailability`)
- Coach blocked time (`addCoachBlockedTime`, `updateCoachBlockedTime`, `deleteCoachBlockedTime`)
- Saved courses (`getPlayerSavedCourses`, `savePlayerCourse`, `touchSavedCourse`)
- Shot editing (`deleteShot`, `updateShot`, `getRoundShotDetails`)

**Recommendation:** Decompose into domain-specific modules: `rounds.ts`, `qualifiers.ts` (or expand the existing one), `courses.ts`, `scheduling.ts`, `shots.ts`. Each should own a single bounded context. The existing `event-lifecycle.ts` pattern (265 lines, single concern) is the correct model.

---

### Finding 2 -- ActionResult Type is Defined 14 Times

**Severity:** High
**Architectural Impact:** Medium -- creates maintenance burden, inconsistent error contracts, and violates DRY

The `ActionResult<T>` discriminated union type is independently defined in **14 separate action files**:

```
golf.ts, stats.ts, round-drafts.ts, tasks.ts, communication.ts,
event-lifecycle.ts, attendance.ts, announcements.ts, player-notifications.ts,
recurring-events.ts, availability-locking.ts, availability-polling.ts,
caldav-sync.ts, calendar-feeds.ts
```

Worse, there are **two incompatible definitions** in circulation:

1. **Discriminated union** (correct): `{ success: true; data: T } | { success: false; error: string }` (golf.ts, stats.ts, round-drafts.ts)
2. **Interface with optional fields** (loose): `{ success: boolean; data?: T; error?: string }` (tasks.ts, event-lifecycle.ts, attendance.ts, and 8 others)

The interface variant allows `{ success: true, error: 'oops' }` or `{ success: false, data: someValue }` -- nonsensical states that a proper discriminated union prevents.

**Recommendation:** Extract a single `ActionResult<T>` type to `/Users/ricknini/Downloads/helmv3/src/lib/types/action-result.ts` and import it everywhere. Use the discriminated union form exclusively.

---

### Finding 3 -- 177 `eslint-disable` Directives in Server Actions

**Severity:** High
**Architectural Impact:** Medium -- indicates systematic type safety erosion

Across the 42 action files, there are **177 `eslint-disable` comments**, predominantly `@typescript-eslint/no-explicit-any`. The worst offenders:

| File | Count |
|------|-------|
| `caldav-sync.ts` | 26 |
| `tasks.ts` | 20 |
| `insights.ts` | 19 |
| `travel.ts` | 14 |
| `coachhelm-analytics.ts` | 13 |
| `pattern-management.ts` | 10 |
| `announcements.ts` | 10 |
| `task-templates.ts` | 12 |

The root cause is that several golf tables (`golf_task_assignments`, `golf_tasks`, `golf_coachhelm_settings`) are not present in the generated Supabase types, forcing developers to use type assertions like `.from('golf_task_assignments' as 'golf_shots')` -- casting one table name as another to bypass the type checker.

**Recommendation:** Regenerate the Supabase database types to include all 75 golf tables. This single action would eliminate the majority of these suppressions. For any remaining gaps, create a typed wrapper function rather than scattering casts.

---

### Finding 4 -- Duplicated Utility Functions Across Action Files

**Severity:** Medium
**Architectural Impact:** Low -- code duplication, risk of drift

The `formatTimezoneOffset()` helper function is independently defined in **5 action files**: `golf.ts`, `event-lifecycle.ts`, `availability-polling.ts`, `availability-locking.ts`, and `recurring-events.ts`. Each is an identical copy.

**Recommendation:** Extract to a shared utility in `/Users/ricknini/Downloads/helmv3/src/lib/utils/datetime.ts`.

---

### Finding 5 -- Inconsistent Auth Guard Patterns

**Severity:** Medium
**Architectural Impact:** Medium -- fragile security posture from ad-hoc auth checks

There are at least 4 different auth guard patterns used across actions:

1. **`requireAuth()` / `requireGolfCoach()` from `@/lib/auth/ownership`** -- Throws on failure (stats-data.ts, some newer files)
2. **Inline `supabase.auth.getUser()` + manual error return** -- Returns `{ success: false }` (event-lifecycle.ts, tasks.ts, most older files)
3. **Inline `supabase.auth.getUser()` + throw** -- Throws Error (stats-data.ts local `requireAuth`)
4. **`verifyGolfTeamOwnership()` from `@/lib/auth/ownership`** -- Separate ownership check (golf.ts)

The `@/lib/auth/ownership.ts` module defines proper reusable guards (`requireAuth`, `requireGolfCoach`, `requireGolfPlayer`), but most action files implement their own inline version instead.

**Recommendation:** Standardize on the `@/lib/auth/ownership` guards across all action files. Adopt a convention: server actions should use the throw-and-catch pattern with `formatSafeErrorResponse()` as the catch boundary (which already exists in several files).

---

### Finding 6 -- 337 console.log/error/warn Statements in Actions

**Severity:** Low
**Architectural Impact:** Low -- noisy production logs, no structured logging

There are 337 `console.error`/`console.warn`/`console.log` statements across the server action files. While error logging is appropriate in server actions, there is no structured logging layer (e.g., log levels, correlation IDs, structured JSON output).

**Recommendation:** Introduce a lightweight structured logger (even a thin wrapper around `console`) that tags logs with `[module:action]` and supports log levels for production filtering.

---

## Category 2: Component Architecture

### Finding 7 -- `GolfStatsDisplay.tsx` is 2,934 Lines

**Severity:** High
**Architectural Impact:** High -- monolithic component, poor testability, difficult to reason about

The file `/Users/ricknini/Downloads/helmv3/src/components/golf/stats/GolfStatsDisplay.tsx` is the largest component in the codebase at 2,934 lines. A component of this size almost certainly handles multiple concerns: data display, filtering, charting, and layout logic.

Other notably large components:
- `ShotTrackingComprehensive.tsx` -- 2,336 lines
- `IntelligenceCommandCenter.tsx` -- 1,763 lines
- `GolfSkeletons.tsx` -- 1,137 lines
- `PlayerHub.tsx` -- 1,039 lines

**Recommendation:** Decompose `GolfStatsDisplay` into sub-components by section: `StatsOverviewCard`, `StrokesGainedBreakdown`, `PuttingAnalysis`, `ApproachStats`, etc. The `stats/` directory already exists and can host these. Apply the same principle to `ShotTrackingComprehensive`.

---

### Finding 8 -- Client Components Used as Route Pages

**Severity:** Medium
**Architectural Impact:** Medium -- bypasses server-side data fetching, sends unnecessary JavaScript to client

Eight dashboard page files are marked `'use client'` at the top level:

- `alerts/page.tsx`
- `messages/page.tsx`
- `rounds/[id]/review/page.tsx`
- `my-qualifiers/page.tsx`
- `classes/page.tsx`
- `tasks/page.tsx`
- `settings/page.tsx`
- `settings/coaching-intelligence/page.tsx`

The `alerts/page.tsx` (reviewed in full) fetches data inside `useEffect` by calling a server action (`getCoachAlerts`), which means the page ships all component JS to the client, renders a loading skeleton, then fetches data. This is the "client-fetch waterfall" anti-pattern in Next.js App Router.

Compare with `hub/page.tsx`, which correctly uses a server component to fetch data and passes it to a `<PlayerHubWrapper>` client component -- the recommended pattern.

**Recommendation:** Convert these pages to server components that fetch data at the page level and pass it to interactive client child components. Use the `hub/page.tsx` pattern as the model. This eliminates loading waterfalls and reduces client JS bundle.

---

### Finding 9 -- Co-located Components Inside Route Directories

**Severity:** Low
**Architectural Impact:** Low -- inconsistent organization

Some route directories contain component subdirectories (e.g., `/dashboard/coachhelm/components/`, `/dashboard/components/`), while most components live in `/src/components/golf/`. This creates ambiguity about where to find or add components.

**Recommendation:** Consolidate all reusable components under `/src/components/golf/`. Reserve route-level co-location only for components that are truly route-specific and not shared.

---

## Category 3: CoachHelm V2 Engine Architecture

### Finding 10 -- Mixed Supabase Client Usage: Server vs Client

**Severity:** Critical
**Architectural Impact:** High -- `insight-persistence.ts` uses client-side Supabase in a library module, which will fail in server contexts

The file `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v2/services/insight-persistence.ts` imports from `@/lib/supabase/client`:

```typescript
import { createClient } from '@/lib/supabase/client';
```

Every other file in the CoachHelm V2 engine (18 files) correctly imports from `@/lib/supabase/server`. The `insight-persistence.ts` module would fail if invoked from a server action or server component context, as the browser-side Supabase client relies on browser APIs.

**Recommendation:** Change this import to `@/lib/supabase/server` to match all other engine files. If client-side persistence is genuinely needed, create a separate client-specific module.

---

### Finding 11 -- Orchestrator is a 1,509-line God Class

**Severity:** High
**Architectural Impact:** Medium -- single class with 30+ methods, mixes orchestration with data transformation

The `CoachHelmIntelligence` class in `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v2/orchestrator.ts` spans 1,509 lines with 4 public methods and approximately 26 private methods. Many of these private methods are type converters (`convertStatsInsightToComposed`, `convertCorrelationToComposed`, `convertShotCategoryInsightToComposed`, `convertDispersionInsightToComposed`, `convertRootCauseInsightToComposed`) that belong in a dedicated mapper/adapter module.

The class also contains display-formatting logic (`formatMissDirection`, `formatMetricName`, `formatCategoryHeadline`, `formatDispersionHeadline`) that belongs in a presentation utility.

**Recommendation:** Extract three concerns from the orchestrator:
1. **`insight-mapper.ts`** -- all `convert*ToComposed` methods
2. **`insight-formatter.ts`** -- all `format*` methods
3. Keep the orchestrator focused on coordination: calling pipeline stages and assembling results

---

### Finding 12 -- Excessive `as unknown as Record<string, unknown>` Casts

**Severity:** Medium
**Architectural Impact:** Medium -- type safety erosion at the core of the AI engine

The orchestrator contains 8 instances of `as unknown as Record<string, unknown>` casts, primarily when passing typed domain objects (like `MinedPattern`, `PerformancePrediction`) to the reasoning engine and NLG composer. This indicates the reasoning/NLG interfaces accept `Record<string, unknown>` when they should accept the concrete domain types or a proper union type.

**Recommendation:** Refactor the `ReasoningEngine.reason()` and `InsightComposer.compose()` interfaces to accept a discriminated union of the actual data types they handle, eliminating the need for unsafe casts.

---

### Finding 13 -- Singleton Pattern with Module-Level Instantiation

**Severity:** Medium
**Architectural Impact:** Medium -- prevents dependency injection, complicates testing

```typescript
export const coachHelmIntelligence = new CoachHelmIntelligence();
```

This module-level singleton at the bottom of `orchestrator.ts` makes it impossible to inject mock dependencies during testing or to configure different instances for different contexts. The class constructor hard-codes its dependencies (`new ReasoningEngine()`, `new ConfidenceCalibrator()`, etc.).

**Recommendation:** Adopt constructor injection. Pass dependencies (or a factory/config object) to the constructor, and export a factory function instead of a singleton.

---

### Finding 14 -- V1/V2 Engine Coexistence Without Clear Boundary

**Severity:** Medium
**Architectural Impact:** Medium -- confusing maintenance, unclear which modules are active

The CoachHelm engine directory contains both V1 modules (root-level files like `insight-engine.ts`, `pattern-detector.ts`, `round-review-generator.ts`, `strokes-gained.ts`, `summary-generator.ts`) and V2 modules (under `v2/`). There is no deprecation marker, feature flag, or explicit routing that clarifies which is active for which features.

**Recommendation:** Either deprecate V1 files with clear documentation (and a linting rule preventing new imports), or remove them if they are fully replaced. The `v2/gate.ts` module provides feature-flag infrastructure that could serve this purpose.

---

## Category 4: Data Model and Database

### Finding 15 -- Supabase Generated Types Are Out of Date

**Severity:** Critical
**Architectural Impact:** High -- root cause of widespread type safety issues

Multiple tables created via migrations are not in the generated TypeScript types:

- `golf_task_assignments` -- results in `.from('golf_task_assignments' as 'golf_shots')` casts
- `golf_coachhelm_settings` -- results in `.from('golf_coachhelm_settings' as 'users')` casts
- `golf_organizations` -- manually defined in `golf.ts` types

This is the single most impactful issue in the codebase. It is the root cause of:
- 177 eslint-disable directives in actions
- Unsafe table name casts
- Manually duplicated type definitions
- Runtime type mismatches

**Recommendation:** Run `supabase gen types typescript` against the production database and commit the updated types. Set up a CI step or pre-commit hook to detect drift.

---

### Finding 16 -- 75 Golf Tables With No Schema Documentation in Code

**Severity:** Medium
**Architectural Impact:** Low -- the `memory/context/golfhelm-database.md` document covers this, but nothing in the codebase itself

While the memory files provide excellent documentation, the codebase itself has no inline schema documentation. The `CACHE_TAGS` object (7 tags for 75 tables) is too coarse for targeted invalidation.

**Recommendation:** The current cache tag granularity is acceptable for now, but consider adding table-level tags as the system scales (e.g., `CALENDAR_EVENTS`, `QUALIFIERS`, `COACHHELM_INSIGHTS`).

---

### Finding 17 -- 114 Migration Files Without Squash Strategy

**Severity:** Low
**Architectural Impact:** Low -- development friction, slow migration replay

With 114 migration files accumulated, running a fresh migration set (e.g., for branches or new environments) takes longer than necessary.

**Recommendation:** Consider squashing historical migrations into a baseline schema periodically (e.g., quarterly). Supabase supports this workflow.

---

## Category 5: Type System and Dependencies

### Finding 18 -- Type Definitions Split Across Three Major Files

**Severity:** Medium
**Architectural Impact:** Medium -- developer confusion about import paths

Type definitions live in three separate locations:

| File | Lines | Scope |
|------|-------|-------|
| `src/lib/types/index.ts` | 1,283 | Baseball entities, recruiting, box scores |
| `src/lib/types/golf.ts` | 1,207 | Golf entities, manual type workarounds |
| `src/lib/coachhelm/v2/types.ts` | 796 | CoachHelm AI engine types |

The `index.ts` file is baseball-heavy (1,283 lines, of which approximately 900 are baseball-specific types), while golf types live in a separate file. The CoachHelm types are properly co-located with the engine. The CLAUDE.md instruction says to import from `@/lib/types`, but golf-specific imports often come from `@/lib/types/golf`.

**Recommendation:** This is acceptable for now given the multi-sport architecture. Consider creating a barrel export `@/lib/types/golf/index.ts` that re-exports both entity types and CoachHelm types for a single import path.

---

### Finding 19 -- Circular Dependency Risk: Actions Import from CoachHelm, CoachHelm Imports from Actions

**Severity:** Medium
**Architectural Impact:** Medium -- fragile import graph, potential runtime issues

The orchestrator uses a dynamic import to avoid a circular dependency:

```typescript
// orchestrator.ts line 965
const { getDetailedStats } = await import('@/app/golf/actions/stats-data');
```

This indicates that the CoachHelm engine (a library module) depends on a server action (an application module), which inverts the expected dependency direction. Library code should not depend on application-layer code.

**Recommendation:** Extract the `getDetailedStats` data-fetching logic into a shared service module under `src/lib/golf/stats-service.ts` that both the action and the orchestrator can import. This eliminates the circular dependency and restores proper dependency direction (app -> lib, not lib -> app).

---

## Category 6: State Management

### Finding 20 -- Auth State Duplicated Between Zustand Store and Context

**Severity:** Medium
**Architectural Impact:** Medium -- two sources of truth for user identity

The codebase has both:
- `useGolfAuthStore` (Zustand, persisted to localStorage) -- stores `user`, `coach`, `player`
- `useGolfUser()` context (React context) -- provides `coachId`, `teamId`, `playerId`

Components use them inconsistently. The alerts page uses `useGolfUser()` for IDs, while other components may use the Zustand store. This dual-source pattern creates synchronization risks.

**Recommendation:** Consolidate to a single source of truth. The React context (`useGolfUser`) is the better choice for server-rendered apps since it can be hydrated from server data. Use Zustand only for truly client-side ephemeral state (offline sync, UI preferences).

---

### Finding 21 -- Team Store Duplicates Team Data

**Severity:** Low
**Architectural Impact:** Low -- the `useTeamStore` defines its own `Team` interface separate from the database-derived types

The `Team` interface in `team-store.ts` is manually defined with 7 fields, while `GolfTeam` in `golf.ts` is derived from the database schema. These could drift apart.

**Recommendation:** Import the database-derived type and use `Pick<>` for the subset needed by the store.

---

### Finding 22 -- Offline Sync Store is Well-Architected

**Severity:** N/A (Positive Finding)
**Architectural Impact:** N/A

The `/Users/ricknini/Downloads/helmv3/src/stores/offline-sync-store.ts` is a well-structured Zustand store using `immer` for immutable updates, `persist` with selective serialization, proper `merge` handling for Date rehydration, and exported selectors. It follows best practices for complex client state management.

---

## Category 7: Design Patterns

### Finding 23 -- CoachHelm V2 Pipeline Pattern is Sound

**Severity:** N/A (Positive Finding)
**Architectural Impact:** N/A

The pipeline architecture (Features -> Mining -> Prediction -> Learning -> Reasoning -> NLG) is well-designed:
- Each stage has its own directory with clear responsibilities
- The orchestrator coordinates stages without leaking implementation details
- The `AnalysisOptions` type allows selective stage execution for performance
- Batch processing with `Promise.allSettled` for team-level analysis handles failures gracefully

The type system for the pipeline is particularly strong: `ExtractedFeatures`, `MinedPattern`, `CausalRelationship`, `PerformancePrediction`, `ReasoningResult`, and `ComposedInsight` create a clear data flow contract.

---

### Finding 24 -- Server Component Pages Follow a Good Pattern (When Used)

**Severity:** N/A (Positive Finding)
**Architectural Impact:** N/A

The `hub/page.tsx` demonstrates the correct Next.js App Router pattern:
1. Server component fetches data with `createClient()` from `@/lib/supabase/server`
2. Multiple parallel queries via `Promise.all()`
3. Data is transformed at the server level
4. A single client component receives the fully-shaped props

This pattern should be the template for all dashboard pages.

---

### Finding 25 -- Optimistic Updates Pattern is Correct

**Severity:** N/A (Positive Finding)
**Architectural Impact:** N/A

The `alerts/page.tsx` implements proper optimistic updates: state is updated immediately on user action, the server call is made, and on failure the state is rolled back to the previous value. This provides responsive UX while maintaining consistency.

---

## Category 8: Architectural Consistency

### Finding 26 -- Inconsistent Page Data Fetching Strategies

**Severity:** High
**Architectural Impact:** High -- different pages use fundamentally different data loading patterns

Three distinct data loading strategies coexist:

1. **Server Component Fetch** (hub, calendar, roster, stats, development, qualifiers) -- Data fetched at page level, passed as props
2. **Client-Side Fetch in useEffect** (alerts, messages, tasks, classes, settings) -- Page is `'use client'`, data fetched after mount
3. **Hybrid** (some pages) -- Server component page with client components that fetch additional data

This inconsistency means users experience different loading behaviors across pages: some render instantly with server data, others show skeletons while fetching. It also means the code lacks a predictable pattern for new feature development.

**Recommendation:** Adopt a single convention (server component pages with client interactive children) and document it in CLAUDE.md.

---

### Finding 27 -- No Input Validation Layer for Server Actions

**Severity:** High
**Architectural Impact:** High -- security and data integrity risk

While `golf.ts` imports `zod`, most server actions perform no input validation beyond null checks. Server actions are public API endpoints in Next.js -- any authenticated user can call them with arbitrary arguments.

For example, `completeTask(taskId)` in `tasks.ts` verifies the task exists and the player has an assignment, but does not validate that `taskId` is a valid UUID format before sending it to the database.

**Recommendation:** Add Zod validation schemas at the entry point of every server action that accepts user input. The existing import of `z` in `golf.ts` shows awareness of this need; extend it to all actions.

---

### Finding 28 -- Missing Authorization Boundary on Coach-Only Actions

**Severity:** High
**Architectural Impact:** High -- potential privilege escalation

Several coach-only actions (e.g., `generateAlerts`, pattern management operations) accept a `coachId` parameter from the client and verify the authenticated user matches that coach record. However, the verification is performed by each action individually with its own inline implementation. A missed check in any single action would expose a privilege escalation vulnerability.

**Recommendation:** Create a middleware-style decorator or wrapper function that enforces coach authorization before the action body executes. Example: `withCoachAuth(async (coach, supabase) => { ... })`.

---

### Finding 29 -- Inconsistent Error Response Patterns

**Severity:** Medium
**Architectural Impact:** Medium -- unpredictable client-side error handling

Different action files return errors in different shapes:

1. `{ success: false, error: 'message' }` (most actions)
2. `{ success: false, error: 'message' }` but with `error` being optional in the type (tasks, events)
3. Direct throw (stats-data.ts `requireAuth`)
4. `{ success: boolean; alerts?: CoachAlert[]; error?: string }` (alerts.ts -- custom shape)
5. `{ success: boolean }` only (roster.ts -- `RosterActionResult`)

**Recommendation:** Standardize on the discriminated union `ActionResult<T>` from finding 2 across all actions. For custom response shapes, extend via generics: `ActionResult<{ alerts: CoachAlert[] }>`.

---

### Finding 30 -- `revalidatePath` vs `updateTag` Inconsistency

**Severity:** Medium
**Architectural Impact:** Low -- some mutations may not properly invalidate cached data

Actions use a mix of `revalidatePath('/golf/dashboard')`, `revalidatePath('/golf/dashboard/calendar')`, and `updateTag(CACHE_TAGS.DASHBOARD)`. The relationship between path-based and tag-based invalidation is not documented, and some mutations use one, the other, or both.

**Recommendation:** Document the invalidation strategy. As a rule: use `updateTag` for data cache invalidation (affects `unstable_cache` calls), and `revalidatePath` for full route cache invalidation. They serve different purposes and both may be needed for a mutation.

---

## Category 9: Additional Findings

### Finding 31 -- V1 CoachHelm Files Still Present

**Severity:** Low
**Architectural Impact:** Low -- dead code confusion

The following V1 files remain alongside the V2 engine:
- `insight-engine.ts` (V1 insight system)
- `pattern-detector.ts` (V1 pattern detection)
- `round-review-generator.ts` (V1 round review)
- `strokes-gained.ts` (V1 strokes gained)
- `summary-generator.ts` (V1 summary)
- `highlight-detector.ts` (V1 highlights)
- `area-detector.ts` (V1 area detection)

**Recommendation:** Audit whether any of these are still imported. If fully replaced by V2, remove them or move to a `deprecated/` directory.

---

### Finding 32 -- Stats Actions Fragmented Across 3 Files

**Severity:** Medium
**Architectural Impact:** Medium -- confusing for developers deciding which stats action to use

Stats functionality is split across:
- `stats.ts` (266 lines) -- Cache-based stats (PlayerStatsSummary)
- `stats-v2.ts` (1,197 lines) -- Strokes Gained, trends, comparisons
- `stats-data.ts` (1,292 lines) -- Shot-level detailed stats

A developer working on stats must understand the division between these three files, which is not immediately obvious from the names. The naming also suggests `stats-v2.ts` is a version upgrade of `stats.ts`, but they serve different purposes.

**Recommendation:** Rename for clarity: `stats-cache.ts` (cache operations), `stats-analysis.ts` (trend analysis and strokes gained), `stats-shots.ts` (shot-level data). Or consolidate into a single `stats/` directory with explicit submodules.

---

### Finding 33 -- `GolfSkeletons.tsx` at 1,137 Lines

**Severity:** Low
**Architectural Impact:** Low -- single file containing all loading skeletons

While this is a large file, it serves as a centralized skeleton registry which makes it easy to find all loading states. However, if the design system changes, this file must be updated in many places.

**Recommendation:** Consider a composable skeleton system with primitives (`SkeletonLine`, `SkeletonCard`, `SkeletonChart`) that individual pages compose, rather than pre-built full-page skeletons.

---

### Finding 34 -- No Test Coverage Visible for Server Actions

**Severity:** Medium
**Architectural Impact:** Medium -- no safety net for refactoring

The `actions/__tests__/` directory exists but contains unknown content. Given the complexity of the action layer (4,760-line golf.ts, 42 files, 337 console statements suggesting debugging rather than testing), the test coverage for server actions appears minimal.

**Recommendation:** Prioritize integration tests for the most critical actions: `submitGolfRoundComprehensive`, `savePartialRound`, the CoachHelm orchestrator pipeline, and the auth guard patterns.

---

### Finding 35 -- Hook Architecture is Clean

**Severity:** N/A (Positive Finding)
**Architectural Impact:** N/A

The 15 hooks in `/Users/ricknini/Downloads/helmv3/src/hooks/golf/` follow a consistent naming convention (`use-*`), are exported through an `index.ts` barrel file, and cover well-defined domains: realtime subscriptions, offline sync, connection status, and team context. This is a well-organized part of the codebase.

---

## Summary of Recommendations (Priority Order)

### Must Fix (Critical)

1. **Regenerate Supabase types** to include all 75 golf tables -- eliminates the root cause of 177 eslint-disable directives and unsafe table casts
2. **Fix `insight-persistence.ts`** client/server Supabase import mismatch
3. **Decompose `golf.ts`** (4,760 lines, 41 functions) into domain-specific modules

### Should Fix (High)

4. **Consolidate `ActionResult<T>`** into a single shared type (discriminated union form)
5. **Add Zod validation** to all server action inputs
6. **Convert client-component pages** to server component pages (alerts, messages, tasks, etc.)
7. **Standardize auth guard pattern** across all actions using `@/lib/auth/ownership` guards
8. **Extract orchestrator concerns** (mappers, formatters) to reduce it from 1,509 lines

### Should Improve (Medium)

9. **Break up `GolfStatsDisplay.tsx`** (2,934 lines) and `ShotTrackingComprehensive.tsx` (2,336 lines)
10. **Fix dependency inversion** in CoachHelm orchestrator (extract stats service to lib layer)
11. **Rename stats action files** for clarity
12. **Consolidate auth state** (Zustand store vs context)
13. **Refactor reasoning/NLG interfaces** to accept domain types instead of `Record<string, unknown>`

### Nice to Have (Low)

14. Clean up V1 CoachHelm files
15. Squash migration history
16. Introduce structured logging
17. Build composable skeleton system
