# W2: `admin_events` Additive Schema + Backward-Compatible Writer Extension

**Goal:** Add the four new columns (`sport`, `team_id`, `fingerprint`, `source`) + indexes to `admin_events` BEFORE any new emitter ships (schema-drift gotcha: fields silently drop otherwise), revoke the pre-existing table-level anon/authenticated grants found in W1, and extend the two writers additively so the ~230 existing importers compile unchanged.

**Depends-on:** W1 (the ACL findings recorded in W1 Task 1 step 4).

**PR-scope:** ONE PR — one migration + two writer files + regenerated DB types.

---

### Task 1 — Migration: additive columns, indexes, ACL revoke

**Files**
- Create: `supabase/migrations/20260701120000_admin_events_bridge_columns.sql`

**Interfaces**
- Produces (SQL, all additive):
  ```sql
  admin_events.sport        text CHECK (sport IN ('golf','baseball','shared'))
  admin_events.team_id      uuid
  admin_events.fingerprint  text
  admin_events.source       text CHECK (source IN (
    'server_action','route_handler','server_component','background_job','request_hook',
    'rls_denial','auth','cron','integrity','client','system'))
  ```
  Note the CHECK list is the UNION of the design's 8 sources and the 5 existing `ServerTraceSource` values already emitted by `server-error-logger.ts` (`src/lib/server-error-logger.ts:8-13`) — using only the design's list would make the CHECK reject today's writer values.

**Steps**

- [ ] 1. Red state via Supabase MCP `execute_sql`:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='admin_events'
    AND column_name IN ('sport','team_id','fingerprint','source');
  ```
  Expected: 0 rows.

- [ ] 2. Create `supabase/migrations/20260701120000_admin_events_bridge_columns.sql`:
  ```sql
  -- W2: Helm Bridge additive columns on admin_events (90k+ rows, live writers
  -- in ~230 files — ADDITIVE ONLY, writer API stays backward-compatible).
  -- Columns land BEFORE any emitter references them (schema-drift gotcha:
  -- ingest against a missing column silently drops the field).
  ALTER TABLE public.admin_events
    ADD COLUMN IF NOT EXISTS sport text,
    ADD COLUMN IF NOT EXISTS team_id uuid,
    ADD COLUMN IF NOT EXISTS fingerprint text,
    ADD COLUMN IF NOT EXISTS source text;

  -- NOT VALID so the ALTER takes no full-table scan lock on a 90k-row live
  -- table; existing rows have NULLs which pass anyway. New writes validate.
  ALTER TABLE public.admin_events
    ADD CONSTRAINT admin_events_sport_check
    CHECK (sport IS NULL OR sport IN ('golf','baseball','shared')) NOT VALID;

  ALTER TABLE public.admin_events
    ADD CONSTRAINT admin_events_source_check
    CHECK (source IS NULL OR source IN (
      'server_action','route_handler','server_component','background_job','request_hook',
      'rls_denial','auth','cron','integrity','client','system'
    )) NOT VALID;

  -- Triage-queue indexes (partial where the queue reads).
  CREATE INDEX IF NOT EXISTS idx_admin_events_fingerprint
    ON public.admin_events (fingerprint, created_at DESC)
    WHERE fingerprint IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_admin_events_unresolved_fingerprint
    ON public.admin_events (fingerprint, severity)
    WHERE NOT resolved AND fingerprint IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_admin_events_source_created
    ON public.admin_events (source, created_at DESC)
    WHERE source IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_admin_events_team
    ON public.admin_events (team_id, created_at DESC)
    WHERE team_id IS NOT NULL;

  -- ── ACL hardening (reground finding §2.6): the TABLE carries a legacy
  -- GRANT ALL TO anon, authenticated. RLS mitigates it today, but a future
  -- policy slip would silently widen access. Revoke now; writers use
  -- service_role, readers go through the gated server layer.
  REVOKE ALL ON TABLE public.admin_events FROM anon, authenticated;

  DO $$
  BEGIN
    IF has_table_privilege('anon', 'public.admin_events', 'SELECT')
       OR has_table_privilege('authenticated', 'public.admin_events', 'SELECT')
       OR has_table_privilege('anon', 'public.admin_events', 'INSERT')
       OR has_table_privilege('authenticated', 'public.admin_events', 'INSERT') THEN
      RAISE EXCEPTION 'ACL check failed: admin_events still grants anon/authenticated';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint'
    ) THEN
      RAISE EXCEPTION 'Column check failed: admin_events.fingerprint missing';
    END IF;
  END $$;
  ```
  CAUTION — before applying, confirm the golf-admin realtime/read path does not depend on the authenticated table grant: the existing readers (`admin-data.ts`, rollup RPCs) use service_role or SECURITY DEFINER RPCs, which are unaffected. If W1 Task 1 step 4 recorded an `admin-SELECT` RLS policy that the OLD `/golf/admin` UI exercises with the user-scoped client, keep `GRANT SELECT ON public.admin_events TO authenticated;` (RLS still gates rows) and note it for removal in W14 when the old UI dies. Record the choice in the PR description.

- [ ] 3. Apply via Supabase MCP `apply_migration` (name `admin_events_bridge_columns`); verify:
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='admin_events'
    AND column_name IN ('sport','team_id','fingerprint','source');
  SELECT indexname FROM pg_indexes WHERE tablename='admin_events' AND indexname LIKE 'idx_admin_events_%fingerprint%';
  SELECT relacl FROM pg_class WHERE relname='admin_events';
  ```
  Expected: 4 columns; 2 fingerprint indexes; `relacl` without anon (authenticated per the step-2 decision).

