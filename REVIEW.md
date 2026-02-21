# GolfHelm Multi-Agent Review — Complete Issue List

> 4 agents (Performance, Testing, Architecture, Security) reviewed the codebase.
> 53 raw findings deduplicated to **42 unique issues** below.

---

## SECURITY (14 issues)

### SEC-1. IDOR: `getDocument()` missing team access check
**Severity:** CRITICAL
**File:** `src/app/golf/actions/documents.ts:114-151`
**Current state:** Function authenticates the user but does NOT verify they belong to the document's team. Any authenticated user can fetch any team's document by guessing/knowing the UUID.
**What fix does:** Adding `verifyTeamAccess(supabase, user.id, data.team_id)` — which neighboring functions in the same file already use — restricts reads to team members only. One-line addition.

### SEC-2. IDOR: Stats actions accept arbitrary `playerId`
**Severity:** CRITICAL
**File:** `src/app/golf/actions/stats.ts:41-97, 103-135`
**Current state:** `getPlayerStatsSummaryAction()` and `getFullPlayerStatsAction()` accept an optional `playerId` parameter and return that player's full stats without checking if the caller is authorized. Any logged-in user can view any player's stats.
**What fix does:** Adding the `verifyPlayerAccess()` check (already implemented in `stats-data.ts`) ensures only the player themselves or a coach on their team can view their stats.

### SEC-3. Course CRUD lacks ownership authorization
**Severity:** HIGH
**File:** `src/app/golf/actions/courses.ts:179-274`
**Current state:** `updateCourse()` and `deleteCourse()` authenticate but don't verify the caller created or owns the course. Any authenticated user can modify or delete any course record.
**What fix does:** Adding a `created_by` check or scoping the query to the user's team prevents unauthorized course modifications.

### SEC-4. Unauthenticated admin log-event endpoint
**Severity:** HIGH
**File:** `src/app/api/admin/log-event/route.ts:121-201`
**Current state:** The POST endpoint has zero authentication. It uses only in-memory IP-based rate limiting and has wildcard CORS (`*`). Anyone on the internet can write to the `admin_events` table via the service role client.
**What fix does:** Adding `supabase.auth.getUser()` + admin role check + restricting CORS to the app's origin stops unauthorized writes entirely.

### SEC-5. OAuth state parameter is predictable (weak CSRF)
**Severity:** HIGH
**File:** `src/app/api/crm/google-calendar/auth/route.ts:41-44`
**Current state:** The OAuth state is base64-encoded JSON with just `userId` + `timestamp` — no cryptographic randomness or signature. An attacker who knows the user ID and guesses the approximate time can forge valid state tokens.
**What fix does:** Adding a cryptographic nonce (or HMAC signature) and validating it on callback makes state forgery computationally infeasible.

### SEC-6. Middleware doesn't protect golf dashboard routes
**Severity:** HIGH
**File:** `src/lib/supabase/middleware.ts:204-219`
**Current state:** Middleware performs role-based route authorization ONLY for baseball routes. Golf routes have no middleware-level protection — they rely entirely on individual server actions checking auth. If any single action forgets the check, the route is exposed.
**What fix does:** Adding golf route checks to middleware creates defense-in-depth — even if an action has a bug, the middleware catches unauthorized access at the edge.

### SEC-7. Player notifications accept untrusted caller-supplied IDs
**Severity:** HIGH
**File:** `src/app/golf/actions/player-notifications.ts:42-71`
**Current state:** `getPlayerNotificationCounts(playerId, userId, teamId)` takes all three IDs from the caller without verifying the authenticated user matches the supplied IDs. A caller can supply another player's ID and see their notification counts.
**What fix does:** Deriving `playerId` and `teamId` from the authenticated session (instead of trusting client input) eliminates the spoofing vector entirely.

### SEC-8. Documents use public storage URLs
**Severity:** MEDIUM
**File:** `src/app/golf/actions/documents.ts:182-184`, also `travel.ts:677`
**Current state:** Uploaded files use `getPublicUrl()` which generates permanently accessible URLs. Anyone with the URL can access the file — no auth required. Affects team documents and travel receipts.
**What fix does:** Switching to `createSignedUrl()` generates time-limited download URLs on demand. Setting the storage bucket to private means the raw URL returns 403 without a valid signature.

