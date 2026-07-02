# W15: Total Error-Capture Coverage — feature column, feature registry, batched instrumentation

**Goal:** Every GolfHelm + CoachHelm server action (424 exports; CRM excluded, baseball/lifting deferred) runs inside `withAdminObserved({sport,feature,…})`; every capture lands in `admin_events` tagged with a canonical `feature` key; RLS-denial detection is centralized; a `get_feature_health()` RPC serves the W16 board — all without changing any wrapped function's behavior.

**Spec:** `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` (canonical registry, matrix, noise charter — read §0–§2 before starting ANY task).

**Depends-on:** W2 (admin_events bridge columns + ACL), W3 (RPC gate pattern), W6 (`withAdminObserved`, `rls-denial.ts`, Errors tab).

**PR-scope:** One PR per task-group: Tasks 1–4 = PR "w15-foundation"; each instrumentation batch (Tasks 5–14) = its own PR (≤15 files each); Task 15 = PR "w15-rls-centralization". Gate per PR: `npm run typecheck` + `npm run lint` + `npm test`.

**Hard rules (owner noise directive — apply to EVERY task):**
- Wrapper logging is fire-and-forget; NEVER alters a live request (contract: src/lib/admin/observed-action.ts:6-7).
- NEXT_REDIRECT / NEXT_NOT_FOUND are control flow, never logged (observed-action.ts:10-15 already handles; do not re-implement).
- Validation rejections returned as `{success:false}` envelopes are NOT errors — never convert returns to throws while wrapping.
- NEVER touch: `crm-*.ts`, `resend-activity.ts`, anything under `src/app/baseball/**`, `src/app/lifting/**`, `src/lib/baseball/**`, `src/lib/lifting/**`, `src/app/api/log-error/route.ts`, `src/app/api/admin/log-event/route.ts` (self-referential sinks), `src/app/api/inngest/route.ts` (serve() factory), the 19 already-instrumented `/api/cron/**` handlers.
- Wrap pattern is Impl+delegator ONLY (spec §2.3, exemplar golf.ts:4942-4961) — `export const x = withAdminObserved(...)` breaks Next's build in golf's 'use server' files.

---

### Task 1 — MIGRATION: `admin_events.feature` + `get_feature_health()` RPC

**Files**
- Create: `supabase/migrations/20260702090000_admin_events_feature_health.sql`

**Steps**

- [ ] 1. Write the migration exactly as below (additive column BEFORE any emitter references it — schema-drift gotcha; ends with REVOKE + ACL assert; PRESERVES the W2 legacy `authenticated SELECT/UPDATE` on admin_events per 20260701120000_admin_events_bridge_columns.sql:62-66):