- [ ] 4. Regenerate DB types and commit them (writers below need the new columns in `Database`):
  ```bash
  npm run db:types
  git diff --stat src/lib/types/database.ts   # expect admin_events Row/Insert gains 4 fields
  ```

- [ ] 5. Commit: `feat(admin): admin_events sport/team/fingerprint/source columns + ACL revoke (W2 migration)`

---

### Task 2 — Extend `server-error-logger.ts` additively

**Files**
- Modify: `src/lib/server-error-logger.ts`
- Create: `src/lib/__tests__/server-error-logger-bridge.test.ts`

**Interfaces**
- Produces (additive fields on the EXISTING `RoundErrorContext` — no signature changes, ~230 importers compile untouched):
  ```typescript
  interface RoundErrorContext {
    // ...all existing fields unchanged...
    sport?: 'golf' | 'baseball' | 'shared';
    teamId?: string | null;
    /** Single stable DB grouping key. Distinct from the existing Sentry
     *  `fingerprint?: string[]`. Defaults to buildIncidentSignature(...). */
    dbFingerprint?: string;
  }
  ```
- Consumes: `buildIncidentSignature` from `@/lib/admin/incident-grouping` (existing, `src/lib/admin/incident-grouping.ts:105-115`).

**Steps**

- [ ] 1. Write the failing test `src/lib/__tests__/server-error-logger-bridge.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  }));

  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          mocks.inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  }));

  vi.mock('@sentry/nextjs', () => ({
    withScope: (fn: (scope: unknown) => void) =>
      fn({
        setLevel: vi.fn(), setTag: vi.fn(), setUser: vi.fn(),
        setContext: vi.fn(), setFingerprint: vi.fn(),
      }),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  }));

  import { logServerError } from '@/lib/server-error-logger';

  describe('server-error-logger bridge columns', () => {
    beforeEach(() => { mocks.inserts.length = 0; });

    it('writes sport/team_id/fingerprint/source onto the admin_events row', async () => {
      await logServerError('boom', {
        action: 'test.bridge',
        source: 'server_action',
        sport: 'golf',
        teamId: 'team-1',
        dbFingerprint: 'abc123ff',
      });
      const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
      expect(adminEvent?.row).toMatchObject({
        sport: 'golf',
        team_id: 'team-1',
        fingerprint: 'abc123ff',
        source: 'server_action',
      });
    });

    it('derives a deterministic fingerprint when dbFingerprint is omitted', async () => {
      await logServerError('same message', { action: 'test.bridge', route: '/x' });
      await logServerError('same message', { action: 'test.bridge', route: '/x' });
      const rows = mocks.inserts.filter((i) => i.table === 'admin_events');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.row.fingerprint).toBeTruthy();
      expect(rows[0]!.row.fingerprint).toEqual(rows[1]!.row.fingerprint);
    });

    it('stays backward-compatible: legacy context without new fields still writes', async () => {
      await logServerError('legacy', { action: 'legacy.caller' });
      const adminEvent = mocks.inserts.find((i) => i.table === 'admin_events');
      expect(adminEvent?.row).toMatchObject({ sport: null, team_id: null, source: 'server_action' });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/__tests__/server-error-logger-bridge.test.ts
  ```
  Expected: FAIL — inserted rows lack `sport`/`fingerprint` keys (and TS errors on the new context fields).