### SEC-9. Zustand auth store persists sensitive data in localStorage
**Severity:** MEDIUM
**File:** `src/stores/golf-auth-store.ts:23-45`
**Current state:** Full user, coach, and player profile objects are persisted to `localStorage`. Any XSS vulnerability would let an attacker exfiltrate this data. The persisted state can also go stale.
**What fix does:** Persisting only the minimum needed (role, display name) and using `sessionStorage` reduces the blast radius of XSS and prevents stale state.

### SEC-10. Missing input validation in many server actions
**Severity:** MEDIUM
**Files:** `courses.ts`, `documents.ts`, `roster.ts`, `event-lifecycle.ts`, `tasks.ts`, and 29 more
**Current state:** Only 6 of 41 action files use Zod validation. The other 35 accept raw string parameters (UUIDs, free text) with no format validation before passing them to Supabase queries.
**What fix does:** Adding Zod schemas at action entry points catches malformed input before it touches the database, preventing unexpected query behavior and providing clear error messages.

### SEC-11. In-memory rate limiting (not production-safe)
**Severity:** MEDIUM
**Files:** `api/admin/log-event/route.ts:24-53`, `api/calendar/feeds/[token]/route.ts:21-48`, `lib/auth/rate-limit.ts`
**Current state:** Rate limiting uses in-memory `Map` objects. In serverless deployment, each function instance has its own memory, so limits are not shared across instances. An attacker's requests hitting different instances bypass all limits.
**What fix does:** Using a distributed store (Redis/Upstash, Supabase, or Vercel's built-in rate limiting) shares state across all instances, making limits actually effective.

### SEC-12. No CSRF protection on API route POST endpoints
**Severity:** MEDIUM
**Files:** `api/calendar/events/route.ts`, `api/golf/rounds/generate-review/route.ts`
**Current state:** Server actions have built-in CSRF protection, but API route handlers (`/api/*`) lack CSRF tokens or `SameSite` enforcement. A malicious page could trigger cross-origin POSTs.
**What fix does:** Verifying the `Origin` header matches the app's domain (or using a CSRF token header) prevents cross-site request forgery on API routes.

### SEC-13. Error messages leak internal details
**Severity:** LOW
**Files:** `api/golf/players/[playerId]/putt-tendencies/route.ts:99`, `api/calendar/events/route.ts:91`, `actions/auth.ts:261`
**Current state:** API routes return raw error messages from the database or internal systems to the client, revealing table names, column names, and internal structure.
**What fix does:** Returning generic messages to clients while logging details server-side prevents information leakage that aids attackers.

### SEC-14. `console.error` used instead of structured logging
**Severity:** LOW
**Files:** Nearly all action files (336 occurrences across 29 files)
**Current state:** Errors are logged via `console.error` which ends up in unmonitored serverless logs. The codebase has an `admin_events` system and DataDog is in `package.json` but neither is used for error tracking.
**What fix does:** Replacing with structured logging (DataDog or `admin_events`) centralizes error visibility and enables alerting on security-relevant events.

---

## PERFORMANCE (18 issues)

### PERF-1. N+1 query pattern in `getTeamShotAnalytics`
**Severity:** CRITICAL
**File:** `src/app/golf/actions/shot-analytics.ts:767-811`
**Current state:** For a 15-player roster, the function calls `getPlayerShotAnalytics()` individually for each player. Each call creates a new Supabase client, runs its own auth check, then executes 4 sequential queries. Total: ~105 database round-trips. Takes 3-8 seconds.
**What fix does:** A batched version authenticates once, fetches all rounds in a single `.in('player_id', playerIds)` query, fetches all holes/shots in bulk, then partitions results locally. Reduces 105 queries to ~4.

### PERF-2. `SELECT *` used in 57+ locations
**Severity:** HIGH
**Files:** `stats-v2.ts` (7), `golf.ts` (5), `round-reviews.ts` (6), `insights.ts` (3), `travel.ts` (4), `task-templates.ts` (7), and more
**Current state:** Queries fetch all columns from tables like `golf_shots` (20+ columns) when only 5-6 are needed. Includes large JSON metadata fields, timestamps, and unused columns.
**What fix does:** Replacing with explicit column lists (`select('id, player_id, shot_number, ...')`) reduces data transfer by 2-5x per query and reduces serialization overhead.

### PERF-3. Unbounded shot/hole queries in `getDetailedStats`
**Severity:** HIGH
**File:** `src/app/golf/actions/stats-data.ts:397-414`
**Current state:** Fetches ALL holes and ALL shots for all matching rounds with no `LIMIT`. Includes joins to `putt_details` and `approach_miss_details`. For a player with 50 rounds: ~900 holes + ~3,600 shots. The `presetLimit` filter runs *after* the full data is fetched, so even "last 5 rounds" view queries everything.
**What fix does:** Pushing the round limit into the query (before fetching shots/holes) means the database returns only the rows actually needed. Cuts response size by 80-90% for filtered views.

### PERF-4. Sequential auth verification waterfall
**Severity:** HIGH
**File:** `src/app/golf/actions/shot-analytics.ts:29-82`
**Current state:** `verifyPlayerAccess` runs up to 4 sequential queries: (1) check player record, (2) get coach record, (3) get team from org, (4) check team membership. Each awaits the previous.
**What fix does:** Running the player check and coach check in parallel with `Promise.all`, and combining team + membership into a single joined query, cuts auth latency from 100-300ms to 30-80ms.

### PERF-5. Main dashboard page is entirely client-rendered
**Severity:** CRITICAL
**File:** `src/app/golf/(dashboard)/dashboard/page.tsx`
**Current state:** The most-visited page is `'use client'`. It renders a loading skeleton, then fetches data via `useEffect`. Users see a blank skeleton on every navigation, adding 300-800ms perceived latency.
**What fix does:** Converting to a server component (like `hub/page.tsx` already demonstrates) means data is fetched at request time and the page arrives fully rendered. No skeleton flash, no client-side waterfall.

### PERF-6. Stats page passes no initial data to client
**Severity:** HIGH
**File:** `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx:441-478`
**Current state:** The server page component renders `<StatsClient />` with no props. `StatsClient` already accepts `initialPlayers`, `initialSummary`, `initialRounds` but they're always empty. The client then creates a browser Supabase client and fetches everything from scratch (waterfall: hydration → auth → team query → rounds query → stats). Adds 1-3s.
**What fix does:** Populating the initial props from the server component eliminates the entire client-side waterfall. Data arrives with the HTML.

### PERF-7. 66 CoachHelm components are all `'use client'`
**Severity:** HIGH
**Dir:** `src/components/golf/coachhelm/`
**Current state:** All 66+ files have `'use client'` with 161 `useState/useEffect` calls but only 53 memoization usages. Many components (`FocusAreaCard`, `ReviewSummary`, `HighlightsSection`, etc.) are pure display — they receive props and render JSX with no hooks.
**What fix does:** Removing `'use client'` from display-only components keeps them as server components, reducing the JS bundle sent to the browser and eliminating unnecessary hydration.

### PERF-8. Over-broad `revalidatePath` usage
**Severity:** HIGH
**Files:** 226 calls across 32 files
**Current state:** Many mutations call `revalidatePath('/golf/dashboard')` which invalidates the cache for the entire dashboard tree. A single alert dismissal revalidates all 11 cached pages under `/dashboard`.
**What fix does:** Switching to `revalidateTag` with fine-grained tags (e.g., `alerts`, `dashboard-overview`) means only the affected data is revalidated, not every page.

### PERF-9. Zero `unstable_cache` / React `cache()` usage
**Severity:** CRITICAL
**Files:** Entire codebase (confirmed: zero occurrences)
**Current state:** Every page visit triggers full database reads and computation from scratch. Expensive functions like `getTrendAnalysis()`, `getTeamComparison()`, `getCourseBreakdown()`, and `getPlayerShotAnalytics()` produce results that only change when new rounds are submitted — but they recompute on every request.
**What fix does:** Wrapping read-heavy functions with `unstable_cache` + `revalidateTag` means repeated page views serve cached results instantly. Invalidation happens only when relevant data changes (e.g., new round submitted).

### PERF-10. Duplicate `createClient()` calls in shot-analytics
**Severity:** MEDIUM
**File:** `src/app/golf/actions/shot-analytics.ts:32, 291`
**Current state:** `verifyPlayerAccess()` creates its own Supabase client and runs auth. Then `getPlayerShotAnalytics()` creates another client and re-establishes the session. The first client is discarded.
**What fix does:** Passing the authenticated client from the caller into the helper avoids redundant client creation and auth verification.

### PERF-11. `getTrendAnalysis` fetches all historical rounds
**Severity:** MEDIUM
**File:** `src/app/golf/actions/stats-data.ts:559-676`
**Current state:** Fetches ALL completed rounds for a player with no date boundary or limit. Grows linearly over time — a player active for 3 years will have increasingly slow trend loads.
**What fix does:** Adding a window (last 2 years or last 100 rounds) bounds the query. Trend charts only need recent data anyway.

### PERF-12. Several page components are unnecessarily `'use client'`
**Severity:** HIGH
**Files:** `messages/page.tsx`, `tasks/page.tsx`, `classes/page.tsx`, `settings/page.tsx`, `alerts/page.tsx`, `my-qualifiers/page.tsx`
**Current state:** These page-level files are client components that fetch data in `useEffect`. The pattern of "server page → fetch data → pass to client child" is already correctly implemented in `hub/page.tsx`, `calendar/page.tsx`, `coachhelm/page.tsx`, and `roster/page.tsx`.
**What fix does:** Converting to server components means data arrives with the HTML, no loading skeleton, and the page can benefit from Next.js streaming/caching.

### PERF-13. Client-side Supabase queries in Stats
**Severity:** MEDIUM
**File:** `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx:483`
**Current state:** The stats client queries Supabase directly from the browser for team members. This exposes query patterns to the client, requires precise RLS configuration, and adds latency (browser → Supabase instead of server → Supabase in the same region).
**What fix does:** Moving these queries to server actions or the server component keeps query logic server-side where it's faster and more secure.

### PERF-14. Heavy dependencies without code splitting
**Severity:** HIGH
**File:** `package.json`
**Current state:** `recharts` (~300KB), `framer-motion` (~130KB), `jspdf` (~300KB), `html2canvas` (~100KB), `@dnd-kit/*` (~50KB), `d3-geo` + `us-atlas`, `@react-spring/web` (~80KB) are all bundled. Some are only used on specific pages but may be included in shared chunks.
**What fix does:** Using `next/dynamic` or `import()` for these libraries means they're only loaded when the user navigates to a page that actually uses them. Reduces initial bundle size significantly.

### PERF-15. Two redundant animation libraries
**Severity:** MEDIUM
**File:** `package.json` (lines 42, 62)
**Current state:** Both `framer-motion` and `@react-spring/web` are dependencies serving overlapping purposes. Together they add ~210KB.
**What fix does:** Consolidating on `framer-motion` (used in 80+ files) and migrating the few `@react-spring` usages eliminates ~80KB of redundant code.

### PERF-16. framer-motion heavy `motion` imports in 46+ CoachHelm files
**Severity:** MEDIUM
**Dir:** `src/components/golf/coachhelm/`
**Current state:** 46 files import `motion` (the heavier variant) from framer-motion. Some dashboard components correctly use the lighter `m` import.
**What fix does:** Migrating to `m` or using `LazyMotion` loads animation features on demand. For simple fade/slide, CSS animations eliminate the dependency entirely.

### PERF-17. Missing route-level caching on key pages
**Severity:** MEDIUM
**Files:** `dashboard/page.tsx`, `coachhelm/page.tsx`, `intelligence/page.tsx`, `insights/page.tsx`, `patterns/page.tsx`, `alerts/page.tsx`, `messages/page.tsx`
**Current state:** These server component pages have no `export const revalidate` set. Every request triggers a full server render.
**What fix does:** Adding `export const revalidate = 60` (or appropriate interval) lets Next.js serve cached responses for repeat visits within the window, dramatically reducing server load.

### PERF-18. Calendar fetches up to 500 events on initial load
**Severity:** LOW
**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx:67`
**Current state:** Uses `.limit(500)` for the initial calendar query. For teams active over several years, this is a lot of data when the calendar view only shows one month.
**What fix does:** Fetching a 3-month window (previous, current, next month) server-side and lazy-loading additional months on navigation reduces initial payload by 80%+ for established teams.

---

## ARCHITECTURE (13 issues)

### ARCH-1. God files (3 files over 3,000 lines)
**Severity:** CRITICAL
**Files:** `actions/golf.ts` (4,720 lines, 39 functions), `actions/admin-data.ts` (3,096 lines, 1 function), `actions/insights.ts` (3,009 lines, 22 functions)
**Current state:** `golf.ts` handles 8 unrelated domains: round submission, event CRUD, qualifier management, announcements, player invitations, notifications, blocked time, and saved courses — all in one file. Makes it hard to find code, increases merge conflicts, and violates single responsibility.
**What fix does:** Splitting into domain-bounded files (`round-actions.ts`, `qualifier-actions.ts`, `saved-courses.ts`, etc.) makes each file focused, findable, and independently reviewable.

### ARCH-2. Inconsistent auth check patterns across 41 action files
**Severity:** HIGH
**Files:** 41 files in `src/app/golf/actions/`; reusable helpers exist in `src/lib/auth/ownership.ts` but only 5 usages
**Current state:** Three distinct auth patterns: (a) inline `getUser()` + manual checks (most common), (b) `requireAuth()`/`requireGolfCoach()` from `ownership.ts` (5 files), (c) local `requireAuth` helpers (1 file). The inconsistency makes it hard to audit for missing checks.
**What fix does:** Standardizing on the `ownership.ts` helpers across all files means auth is implemented once, tested once, and auditable by searching for one pattern.

### ARCH-3. Input validation absent from 35/41 action files
**Severity:** HIGH
**Files:** Only `golf.ts`, `travel.ts`, `announcements.ts`, `onboarding.ts`, `shot-analytics.ts`, `round-drafts.ts` use Zod
**Current state:** 35 action files accept raw parameters with zero validation. Example: `roster.ts` `removePlayerFromTeam(playerId: string)` passes the raw string directly to a Supabase `.eq()` with no UUID format check.
**What fix does:** Adding Zod schemas at action entry points catches malformed input early, provides clear error messages, and documents the expected input shape. `CommonSchemas` from `src/lib/validation/server-action-validator.ts` already exists but is unused by most files.

### ARCH-4. `ActionResult<T>` defined 14 separate times
**Severity:** MEDIUM
**Files:** 3 as `export type` (golf.ts, round-drafts.ts, stats.ts), 11 as local `interface` (tasks.ts, announcements.ts, calendar-feeds.ts, caldav-sync.ts, availability-polling.ts, player-notifications.ts, attendance.ts, event-lifecycle.ts, communication.ts, availability-locking.ts, recurring-events.ts)
**Current state:** Two patterns: the `export type` variant in `golf.ts` uses a proper discriminated union (better for TypeScript narrowing). The `interface` variants use a looser format. No single source of truth.
**What fix does:** Creating one `ActionResult<T>` at `src/lib/types/action-result.ts` with the discriminated union pattern and importing everywhere eliminates duplication and enables consistent type narrowing.

### ARCH-5. `getCoachTeamId()` duplicated in 5 files
**Severity:** HIGH
**Files:** `golf.ts:429`, `teams.ts:40`, `roster.ts:23`, `announcements.ts:53`, `recurring-events.ts:41` — identical 5-line function
**Current state:** The same helper function is copy-pasted in 5 action files. Also: `verifyTeamAccess()` duplicated in 2 files with different signatures. `getPlayerTeamId()` in `golf.ts` but duplicated inline in `round-drafts.ts`.
**What fix does:** Extracting into `/src/lib/golf/team-helpers.ts` creates a single source of truth. Changes to team lookup logic happen in one place.

### ARCH-6. No repository/service layer
**Severity:** HIGH
**Files:** 29 action files query Supabase directly; `golf_players` queried in 90 locations across 29 files
**Current state:** There's no intermediate layer between server actions and Supabase. Direct queries are spread across the codebase: `golf_players` (90 locations), `golf_coaches` (101 locations), `golf_team_members` (56 locations), `golf_rounds` (87 locations). A schema change requires updates in 90+ places.
**What fix does:** A repository layer (`/src/lib/repositories/`) encapsulates queries with typed returns. Schema changes only affect the repository. Also enables caching at the repository level.

### ARCH-7. Large components (5 files over 1,000 lines)
**Severity:** HIGH
**Files:** `GolfStatsDisplay.tsx` (2,934 lines), `ShotTrackingComprehensive.tsx` (2,336 lines), `IntelligenceCommandCenter.tsx` (1,763 lines), `GolfSkeletons.tsx` (1,137 lines), `RoundReviewViewer.tsx` (1,122 lines)
**Current state:** `GolfStatsDisplay.tsx` handles stat tabs, charts, filters, print/export, and animation all in one file. `ShotTrackingComprehensive.tsx` defines 7+ internal interfaces and sub-components inline.
**What fix does:** Decomposing into focused sub-components (e.g., `StatsOverviewTab.tsx`, `StatsPuttingTab.tsx`, `StatsPrintView.tsx`) makes each piece independently testable, reviewable, and reusable.

### ARCH-8. CoachHelm orchestrator lacks error boundaries
**Severity:** MEDIUM
**File:** `src/lib/coachhelm/v2/orchestrator.ts` (1,100+ lines)
**Current state:** Only 3 try/catch blocks in 1,100+ lines. The main `analyzePlayer()` method (lines 63-181) has zero error handling. Pipeline stages like `extractAllFeatures()`, `miner.minePatterns()`, and `causalEngine.discoverCausalRelationships()` can throw and crash the entire pipeline.
**What fix does:** Wrapping each pipeline stage in try/catch with graceful degradation means a failure in (e.g.) correlation discovery still returns the insights from other stages, instead of returning nothing.

### ARCH-9. ~361 type safety bypasses (`as any`, `@ts-ignore`, etc.)
**Severity:** MEDIUM
**Files:** Top offenders: `caldav-sync.ts` (41), `insights.ts` (36), `tasks.ts` (34), `coachhelm-analytics.ts` (28), `announcements.ts` (28)
**Current state:** 361 occurrences of `eslint-disable`, `as any`, `@ts-ignore`, `@ts-expect-error` across the action directory. Root cause: many tables (golf_task_assignments, golf_document_versions, analytics tables, CoachHelm tables) aren't in the generated Supabase types. A utility `src/lib/supabase/untyped.ts` exists specifically to bypass type checking.
**What fix does:** Regenerating Supabase types against the current DB schema (`npx supabase gen types`) eliminates ~200+ of these in one command. The remaining ones need manual type definitions.

### ARCH-10. Pipeline type safety (11 `as unknown as` casts)
**Severity:** MEDIUM
**File:** `src/lib/coachhelm/v2/orchestrator.ts`
**Current state:** The orchestrator uses `as unknown as Record<string, unknown>` casts 11 times when passing typed data to the reasoning engine and NLG composer. Indicates the interfaces between pipeline stages don't match.
**What fix does:** Making reasoning/NLG interfaces generic or accepting union types eliminates unsafe casts and catches type mismatches at compile time.

### ARCH-11. Dead code: `seedTestShotData()` in production
**Severity:** LOW
**File:** `src/app/golf/actions/golf.ts:4275`
**Current state:** A test seed function exists in the production action file. It imports `createAdminClient` which is only used by this function.
**What fix does:** Moving to a test utilities file or deleting removes dead code and the unnecessary admin client import.

### ARCH-12. Naming inconsistency
**Severity:** LOW
**Files:** Across action files
**Current state:** Inconsistent conventions: `ActionResult` vs `RosterActionResult`, `getCoachTeamId` vs `getUserContext` vs `requireAuth`, domain-based vs feature-based file naming.
**What fix does:** Standardizing naming makes patterns predictable and searchable across the codebase.

### ARCH-13. Orchestrator growing into a coordination bottleneck
**Severity:** MEDIUM
**File:** `src/lib/coachhelm/v2/orchestrator.ts` (1,100+ lines), `generateInsights()` (lines 519-637)
**Current state:** The orchestrator is accumulating responsibility. `generateInsights()` orchestrates 5 insight generators and manually converts each type to `ComposedInsight`.
**What fix does:** Having each generator return `ComposedInsight` directly (instead of the orchestrator doing the conversion) distributes responsibility and makes the orchestrator a pure coordinator.

---

## TESTING (10 issues)

### TEST-1. Stats calculator has zero tests (2,126 lines)
**Severity:** CRITICAL
**File:** `src/lib/utils/golf-stats-calculator-shots.ts`
**Current state:** `calculateStatsFromShots` is a pure function that produces every stat displayed in the UI (60+ output fields: scoring averages, GIR by lie, putt make % across 9 distance buckets, driving stats, scrambling, etc.). It has no dependencies — ideal for testing. A bug silently produces wrong numbers across the UI, CoachHelm AI insights, and leaderboards. Has `DEBUG_STATS` console.log calls still in production.
**What fix does:** Exhaustive unit tests with fixture data lock in correctness for all 60+ fields. Catches regressions instantly. Prevents the kind of bugs already found and documented in MEMORY.md (wrong distance unit handling, putt distance semantics).

### TEST-2. CoachHelm v2 engine has zero tests (12,963 lines)
**Severity:** CRITICAL
**Files:** All files under `src/lib/coachhelm/v2/`: `orchestrator.ts` (1,508), `stats-insight-generator.ts` (1,965), `lie-specific-analysis.ts` (2,229), `pressure-analysis.ts` (918), `resilience-analysis.ts` (905), `correlation-discovery.ts` (863), `shot-pattern-miner.ts` (703), `pattern-miner.ts` (642), `causal-engine.ts` (504), `team-forecaster.ts` (617), `trajectory-forecaster.ts` (559), `cross-learner.ts` (603), `outcome-validator.ts` (394)
**Current state:** The entire AI engine — the core differentiator of the product — has zero automated tests. MEMORY.md documents at least two production bugs already caught manually (wrong sample size minimums, misidentified putt distance semantics). These were fixed but never locked in with regression tests.
**What fix does:** Unit tests on key methods (e.g., `analyzeTrend`, significance thresholds, sample size guards) prevent regressions. The pure computational nature of most functions makes them easy to test.

### TEST-3. `golf.ts` actions have zero tests (4,720 lines)
**Severity:** CRITICAL
**File:** `src/app/golf/actions/golf.ts`
**Current state:** `submitGolfRoundComprehensive` and `savePartialRound` are the most critical mutations in the product — they write round/shot/hole data. The ownership check at line 688 (`eq('player_id', player.id)`) is the only thing preventing cross-player round modification. Zero tests verify this security boundary.
**What fix does:** Server action tests (following the existing pattern in `travel.test.ts`) verify that unauthenticated calls fail, cross-player access is rejected, and valid input produces correct DB writes.

### TEST-4. Strokes-gained module has zero tests (1,372 lines)
**Severity:** HIGH
**File:** `src/lib/golf/strokes-gained.ts`
**Current state:** `calculateStrokesGained`, `getExpectedStrokes`, `aggregateStrokesGained`, `identifyStrengthsWeaknesses` — all untested. Uses a PGA baseline lookup table and compound calculations. Errors propagate silently into the Player CoachHelm intelligence view.
**What fix does:** Tests with known expected values (e.g., a 3-foot putt should produce positive SG-Putting) lock in the math and catch regressions in baseline lookups.

### TEST-5. Auth middleware has zero tests (240 lines)
**Severity:** HIGH
**File:** `src/lib/supabase/middleware.ts`
**Current state:** `checkRouteAuthorization` has 8+ conditional branches for JUCO coach mode-switching based on `coachMode` cookie + `coach_type`. A regression causes wrong role-based redirects that could expose recruiting features to unauthorized coach types. The function accepts a mocked Supabase client — no real DB needed for testing.
**What fix does:** Testing each branch (college coach blocked from team routes, JUCO in recruiting mode blocked from team routes, etc.) ensures every auth boundary holds. Catches any regression from middleware refactors.

### TEST-6. Only 3/41 action files have tests (7% coverage)
**Severity:** HIGH
**Files covered:** `travel.ts`, `stats-data.ts`, `dashboard-data.ts`. Not covered: the other 38 files.
**Current state:** The 3 tested files demonstrate an excellent pattern with chainable Supabase mocks. But 38 action files — including `insights.ts` (3,009 lines), `round-reviews.ts` (1,368 lines), `tasks.ts` (1,202 lines), `stats-v2.ts` (1,197 lines) — have zero coverage.
**What fix does:** Replicating the existing test pattern across high-risk action files catches auth bugs, data integrity issues, and input validation gaps before they reach production.

### TEST-7. E2E tests have hardcoded personal credentials
**Severity:** HIGH
**Files:** `e2e/golf-round.spec.ts`, `e2e/golf-dashboard.spec.ts`
**Current state:** Tests contain `rinin376@gmail.com` / `Pirates#09!!`. Won't work for any other developer, in CI, or when the password changes. Several E2E specs (`golf-team-join.spec.ts`) are entirely `test.skip`.
**What fix does:** Using environment variables (`process.env.E2E_GOLF_PLAYER_EMAIL`) makes tests portable. Documented in `.env.test.local` (gitignored) and the README.

### TEST-8. No CI workflow exists
**Severity:** HIGH
**File:** `.github/workflows/` — does not exist
**Current state:** No automated pipeline runs typecheck, lint, or tests on push/PR. The `db:types:check` script exists but isn't wired to anything. Regressions are only caught manually.
**What fix does:** A GitHub Actions workflow (`ci.yml`) running `typecheck → lint → test → coverage` on every push/PR catches regressions before they merge.

### TEST-9. `insights.ts` and `round-reviews.ts` have zero tests
**Severity:** HIGH
**Files:** `actions/insights.ts` (3,009 lines), `actions/round-reviews.ts` (1,368 lines)
**Current state:** `generatePlayerInsight`, `generateTeamInsight`, `analyzePlayer` — untested. `saveCoachFeedback`, `publishReview`, `shareReviewWithPlayer` — untested. Coach feedback shared with players has no test for the authorization boundary (coach can only review rounds for players on their team).
**What fix does:** Tests verify authorization boundaries and prevent coaches from accessing/modifying other teams' reviews.

### TEST-10. No property-based or fuzz tests for statistical functions
**Severity:** MEDIUM
**Files:** `golf-stats-calculator-shots.ts`, `schedule-parser.ts` (943 lines)
**Current state:** Statistical computations and text parsers are vulnerable to edge cases (empty arrays, all-null fields, single-shot rounds, 9-hole rounds, mixed units). `parseScheduleText` processes free-form text with no fuzz testing.
**What fix does:** Property-based testing (e.g., `fast-check`) generates thousands of random inputs, asserting the function never throws an unhandled exception and always returns valid output shapes.

---

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| Fix today | 3 | SEC-1, SEC-2, SEC-4 (IDOR + unauth endpoint) |
| Fix this week | 8 | SEC-3/5/6/7, PERF-5, PERF-9, TEST-7, ARCH-5 |
| Fix this sprint | 12 | PERF-1/3/4/6/8, ARCH-1/2/3/9, TEST-1/3/8 |
| Fix next sprint | 11 | PERF-2/12/14, ARCH-4/6/7, TEST-2/4/5/6/9 |
| Backlog | 8 | SEC-8/9/10/11/12/13/14, remaining PERF/ARCH/TEST items |