```sql
-- W15: feature-tagged error capture + feature-health rollup.
-- ADDITIVE ONLY on admin_events (live writers stay backward-compatible; the
-- column must land BEFORE src/lib/server-error-logger.ts starts writing it).

ALTER TABLE public.admin_events
  ADD COLUMN IF NOT EXISTS feature text;

COMMENT ON COLUMN public.admin_events.feature IS
  'Canonical feature key from src/lib/admin/feature-registry.ts (FEATURE_COVERAGE.md §1). '
  'Free text by design — the feature vocabulary grows faster than sports/sources; '
  'validity is enforced app-side by the FeatureKey type + contract tests.';

CREATE INDEX IF NOT EXISTS idx_admin_events_feature_created
  ON public.admin_events (feature, created_at DESC)
  WHERE feature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_events_feature_unresolved
  ON public.admin_events (feature, severity)
  WHERE NOT resolved AND feature IS NOT NULL;

-- ── get_feature_health(p_features jsonb) ────────────────────────────────────
-- One round-trip rollup for the Feature Health board (W16). Same gate pattern
-- as get_active_sessions / resolve_admin_event
-- (20260701130000_bridge_rpcs_sessions_resolve.sql): SECURITY DEFINER in
-- public, internal is_super_admin() gate, authenticated EXECUTE only.
-- Input: jsonb array of {"key": text, "heartbeat_table": text|null}.
-- NOISE DISCIPLINE (FEATURE_COVERAGE.md §0): fingerprint counts include ONLY
-- severity error/critical; warnings + info are returned as separate drill-in
-- counts and can never drive a dot; RLS denials get their own counters.
CREATE OR REPLACE FUNCTION public.get_feature_health(p_features jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  f jsonb;
  v_key text;
  v_table text;
  v_heartbeat timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_features IS NULL
     OR jsonb_typeof(p_features) <> 'array'
     OR jsonb_array_length(p_features) > 100 THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of <= 100 feature descriptors';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    v_key := f->>'key';
    CONTINUE WHEN v_key IS NULL OR length(v_key) > 64;

    -- Heartbeat: dynamic MAX(created_at) against a caller-supplied table name.
    -- HARD allowlist guard — never trust the jsonb input raw: the table must
    -- (a) match an approved prefix and (b) exist with a created_at column.
    v_table := f->>'heartbeat_table';
    v_heartbeat := NULL;
    IF v_table IS NOT NULL
       AND (v_table LIKE 'golf\_%' OR v_table IN ('admin_events', 'error_logs'))
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = 'created_at')
    THEN
      EXECUTE format('SELECT max(created_at) FROM public.%I', v_table)
        INTO v_heartbeat;
    END IF;

    v_result := v_result || jsonb_build_object(
      'key', v_key,
      'events_24h', COALESCE((
        SELECT jsonb_build_object(
          'total',               count(*),
          'errors',              count(*) FILTER (WHERE severity IN ('error','critical')),
          'critical_unresolved', count(*) FILTER (WHERE severity = 'critical' AND NOT resolved),
          'warnings',            count(*) FILTER (WHERE severity = 'warning' AND source <> 'rls_denial'),
          'fingerprints',        count(DISTINCT fingerprint) FILTER (WHERE severity IN ('error','critical')),
          'rls_denials',         count(*) FILTER (WHERE source = 'rls_denial'),
          'rls_denial_fingerprints', count(DISTINCT fingerprint) FILTER (WHERE source = 'rls_denial'),
          'rls_denial_users',    count(DISTINCT user_id) FILTER (WHERE source = 'rls_denial')
        )
        FROM public.admin_events
        WHERE feature = v_key
          AND created_at >= now() - interval '24 hours'), '{}'::jsonb),
      'top_signatures', COALESCE((
        SELECT jsonb_agg(sig ORDER BY (sig->>'count')::int DESC)
        FROM (
          SELECT jsonb_build_object(
            'fingerprint', fingerprint,
            'title',       min(title),
            'count',       count(*),
            'first_seen',  min(created_at),
            'last_seen',   max(created_at),
            'severity',    CASE WHEN bool_or(severity = 'critical') THEN 'critical' ELSE 'error' END,
            'resolved',    bool_and(resolved)
          ) AS sig
          FROM public.admin_events
          WHERE feature = v_key
            AND created_at >= now() - interval '24 hours'
            AND severity IN ('error','critical')
            AND fingerprint IS NOT NULL
          GROUP BY fingerprint
          ORDER BY count(*) DESC
          LIMIT 5
        ) top5), '[]'::jsonb),
      'fingerprints_prev_24h', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'errors_prev_24h', (
        SELECT count(*)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'fingerprints_7d', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '7 days'),
      'integrity_status', (
        SELECT CASE WHEN severity IN ('error','critical') THEN 'fail' ELSE 'pass' END
        FROM public.admin_events
        WHERE feature = v_key AND source = 'integrity'
        ORDER BY created_at DESC
        LIMIT 1),
      'heartbeat_last_activity', v_heartbeat
    );
  END LOOP;

  RETURN v_result;
END;
$$;

-- ── Safety rails (W3 pattern) ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_feature_health(jsonb) FROM PUBLIC, anon, authenticated;
-- authenticated EXECUTE required: invoked with the super admin's user-scoped
-- JWT (internal is_super_admin() gate does the real filtering). anon: NOTHING.
GRANT EXECUTE ON FUNCTION public.get_feature_health(jsonb) TO authenticated;

DO $$
DECLARE
  v_fn oid;
BEGIN
  -- Column landed.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_events' AND column_name = 'feature'
  ) THEN
    RAISE EXCEPTION 'Column check failed: admin_events.feature missing';
  END IF;

  -- Re-assert the W2 ACL contract on admin_events: anon NOTHING, authenticated
  -- no INSERT, and the legacy authenticated SELECT/UPDATE (still needed by
  -- /golf/admin until W14 retirement) is intact.
  IF has_table_privilege('anon', 'public.admin_events', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_events', 'INSERT')
     OR has_table_privilege('anon', 'public.admin_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.admin_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.admin_events', 'INSERT') THEN
    RAISE EXCEPTION 'ACL check failed: admin_events over-granted (anon any / authenticated INSERT)';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.admin_events', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.admin_events', 'UPDATE') THEN
    RAISE EXCEPTION 'ACL check failed: legacy authenticated SELECT/UPDATE on admin_events was dropped (breaks /golf/admin)';
  END IF;

  -- RPC ACL: anon must NOT execute; authenticated must.
  SELECT p.oid INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_feature_health';

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: get_feature_health missing authenticated EXECUTE';
  END IF;
END $$;
```