- [ ] 3. Implement in `src/lib/server-error-logger.ts`:
  (a) add to the `RoundErrorContext` interface (after `skipSentry`):
  ```typescript
    /** Helm Bridge wayfinding: which product surface emitted this. */
    sport?: 'golf' | 'baseball' | 'shared';
    /** Helm Bridge: owning team (golf_teams.id or baseball_teams.id). */
    teamId?: string | null;
    /**
     * Helm Bridge: single stable DB grouping key written to
     * admin_events.fingerprint. Distinct from the Sentry `fingerprint`
     * string[] above. Defaults to buildIncidentSignature(severity, errorCode,
     * route, message) so identical failures collapse in the triage queue.
     */
    dbFingerprint?: string;
  ```
  (b) add the import:
  ```typescript
  import { buildIncidentSignature, type IncidentSeverity } from '@/lib/admin/incident-grouping';
  ```
  (c) in `writeAdminTables` (currently `server-error-logger.ts:117-154`), compute the fingerprint and extend ONLY the `admin_events` insert:
  ```typescript
    const dbFingerprint =
      context.dbFingerprint ??
      buildIncidentSignature({
        severity: severity as IncidentSeverity,
        errorCode: context.errorCode ?? null,
        route: context.route ?? context.url ?? null,
        message,
      });

    const adminEventInsert = admin.from('admin_events').insert({
      event_type: 'error',
      title,
      severity,
      message: message.slice(0, 10000),
      metadata: normalizedContext as Json,
      user_id: context.userId ?? null,
      user_email: context.userEmail ?? null,
      url,
      stack_trace: stack,
      browser_info: null,
      sport: context.sport ?? null,
      team_id: context.teamId ?? null,
      fingerprint: dbFingerprint,
      source: context.source ?? 'server_action',
    });
  ```
  (`normalizeContext` also gains `sport: context.sport ?? null, teamId: context.teamId ?? null,` so metadata stays complete.)

- [ ] 4. Run to confirm pass + full gates:
  ```bash
  npm run test:run -- src/lib/__tests__/server-error-logger-bridge.test.ts
  npm run typecheck && npm run test:run
  ```
  Expected: 3 new tests pass; NOTHING else changes (backward-compat is the point — any other failing test means the writer contract broke; stop and fix).

- [ ] 5. Commit: `feat(admin): server-error-logger writes bridge columns (additive, W2)`

---

### Task 3 — Extend `admin-logger.ts` additively

**Files**
- Modify: `src/lib/admin-logger.ts`
- Create: `src/lib/__tests__/admin-logger-bridge.test.ts`

**Interfaces**
- Produces (additive optional fields on `AdminEventInput`, `src/lib/admin-logger.ts:29-40`):
  ```typescript
  interface AdminEventInput {
    // ...existing fields unchanged...
    sport?: 'golf' | 'baseball' | 'shared';
    teamId?: string | null;
    fingerprint?: string;
    source?: string; // one of the CHECK-listed sources
  }
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/__tests__/admin-logger-bridge.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    inserted: [] as Record<string, unknown>[],
  }));

  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          mocks.inserted.push(row);
          return {
            select: () => ({ single: async () => ({ data: { id: 'evt-1' }, error: null }) }),
          };
        },
      }),
    }),
  }));

  import { logLogin } from '@/lib/admin-logger';

  describe('admin-logger bridge columns', () => {
    beforeEach(() => { mocks.inserted.length = 0; });

    it('logLogin writes source=auth and passes sport through', async () => {
      await logLogin('user-1', 'a@b.c', { sport: 'golf' });
      expect(mocks.inserted[0]).toMatchObject({
        event_type: 'login',
        source: 'auth',
        sport: 'golf',
      });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/__tests__/admin-logger-bridge.test.ts
  ```
  Expected: FAIL — row lacks `source`/`sport`.