- [ ] 2. Verify locally against the dev stack (or Supabase branch):
  ```bash
  supabase db push --dry-run   # or: supabase migration up on a local shadow db
  ```
  Then verify actual application (schema_migrations is UNRELIABLE — check information_schema per project gotcha):
  ```sql
  SELECT column_name FROM information_schema.columns
   WHERE table_name='admin_events' AND column_name='feature';
  SELECT public.get_feature_health('[{"key":"round_tracking","heartbeat_table":"golf_rounds"}]'::jsonb);
  -- as super admin JWT → jsonb array; as anon → permission denied for function.
  ```
- [ ] 3. Confirm rejection paths: `p_features` non-array raises; `heartbeat_table` of `'users; DROP TABLE x'` or `'pg_authid'` yields `heartbeat_last_activity: null` (allowlist), never executes.

---

### Task 2 — Thread `feature` through the emitters (+ flood collapse)

**Files**
- Modify: `src/lib/server-error-logger.ts`
- Modify: `src/lib/admin/observed-action.ts`
- Modify: `src/lib/admin/rls-denial.ts`
- Create: `src/lib/admin/emit-throttle.ts`
- Create/extend tests: `src/lib/admin/__tests__/observed-action.test.ts`, `src/lib/admin/__tests__/rls-denial.test.ts`, `src/lib/admin/__tests__/emit-throttle.test.ts`

**Interfaces (additive only — no call-site breaks):**
```typescript
// server-error-logger.ts — RoundErrorContext gains:
feature?: string | null;   // canonical FeatureKey; written to admin_events.feature
// writeAdminTables adminEventInsert (next to sport at line 178):
feature: context.feature ?? context.featureArea ?? null,
// normalizeContext + captureSentryTrace: scope.setTag('feature', context.feature ?? context.featureArea ?? 'unknown')
// (keep the existing 'feature_area' tag at line 198 for continuity of saved Sentry searches)

// observed-action.ts:
export function withAdminObserved<Args extends unknown[], R>(
  name: string,
  opts: { sport?: 'golf' | 'baseball' | 'shared'; feature?: FeatureKey; featureArea?: string },
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R>;
// passes feature: opts.feature ?? null AND featureArea: opts.featureArea ?? opts.feature ?? null

// rls-denial.ts — ctx gains feature?: FeatureKey; when omitted, defaults via
// featureForTable(ctx.table) from the registry (Task 3).

// emit-throttle.ts (noise rule N4 — a loop can never flood admin_events):
export function shouldEmit(key: string, windowMs?: number): boolean; // default 60_000
export function drainCollapsedCount(key: string): number;
// withAdminObserved computes key = `${name}:${errCode ?? errName}`; when
// suppressed, increments the counter; the next allowed emit attaches
// metadata.collapsed_count. Per-process Map with LRU cap 500 — best-effort
// (serverless instances reset), which is exactly enough to stop tight loops.
```

**Steps**

- [ ] 1. Failing tests first:
  - `observed-action.test.ts`: wrapper passes `feature` through to `logServerException` context; still rethrows; still skips NEXT_REDIRECT; identical resolve value; 100 immediate identical failures produce ≤2 logger calls (throttle) and the second call carries `metadata.collapsed_count >= 98`.
  - `rls-denial.test.ts`: `feature` present in emitted context; defaulted from table map when omitted.
  - `emit-throttle.test.ts`: window semantics, distinct keys independent, counter drain, LRU cap.
  ```bash
  npm run test:run -- src/lib/admin/__tests__/
  ```
  Expected: FAIL (new expectations).
- [ ] 2. Implement `emit-throttle.ts`; wire into `withAdminObserved`'s catch (throttle wraps ONLY the logging, never the rethrow).
- [ ] 3. Add `feature` to `RoundErrorContext`, `normalizeContext`, `writeAdminTables` insert, Sentry tag. ONE line each, mirroring `sport` (server-error-logger.ts:53, 95, 178, 198).
- [ ] 4. Add `feature` to `withAdminObserved` opts + `maybeCaptureRlsDenial` ctx (import type only from feature-registry to avoid cycles — registry must not import the logger).
- [ ] 5. Green:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/ && npm run typecheck
  ```
- [ ] 6. Retro-tag the existing exemplar: golf.ts:4949 `{ sport: 'golf', featureArea: 'rounds' }` → `{ sport: 'golf', feature: 'round_tracking' }`.

---

### Task 3 — `src/lib/admin/feature-registry.ts` (canonical list)

**Files**
- Create: `src/lib/admin/feature-registry.ts`
- Create: `src/lib/admin/__tests__/feature-registry.test.ts`

**Interfaces**
```typescript
export type FeatureApp = 'golfhelm' | 'coachhelm';
export type FeatureTier = 'high' | 'med' | 'low';
export type FeatureKey = 'round_tracking' | 'stats_analytics' | /* …all 37 keys from FEATURE_COVERAGE.md §1… */ | 'coachhelm_v3_goals';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  app: FeatureApp;
  /** Action manifest: repo-relative file → 'ALL' | string[] of export names. */
  actions: Record<string, 'ALL' | string[]>;
  primaryTable: string | null;      // null = no heartbeat (never ambers on staleness)
  heartbeatTable: string | null;    // usually === primaryTable; RPC allowlist applies
  tier: FeatureTier;
  seasonalEmpty: boolean;           // all false today; exists for baseball's return
  neverNeutral?: boolean;           // admin_dashboard only
  healthSignal: string;             // rendered on the drill-in card
  knownGaps?: string[];             // annotated pre-existing drift (not outages)
  excluded?: 'crm';                 // crm_recruiting_pipeline only — never wrapped
}