- [ ] 3. Implement in `src/lib/admin-logger.ts`:
  (a) extend `AdminEventInput`:
  ```typescript
  interface AdminEventInput {
    eventType: AdminEventType;
    title: string;
    severity?: AdminEventSeverity;
    message?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
    userEmail?: string;
    url?: string;
    stackTrace?: string;
    browserInfo?: Record<string, unknown>;
    sport?: 'golf' | 'baseball' | 'shared';
    teamId?: string | null;
    fingerprint?: string;
    source?: string;
  }
  ```
  (b) extend the insert body in `logAdminEvent` (`admin-logger.ts:56-69`):
  ```typescript
      .insert({
        event_type: input.eventType as string,
        title: input.title,
        severity: (input.severity ?? 'info') as 'info' | 'warning' | 'error' | 'critical',
        message: input.message ?? null,
        metadata: (input.metadata ?? {}) as Json,
        user_id: input.userId ?? null,
        user_email: input.userEmail ?? null,
        url: input.url ?? null,
        stack_trace: input.stackTrace ?? null,
        browser_info: (input.browserInfo ?? null) as Json,
        sport: input.sport ?? null,
        team_id: input.teamId ?? null,
        fingerprint: input.fingerprint ?? null,
        source: input.source ?? null,
      })
  ```
  (c) `logLogin` and `logSignup` set `source: 'auth'` and hoist a caller-supplied `sport` out of `metadata`:
  ```typescript
  export async function logLogin(
    userId: string,
    userEmail: string,
    metadata?: Record<string, unknown>
  ): Promise<string | null> {
    const sport = metadata?.sport as 'golf' | 'baseball' | 'shared' | undefined;
    return logAdminEvent({
      eventType: 'login',
      title: 'User logged in',
      severity: 'info',
      userId,
      userEmail,
      metadata,
      source: 'auth',
      sport,
    });
  }
  ```
  (mirror the same two-line change in `logSignup`; `logSecurityEvent` sets `source: 'auth'`.)

- [ ] 4. Run to confirm pass + full gates:
  ```bash
  npm run test:run -- src/lib/__tests__/admin-logger-bridge.test.ts
  npm run typecheck && npm run test:run
  ```
  Expected: green, including the existing `demo-access.test.ts` mocks of `logLogin` (signature unchanged).

- [ ] 5. Commit: `feat(admin): admin-logger writes bridge columns (additive, W2)`

---

## Acceptance Criteria

- [ ] `information_schema.columns` shows `sport`, `team_id`, `fingerprint`, `source` on `admin_events`; CHECK constraints present; 4 new indexes present.
- [ ] `pg_class.relacl` for `admin_events` shows no anon grant (authenticated per the recorded Task 1 decision).
- [ ] `src/lib/types/database.ts` regenerated and committed.
- [ ] New writer tests pass AND the full pre-existing unit suite passes untouched (backward-compat proof for the ~230 importers).
- [ ] A live smoke row confirms end-to-end: trigger any `logServerError` path in dev, then `SELECT sport, fingerprint, source FROM admin_events ORDER BY created_at DESC LIMIT 1;` shows populated `fingerprint` + `source`.

## Rollback

- Code: `git revert` — writers stop sending the new columns; the columns keep accepting NULL (no breakage).
- DB: columns/indexes are additive and NULL-able; leave in place. Emergency removal: `ALTER TABLE public.admin_events DROP COLUMN sport, DROP COLUMN team_id, DROP COLUMN fingerprint, DROP COLUMN source;` — ONLY safe after reverting the writer code first (order matters or inserts 500).