export const FEATURE_REGISTRY: readonly FeatureDef[] = [ /* 38 entries incl. excluded CRM row */ ];
export const TABLE_TO_FEATURE: Readonly<Record<string, FeatureKey>>; // derived: primary + secondary tables → key (first-writer wins; collisions resolved by explicit map)
export function featureForTable(table: string): FeatureKey | null;
export function rpcInput(): Array<{ key: FeatureKey; heartbeat_table: string | null }>; // p_features payload for get_feature_health
```

**Steps**

- [ ] 1. Failing test `feature-registry.test.ts`:
  - exactly 38 entries; keys unique; every entry matches FEATURE_COVERAGE.md §1 keys (hard-code the expected key list — the doc is canonical, the test is the tripwire);
  - manifest completeness: for every non-CRM `'use server'` file under `src/app/golf/actions/**` (+ `src/app/actions/messages.ts` golf exports + `src/app/admin/actions/triage.ts`), every `export async function` name appears in EXACTLY ONE feature's `actions` manifest — scan with the Task 4 scanner; excluded-file manifest (spec §1.3) is the only allowed absence;
  - total manifest size === 424;
  - `featureForTable('golf_rounds') === 'round_tracking'`; unknown table → null;
  - no `crm_` table and no `baseball_`/`helm_lifting_` table appears in any manifest or table map.
- [ ] 2. Implement the registry translating spec §1–§2 verbatim (including the six override files' function-level splits).
- [ ] 3. Green + typecheck.

---

### Task 4 — Coverage contract-test harness

**Files**
- Create: `src/lib/admin/__tests__/coverage-scanner.ts` (test-only util, not shipped)
- Create: `src/lib/admin/__tests__/coverage-contract.shared.ts`
- Create: `src/lib/admin/__tests__/coverage-contract.foundation.test.ts`

**Design** — static source scan (no runtime import of 'use server' files in vitest):
```typescript
// coverage-scanner.ts
export interface ScannedFile { file: string; exports: string[]; wrapped: Map<string, { feature: string | null }>; }
export function scanActionFile(absPath: string): ScannedFile;
// exports: /^export async function (\w+)/gm
// wrapped: an export N counts as wrapped iff the source contains
//   withAdminObserved(\s*['"]N['"]  — i.e. an observed instance registered
//   under the SAME public name (Impl+delegator pattern) — and the feature
//   captured from the opts object literal.

// coverage-contract.shared.ts
export function assertAreaFullyWrapped(files: string[], opts?: { exclude?: Record<string, string[]> }): void;
// For each file: every export is wrapped; every wrap's feature is a valid
// FeatureKey; the feature matches the registry manifest for that export.
```

**Steps**

- [ ] 1. Failing test `coverage-contract.foundation.test.ts`:
  - scanner parses golf.ts and reports `savePartialRound` wrapped with feature `round_tracking` (after Task 2 step 6) and e.g. `submitGolfRoundComprehensive` unwrapped;
  - `assertAreaFullyWrapped(['src/app/golf/actions/round-drafts.ts'])` currently THROWS listing the 4 unwrapped names (proves the harness detects gaps — this assertion inverts in Batch 1).
- [ ] 2. Implement scanner + shared assertion. Green.
- [ ] 3. Add the global tripwire (initially `it.todo`, flipped on in Task 16): every non-CRM, non-excluded action file repo-wide is fully wrapped.

---

### Tasks 5–14 — Batched instrumentation (one PR each; identical recipe)

**Recipe per batch (TDD):**
1. Create `src/app/golf/actions/__tests__/coverage-contract.<batch>.test.ts` calling `assertAreaFullyWrapped(<batch files>)` → RED (lists every unwrapped export).
2. Mechanically retrofit each export with the Impl+delegator pattern (spec §2.3), tag from the registry manifest (`{ sport: 'golf', feature: '<key>' }`; overrides per spec §2.2). Bodies UNTOUCHED. No behavior change; no new throws; validation returns stay returns.
3. GREEN: contract test + `npm run typecheck && npm run lint && npm test`.
4. Spot-verify no double-logging: files that already call `logServerError/logServerException` internally (e.g. documents.ts:10) keep their calls ONLY where they log-and-return-gracefully (handled path — wrapper won't fire, no double log). Where a file logs AND rethrows the same error, delete the inline log in favor of the wrapper (one line, N4).

| # | Batch (PR) | Features | Files | Actions |
|---|---|---|---|---:|
| 5 | B0 admin dogfood (FIRST — operates on admin_events itself) | admin_dashboard | admin-bi-data.ts, admin-data.ts, admin-people-data.ts, admin-system-data.ts, admin-tracer-data.ts, admin/rollup-c.ts, src/app/admin/actions/triage.ts | 14 |
| 6 | B1 core play | round_tracking, stats_analytics, qualifiers, my_qualifiers | golf.ts (round/qualifier fns), round-drafts.ts, stats.ts, stats-data.ts, stats-intelligence.ts, stats-leak-maps.ts, shot-analytics.ts, team-sg-baseline.ts, v3/qualifying.ts | 52 |
| 7 | B2 calendar + academics + notifications | calendar_events, academics_classes, notifications | golf.ts (event/notification fns), attendance.ts, calendar-feeds.ts, calendar-sync.ts, recurring-events.ts, event-documents.ts, coach-notifications.ts, player-notifications.ts, push-notifications.ts | 49 |
| 8 | B3 tasks + travel + documents | task_management, travel, documents | tasks.ts, task-templates.ts, task-reminders.ts, travel.ts, documents.ts | 63 |
| 9 | B4 comms | messaging, announcements | message-attachments.ts, src/app/actions/messages.ts (10 golf exports ONLY — generic + Baseball exports untouched), announcements.ts, communication.ts, golf.ts (createAnnouncement) | 23 |
| 10 | B5 membership + auth + settings | roster_management, team_info, join_team_flow, auth_onboarding, settings | roster.ts, teams.ts, team-switcher.ts, auth.ts, onboarding.ts, access-code.ts, demo-access.ts, demo-tracking.ts, v3/notification-prefs.ts, golf.ts (roster fns) | 35 |
| 11 | B6 library + recruiting + player surfaces | course_library, recruiting_prospect_tracking, player_hub, coach_dashboard, my_game_profile, whats_new | course-library.ts, courses.ts, golf.ts (saved-course fns), recruiting.ts, recruit-documents.ts, dashboard-data.ts, command-palette.ts, player-profile-stats.ts, whats-new.ts | 51 |
| 12 | B7 coachhelm engine | coachhelm_ai_engine, alerts_system, patterns_dashboard | insights.ts (engine fns), insight-delivery.ts, player-fingerprint.ts, alerts.ts, pattern-management.ts | 34 |
| 13 | B8 coachhelm coach surfaces | insights_management, intelligence_dashboard, coachhelm_analytics, coaching_intelligence_settings | insights.ts (lifecycle fns), insight-management.ts, insight-evidence.ts, intelligence-dashboard.ts, team-category-insights.ts, coachhelm-data.ts, causal-relationships.ts, coachhelm-analytics.ts, player-effectiveness.ts, coaching-philosophy.ts | 39 |
| 14 | B9 coachhelm player + reviews + development | player_coachhelm_dashboard, round_review_ai, development_plans_coach, my_development, drills_practice_rx, coachhelm_v3_goals | insights.ts (remaining), player-feedback.ts, insight-celebration.ts, round-reviews.ts, round-review-system.ts, round-recap.ts, v3/llm.ts, development.ts, drills.ts, v3/practice-rx.ts, v3/team-practice-rx.ts, v3/goals.ts, v3/goal-progress.ts, v3/focus-area-progress.ts, v3/intent.ts | 64 |
| | | | **Total** | **424** (423 new + savePartialRound) |

Batch notes:
- golf.ts and insights.ts span batches — each batch's contract test asserts only ITS
  function names via the `exclude` list until the final batch containing the file
  lands; the Task 16 global tripwire then locks the whole file.
- B4: verify at build time that adding module-scope `withAdminObserved` consts to
  `src/app/actions/messages.ts` (a 'use server' file with 21 exports) compiles —
  the exemplar proves the pattern inside golf.ts; this is the same shape.
- B5: `demo-access.ts:enterDemo` uses `redirect()` — confirmed safe to wrap
  (isNextControlFlowError, observed-action.ts:10). Auth actions: wrap as `feature:
  'auth_onboarding'`; NEVER log credentials — the wrapper only receives the thrown
  error, and logger context carries no args (verify no arg-echo in the retrofit).
- B7–B9: `triggerPlayerInsightsAfterRound` is async fan-out fired post-submit — the
  wrapper must not convert its fire-and-forget call site into an awaited path
  (delegator preserves the existing call shape).

---

### Task 15 — Centralize RLS-denial capture in the shared query helpers

**Files**
- Modify: `src/lib/supabase/fetch-all-rows.ts`
- Modify (capture-only additions at existing ad-hoc 42501 sites): `src/app/golf/actions/event-documents.ts`, `recruit-documents.ts`, `insights.ts`, `teams.ts`, `golf.ts`, `round-reviews.ts` (admin-data.ts uses service-role — no RLS to capture, skip)
- Extend: `src/lib/supabase/__tests__/fetch-all-rows.test.ts` (or create)

**Interfaces (additive, back-compatible)**
```typescript
export interface RlsCaptureCtx {
  table: string;
  action: string;
  feature?: FeatureKey;
  sport?: 'golf' | 'shared';
  verb?: 'select';           // helpers are read-paths; defaults 'select'
  userId?: string | null;
}
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string | null } | null }>,
  pageSize?: number,
  rlsCtx?: RlsCaptureCtx,
): Promise<T[]>;
export async function fetchAllRowsResult<T>(/* same widening + rlsCtx */): Promise<{ data: T[] | null; error: { message: string; code?: string | null } | null }>;
```

**Steps**

- [ ] 1. Failing tests: error type widening compiles with PostgREST builders; a `{code:'42501'}` first-page error triggers exactly one `maybeCaptureRlsDenial` (mocked) with the passed ctx and STILL returns `{data:null, error}` / still throws — unchanged contract (fetch-all-rows.ts:39-41, 77-80); non-denial errors trigger nothing; omitted `rlsCtx` captures with `table:'unknown'` iff message matches the RLS regex (isRlsDenial fallback, rls-denial.ts:16).
- [ ] 2. Widen the `makeQuery` error type to `{ message: string; code?: string | null }` in BOTH functions (fetch-all-rows.ts:28, 69) and call `maybeCaptureRlsDenial(error, …)` inside the `if (error)` branches. Capture is fire-and-forget; return/throw behavior byte-identical.
- [ ] 3. Thread `rlsCtx` at the 13 golf-action call-site files + 2 route handlers (calendar feeds, event-reminders cron) — table + action + feature from the registry. Pure addition of a third argument.
- [ ] 4. Add `maybeCaptureRlsDenial(error, {table, verb, action, feature, sport:'golf'})` beside the 6 files' existing ad-hoc 42501 checks (keep their user-facing messages; capture is additive).
- [ ] 5. Green: tests + typecheck + lint. Confirm zero calls added under `src/app/baseball/**` / `src/lib/baseball/**` / `src/app/lifting/**`:
  ```bash
  grep -rn "maybeCaptureRlsDenial" src/app/baseball src/lib/baseball src/app/lifting src/lib/lifting | wc -l   # must be 0
  ```

---

### Task 16 — Lock the invariant + verification sweep

**Files**
- Modify: `src/lib/admin/__tests__/coverage-contract.foundation.test.ts` (flip global tripwire on)
- Modify: `docs/superpowers/plans/helm-bridge/EXECUTION_LOG.md` (entry)

**Steps**

- [ ] 1. Enable the global contract: every `'use server'` action file under
  `src/app/golf/actions/**` (minus the spec §1.3 exclusion manifest) + the 10 golf
  exports of `src/app/actions/messages.ts` + `src/app/admin/actions/triage.ts` is
  fully wrapped with a valid FeatureKey. This is the "no un-wrapped action in a
  wrapped area" guarantee, permanently.
- [ ] 2. Full gate:
  ```bash
  npm run typecheck && npm run lint && npm test
  ```
- [ ] 3. Manual verification (spec N-rules): trigger one forced failure in dev
  (e.g. temporarily bad table name in a scratch action), confirm ONE admin_events row
  with `feature`, `sport='golf'`, `source='server_action'`, fingerprint set; loop it
  50× and confirm collapse (≤2 rows, collapsed_count present). Confirm a NEXT_REDIRECT
  action (enterDemo) writes NOTHING.
- [ ] 4. EXECUTION_LOG entry: counts (424/424), batch PR links, noise rules verified.
