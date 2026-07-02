# W11: Jobs & Integrity — cron board, nightly integrity checks, retention

**Goal:** Give every scheduled job a persisted outcome (`background_job_logs` finally gets writers — it has ZERO today), detect dead crons explicitly (OVERDUE = absence, which a dead cron can't log), add the nightly data-integrity cron (orphans, schema canaries, anon-grant drift) and the retention cron, and ship `/admin/jobs`.

**Depends-on:** W2 (source column), W4 (panels). Retention ships in the SAME wave as the new write volume (risk #8 rule).

**PR-scope:** ONE PR (one migration + job-log lib + 14 mechanical route edits + 2 new cron routes + vercel.json + the tab).

**Reground fact:** all 14 cron routes ALREADY call `logServerError`/`logServerEvent` — do NOT re-wrap Sentry logging. The ONLY missing piece per route is the `background_job_logs` outcome row.

---

### Task 1 — `recordJobRun` + cron registry + overdue detection

**Files**
- Create: `src/lib/admin/job-log.ts`
- Create: `src/lib/admin/cron-registry.ts`
- Create: `src/lib/admin/__tests__/job-log.test.ts`
- Create: `src/lib/admin/__tests__/cron-registry.test.ts`

**Interfaces**
- Produces:
  ```typescript
  // job-log.ts
  export async function recordJobRun<T>(jobType: string, fn: () => Promise<T>): Promise<T>;
  // cron-registry.ts
  export interface CronRegistryEntry { jobType: string; path: string; cadenceMinutes: number; }
  export const CRON_REGISTRY: readonly CronRegistryEntry[];
  export type CronBoardStatus = 'ok' | 'overdue' | 'never-ran' | 'failed';
  export function classifyCronStatus(
    entry: CronRegistryEntry,
    lastRun: { started_at: string; status: string } | null,
    now: Date,
  ): CronBoardStatus;
  ```
  `recordJobRun` contract: runs `fn`; writes ONE `background_job_logs` row (`job_type`, `status: 'completed'|'failed'`, `duration_ms`, `error_message`, `started_at`, `completed_at`) after settlement; the write is fire-and-forget-swallowed (a logging failure NEVER fails the cron); the original result/throw passes through unchanged. On failure it ALSO writes an `admin_events` `source='cron'` row via `logServerEvent` (successes stay out of the event feed — the routes already log their own summaries).

**Steps**

- [ ] 1. Write the failing tests.
  `src/lib/admin/__tests__/job-log.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    inserted: [] as Record<string, unknown>[],
    logServerEvent: vi.fn(async () => {}),
    failInsert: false,
  }));
  vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          if (mocks.failInsert) return Promise.resolve({ data: null, error: { message: 'insert down' } });
          mocks.inserted.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  }));
  vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

  import { recordJobRun } from '@/lib/admin/job-log';

  describe('recordJobRun', () => {
    beforeEach(() => {
      mocks.inserted.length = 0;
      mocks.logServerEvent.mockClear();
      mocks.failInsert = false;
    });

    it('passes the result through and writes a completed row', async () => {
      await expect(recordJobRun('event-reminders', async () => 'done')).resolves.toBe('done');
      expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'completed' });
      expect(typeof mocks.inserted[0]!.duration_ms).toBe('number');
      expect(mocks.logServerEvent).not.toHaveBeenCalled(); // successes stay out of the feed
    });

    it('rethrows failures after writing a failed row + cron event', async () => {
      const boom = new Error('job blew up');
      await expect(recordJobRun('event-reminders', async () => { throw boom; })).rejects.toBe(boom);
      expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'failed', error_message: 'job blew up' });
      const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
      expect(ctx).toMatchObject({ source: 'cron', action: 'cron.event-reminders' });
    });

    it('a broken log table never fails the cron (fire-and-forget)', async () => {
      mocks.failInsert = true;
      await expect(recordJobRun('event-reminders', async () => 42)).resolves.toBe(42);
    });
  });
  ```
  `src/lib/admin/__tests__/cron-registry.test.ts` (registry ↔ vercel.json contract):
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';

  describe('CRON_REGISTRY ↔ vercel.json contract', () => {
    it('covers every scheduled cron path exactly', () => {
      const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
        crons: Array<{ path: string }>;
      };
      const scheduled = vercel.crons.map((c) => c.path).sort();
      const registered = CRON_REGISTRY.map((e) => e.path).sort();
      expect(registered).toEqual(scheduled);
    });
  });

  describe('classifyCronStatus', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    const hourly = { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60 };
    const runAt = (minAgo: number, status = 'completed') => ({
      started_at: new Date(now.getTime() - minAgo * 60000).toISOString(),
      status,
    });

    it('ok within 1.5x cadence', () => {
      expect(classifyCronStatus(hourly, runAt(45), now)).toBe('ok');
    });
    it('OVERDUE past 1.5x cadence — a dead cron writes nothing, absence IS the signal', () => {
      expect(classifyCronStatus(hourly, runAt(95), now)).toBe('overdue');
    });
    it('never-ran when no row exists', () => {
      expect(classifyCronStatus(hourly, null, now)).toBe('never-ran');
    });
    it('failed when the latest run failed (even if recent)', () => {
      expect(classifyCronStatus(hourly, runAt(5, 'failed'), now)).toBe('failed');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/job-log.test.ts src/lib/admin/__tests__/cron-registry.test.ts
  ```
  Expected: FAIL — modules not found.

- [ ] 3. Implement `src/lib/admin/job-log.ts`:
  ```typescript
  import { createAdminClient } from '@/lib/supabase/admin';
  import { logServerEvent } from '@/lib/server-error-logger';

  /**
   * Capture class #4 — cron/job outcomes into background_job_logs (the empty
   * scaffold, prod_public_baseline.sql:7314-7325: job_type, status,
   * duration_ms, error_message, retry_count, metadata, started_at,
   * completed_at). SUCCESSES are logged too — a board that only shows
   * failures cannot distinguish healthy from dead.
   */
  export async function recordJobRun<T>(jobType: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = new Date();
    try {
      const result = await fn();
      await writeRow(jobType, 'completed', startedAt, null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeRow(jobType, 'failed', startedAt, message.slice(0, 2000));
      try {
        void logServerEvent(
          `Cron failed: ${jobType}`,
          { action: `cron.${jobType}`, source: 'cron', errorDetails: message.slice(0, 2000) },
          'error',
        ).catch(() => {});
      } catch { /* never mask the real failure */ }
      throw err;
    }
  }

  async function writeRow(
    jobType: string,
    status: 'completed' | 'failed',
    startedAt: Date,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      const completedAt = new Date();
      const admin = createAdminClient();
      await admin.from('background_job_logs').insert({
        job_type: jobType,
        status,
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        error_message: errorMessage,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
      });
    } catch {
      // Fire-and-forget: outcome logging must never fail a cron.
    }
  }
  ```

- [ ] 4. Implement `src/lib/admin/cron-registry.ts` (cadences transcribed from `vercel.json:39-96`; the contract test keeps them honest forever):
  ```typescript
  export interface CronRegistryEntry {
    jobType: string;
    path: string;
    cadenceMinutes: number;
  }

  const DAILY = 24 * 60;
  const WEEKLY = 7 * DAILY;

  /** Code-defined cadence registry — the "expected" half of expected-vs-actual.
   *  MUST mirror vercel.json crons exactly (contract test enforces). */
  export const CRON_REGISTRY: readonly CronRegistryEntry[] = [
    { jobType: 'coachhelm-validation', path: '/api/cron/coachhelm-validation', cadenceMinutes: WEEKLY },
    { jobType: 'coachhelm-calibration', path: '/api/cron/coachhelm-calibration', cadenceMinutes: DAILY },
    { jobType: 'coachhelm-safety-net', path: '/api/cron/coachhelm-safety-net', cadenceMinutes: WEEKLY },
    { jobType: 'coachhelm-insight-lifecycle', path: '/api/cron/coachhelm-insight-lifecycle', cadenceMinutes: DAILY },
    { jobType: 'coachhelm-roster-sweep', path: '/api/cron/coachhelm-roster-sweep', cadenceMinutes: DAILY },
    { jobType: 'coach-morning-digest', path: '/api/cron/coach-morning-digest', cadenceMinutes: DAILY },
    { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60 },
    { jobType: 'task-reminders', path: '/api/cron/task-reminders', cadenceMinutes: 60 },
    { jobType: 'v3-standing-refresh', path: '/api/cron/v3/standing-refresh', cadenceMinutes: DAILY },
    { jobType: 'v3-genome-nightly', path: '/api/cron/v3/genome-nightly', cadenceMinutes: DAILY },
    { jobType: 'v3-causality-attribute', path: '/api/cron/v3/causality-attribute', cadenceMinutes: DAILY },
    { jobType: 'v3-weekly-coach-email', path: '/api/cron/v3/weekly-coach-email', cadenceMinutes: WEEKLY },
    { jobType: 'v3-goal-suggestions-write', path: '/api/cron/v3/goal-suggestions-write', cadenceMinutes: DAILY },
    { jobType: 'v3-goal-suggestions-evaluate', path: '/api/cron/v3/goal-suggestions-evaluate', cadenceMinutes: DAILY },
    { jobType: 'integrity-check', path: '/api/cron/integrity-check', cadenceMinutes: DAILY },
    { jobType: 'log-retention', path: '/api/cron/log-retention', cadenceMinutes: DAILY },
  ] as const;

  export type CronBoardStatus = 'ok' | 'overdue' | 'never-ran' | 'failed';

  export function classifyCronStatus(
    entry: CronRegistryEntry,
    lastRun: { started_at: string; status: string } | null,
    now: Date,
  ): CronBoardStatus {
    if (!lastRun) return 'never-ran';
    if (lastRun.status === 'failed') return 'failed';
    const ageMinutes = (now.getTime() - new Date(lastRun.started_at).getTime()) / 60_000;
    return ageMinutes > entry.cadenceMinutes * 1.5 ? 'overdue' : 'ok';
  }
  ```
  (The two new W11 entries make the vercel.json contract test fail until Task 3 adds their schedules — correct TDD ordering: keep the registry entries commented out until Task 3 if running the suite between tasks, or land Tasks 1+3's vercel.json edit together. Executor's choice; the final PR state must have both.)

- [ ] 5. Run to confirm pass (after Task 3's vercel.json edit for the contract test):
  ```bash
  npm run test:run -- src/lib/admin/__tests__/job-log.test.ts src/lib/admin/__tests__/cron-registry.test.ts
  ```
  Expected: 7 tests pass.

- [ ] 6. Commit: `feat(admin): recordJobRun + cron cadence registry with vercel.json contract (W11)`

---

### Task 2 — Wire all 14 existing cron routes

**Files** (modify each — mechanical, identical pattern):
- `src/app/api/cron/coachhelm-validation/route.ts`
- `src/app/api/cron/coachhelm-calibration/route.ts`
- `src/app/api/cron/coachhelm-safety-net/route.ts`
- `src/app/api/cron/coachhelm-insight-lifecycle/route.ts`
- `src/app/api/cron/coachhelm-roster-sweep/route.ts`
- `src/app/api/cron/coach-morning-digest/route.ts`
- `src/app/api/cron/event-reminders/route.ts`
- `src/app/api/cron/task-reminders/route.ts`
- `src/app/api/cron/v3/standing-refresh/route.ts`
- `src/app/api/cron/v3/genome-nightly/route.ts`
- `src/app/api/cron/v3/causality-attribute/route.ts`
- `src/app/api/cron/v3/weekly-coach-email/route.ts`
- `src/app/api/cron/v3/goal-suggestions-write/route.ts`
- `src/app/api/cron/v3/goal-suggestions-evaluate/route.ts`
- Create: `src/app/api/cron/__tests__/cron-job-log-coverage.test.ts`

**Steps**

- [ ] 1. Write the failing coverage contract `src/app/api/cron/__tests__/cron-job-log-coverage.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { CRON_REGISTRY } from '@/lib/admin/cron-registry';

  describe('cron job-log coverage', () => {
    it('every registered cron route calls recordJobRun', () => {
      const missing = CRON_REGISTRY.map((e) => e.path)
        .map((p) => join(process.cwd(), 'src/app', p, 'route.ts'))
        .filter((file) => !readFileSync(file, 'utf8').includes('recordJobRun('));
      expect(missing).toEqual([]);
    });
  });
  ```
  Run: `npm run test:run -- src/app/api/cron/__tests__/cron-job-log-coverage.test.ts` → FAIL, 14 files listed.

- [ ] 2. Apply the identical pattern to each route. Exemplar — `src/app/api/cron/event-reminders/route.ts` (auth check stays OUTSIDE the wrapper: an unauthorized probe is not a job run):
  ```typescript
  import { recordJobRun } from '@/lib/admin/job-log';
  ```
  ```typescript
  export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!expected || auth !== `Bearer ${expected}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }

    return recordJobRun('event-reminders', async () => {
      // ── EVERYTHING that previously followed the auth check moves here,
      //    byte-identical, including its own try/catch + logServerError
      //    calls (they keep the admin_events detail; recordJobRun adds the
      //    background_job_logs outcome row). The function's existing
      //    `return NextResponse.json(...)` statements stay as-is.
      ...
    });
  }
  ```
  Rules for all 14: (a) `jobType` must equal the registry `jobType` exactly; (b) do NOT touch the route's internal logic, soft-deadlines, or logging; (c) if a route returns a non-2xx `NextResponse` for a HANDLED failure (rather than throwing), leave it — the row reads `completed` and the route's own `logServerError` still fires (v1 accepts this; the board's `failed` state covers thrown failures).

- [ ] 3. Run to confirm pass + full gates:
  ```bash
  npm run test:run -- src/app/api/cron/__tests__/cron-job-log-coverage.test.ts
  npm run typecheck && npm run test:run
  ```

- [ ] 4. Manual smoke: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/event-reminders` → then `SELECT job_type, status, duration_ms FROM background_job_logs ORDER BY started_at DESC LIMIT 1;` shows the row.

- [ ] 5. Commit: `feat(admin): wire background_job_logs outcomes into all 14 cron routes (W11)`

---

### Task 3 — Integrity + retention crons (migration + routes + schedules)

**Files**
- Create: `supabase/migrations/20260701150000_run_integrity_checks_rpc.sql`
- Create: `src/app/api/cron/integrity-check/route.ts`
- Create: `src/app/api/cron/log-retention/route.ts`
- Modify: `vercel.json` (2 new schedules)

**Interfaces**
- Produces:
  ```sql
  FUNCTION public.run_integrity_checks() RETURNS jsonb; -- SECURITY DEFINER, service_role-only EXECUTE
  -- → [{"check":"...","status":"pass|fail","count":N,"sample":[...]}]
  ```

**Steps**

- [ ] 1. Create the migration:
  ```sql
  -- W11: nightly integrity checks. SECURITY DEFINER so it can read pg_catalog
  -- ACLs; EXECUTE granted to service_role ONLY (the cron's client) — no
  -- auth.uid() gate needed because anon/authenticated cannot call it at all.
  CREATE OR REPLACE FUNCTION public.run_integrity_checks() RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
  DECLARE
    v jsonb := '[]'::jsonb;
    n bigint;
    sample jsonb;
  BEGIN
    -- 1. Orphaned golf team members
    SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO n, sample
    FROM (
      SELECT m.id, row_number() OVER () AS rn
      FROM golf_team_members m
      LEFT JOIN golf_teams t ON t.id = m.team_id
      WHERE m.team_id IS NOT NULL AND t.id IS NULL
    ) q;
    v := v || jsonb_build_object('check', 'orphaned_golf_team_members',
      'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

    -- 2. Stats-cache rows referencing deleted players
    SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO n, sample
    FROM (
      SELECT c.id, row_number() OVER () AS rn
      FROM golf_player_stats_cache c
      LEFT JOIN golf_players p ON p.id = c.player_id
      WHERE p.id IS NULL
    ) q;
    v := v || jsonb_build_object('check', 'stats_cache_deleted_players',
      'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

    -- 3. Schema canaries — Helm Bridge objects that MUST exist (catches
    --    recorded-but-unapplied migrations, the documented failure mode)
    SELECT count(*) INTO n FROM (
      SELECT 1 WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='admin_allowlist')
      UNION ALL
      SELECT 1 WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint')
      UNION ALL
      SELECT 1 WHERE NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
        WHERE ns.nspname='public' AND p.proname='is_super_admin')
    ) missing;
    v := v || jsonb_build_object('check', 'bridge_schema_canaries',
      'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', '[]'::jsonb);

    -- 4. Anon-grant drift on Bridge-sensitive objects (the recurring gotcha:
    --    recreates auto-grant ALL to anon+authenticated)
    SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO n, sample
    FROM (
      SELECT c.relname AS objname, row_number() OVER () AS rn
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public'
        AND c.relname IN ('admin_allowlist', 'admin_events', 'error_logs', 'background_job_logs', 'audit_log', 'login_attempts')
        AND (has_table_privilege('anon', c.oid, 'SELECT')
          OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE')
          OR has_table_privilege('anon', c.oid, 'DELETE'))
    ) q;
    v := v || jsonb_build_object('check', 'anon_grant_drift',
      'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

    RETURN v;
  END;
  $$;

  REVOKE ALL ON FUNCTION public.run_integrity_checks() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.run_integrity_checks() TO service_role;

  DO $$
  DECLARE v_fn oid;
  BEGIN
    SELECT p.oid INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='run_integrity_checks';
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: run_integrity_checks callable by anon/authenticated';
    END IF;
  END $$;
  ```
  Apply via `apply_migration` (name `run_integrity_checks_rpc`); verify `SELECT public.run_integrity_checks();` in the SQL editor returns the 4-check jsonb (postgres role can execute; anon cannot). `npm run db:types` + commit.

- [ ] 2. Create `src/app/api/cron/integrity-check/route.ts`:
  ```typescript
  import { NextResponse, type NextRequest } from 'next/server';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { recordJobRun } from '@/lib/admin/job-log';
  import { logServerEvent } from '@/lib/server-error-logger';

  export const runtime = 'nodejs';
  export const maxDuration = 120;
  export const dynamic = 'force-dynamic';

  interface CheckResult { check: string; status: 'pass' | 'fail'; count: number; sample: unknown[]; }

  export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }

    return recordJobRun('integrity-check', async () => {
      const admin = createAdminClient();
      const rpc = admin.rpc.bind(admin) as unknown as (
        fn: 'run_integrity_checks',
      ) => Promise<{ data: CheckResult[] | null; error: { message: string } | null }>;
      const { data, error } = await rpc('run_integrity_checks');
      if (error) throw new Error(`run_integrity_checks failed: ${error.message}`);

      const checks = data ?? [];
      for (const check of checks) {
        await logServerEvent(
          `Integrity ${check.status.toUpperCase()}: ${check.check} (${check.count})`,
          {
            action: `integrity.${check.check}`,
            source: 'integrity',
            metadata: { count: check.count, sample: check.sample },
            skipSentry: check.status === 'pass',
          },
          check.status === 'pass' ? 'info' : 'error',
        );
      }
      return NextResponse.json({
        ok: true,
        failed: checks.filter((c) => c.status === 'fail').map((c) => c.check),
      });
    });
  }
  ```

- [ ] 3. Create `src/app/api/cron/log-retention/route.ts` (info 90d / error+critical 13mo; bounded batches so a 90k-row table never long-locks shared prod):
  ```typescript
  import { NextResponse, type NextRequest } from 'next/server';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { recordJobRun } from '@/lib/admin/job-log';

  export const runtime = 'nodejs';
  export const maxDuration = 300;
  export const dynamic = 'force-dynamic';

  const BATCH = 5000;
  const MAX_BATCHES = 20;

  export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }

    return recordJobRun('log-retention', async () => {
      const admin = createAdminClient();
      const ago90d = new Date(Date.now() - 90 * 86400_000).toISOString();
      const ago13mo = new Date(Date.now() - 396 * 86400_000).toISOString();
      let deleted = 0;

      async function purge(table: 'admin_events' | 'error_logs' | 'background_job_logs', column: string, filters: (q: any) => any) {
        for (let i = 0; i < MAX_BATCHES; i++) {
          const { data: victims } = await filters(
            admin.from(table).select('id'),
          ).order(column, { ascending: true }).limit(BATCH);
          const ids = (victims ?? []).map((v: { id: string }) => v.id);
          if (ids.length === 0) return;
          const { error } = await admin.from(table).delete().in('id', ids);
          if (error) throw new Error(`retention delete ${table}: ${error.message}`);
          deleted += ids.length;
          if (ids.length < BATCH) return;
        }
      }

      // admin_events: info/warning past 90d; error/critical past 13mo (resolved or not — 13mo is the forensic window).
      await purge('admin_events', 'created_at', (q) => q.in('severity', ['info', 'warning']).lt('created_at', ago90d));
      await purge('admin_events', 'created_at', (q) => q.in('severity', ['error', 'critical']).lt('created_at', ago13mo));
      await purge('error_logs', 'timestamp', (q) => q.in('severity', ['info', 'warning']).lt('timestamp', ago90d));
      await purge('error_logs', 'timestamp', (q) => q.lt('timestamp', ago13mo));
      await purge('background_job_logs', 'started_at', (q) => q.lt('started_at', ago90d));

      return NextResponse.json({ ok: true, deleted });
    });
  }
  ```
  EXECUTOR NOTE: confirm `error_logs`'s timestamp column name (`timestamp` per `server-error-logger.ts:137`) against generated types. The `(q: any)` builder-passing is deliberate minimalism — if lint rejects `any`, type it `PostgrestFilterBuilder` from `@supabase/postgrest-js` or inline the five purge calls.

- [ ] 4. Add both schedules to `vercel.json` `crons` (after the last entry):
  ```json
      {
        "path": "/api/cron/integrity-check",
        "schedule": "0 7 * * *"
      },
      {
        "path": "/api/cron/log-retention",
        "schedule": "30 7 * * *"
      }
  ```
  (This also turns the Task 1 registry contract test green with 16 entries.)

- [ ] 5. Gates + smoke:
  ```bash
  npm run test:run && npm run typecheck && npm run lint
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/integrity-check
  ```
  Expected: JSON `{ ok: true, failed: [...] }`; 4 `source='integrity'` rows in `admin_events`; a `background_job_logs` row for `integrity-check`.

- [ ] 6. Commit: `feat(admin): nightly integrity checks + log retention crons (W11)`

---

### Task 4 — `/admin/jobs` page

**Files**
- Create: `src/lib/admin/data/jobs.ts`
- Create: `src/app/admin/jobs/page.tsx`

**Steps**

- [ ] 1. Implement `src/lib/admin/data/jobs.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { CRON_REGISTRY, classifyCronStatus, type CronBoardStatus, type CronRegistryEntry } from '@/lib/admin/cron-registry';

  export interface CronBoardRow extends CronRegistryEntry {
    status: CronBoardStatus;
    lastRunAt: string | null;
    lastDurationMs: number | null;
    lastError: string | null;
  }
  export interface IntegrityRow { check: string; status: 'pass' | 'fail'; count: number; lastRunAt: string; }

  /** CALLER must have passed requireSuperAdmin(). */
  export async function fetchJobsTab() {
    const admin = createAdminClient();
    const now = new Date();

    const [jobRows, integrityRows, adminEventsCount, errorLogsCount, jobLogsCount] = await Promise.all([
      admin.from('background_job_logs')
        .select('job_type, status, duration_ms, error_message, started_at')
        .order('started_at', { ascending: false })
        .limit(500),
      admin.from('admin_events')
        .select('title, severity, metadata, created_at')
        .eq('source', 'integrity')
        .order('created_at', { ascending: false })
        .limit(50),
      admin.from('admin_events').select('id', { count: 'exact', head: true }),
      admin.from('error_logs').select('id', { count: 'exact', head: true }),
      admin.from('background_job_logs').select('id', { count: 'exact', head: true }),
    ]);

    const latestByJob = new Map<string, { started_at: string; status: string; duration_ms: number | null; error_message: string | null }>();
    for (const row of (jobRows.data ?? []) as Array<{ job_type: string; status: string; duration_ms: number | null; error_message: string | null; started_at: string }>) {
      if (!latestByJob.has(row.job_type)) latestByJob.set(row.job_type, row);
    }

    const board: CronBoardRow[] = CRON_REGISTRY.map((entry) => {
      const last = latestByJob.get(entry.jobType) ?? null;
      return {
        ...entry,
        status: classifyCronStatus(entry, last, now),
        lastRunAt: last?.started_at ?? null,
        lastDurationMs: last?.duration_ms ?? null,
        lastError: last?.error_message ?? null,
      };
    });

    const latestIntegrity = new Map<string, IntegrityRow>();
    for (const row of (integrityRows.data ?? []) as Array<{ title: string; severity: string; metadata: { count?: number } | null; created_at: string }>) {
      const name = row.title.replace(/^Integrity (PASS|FAIL): /, '').replace(/ \(\d+\)$/, '');
      if (!latestIntegrity.has(name)) {
        latestIntegrity.set(name, {
          check: name,
          status: row.severity === 'info' ? 'pass' : 'fail',
          count: row.metadata?.count ?? 0,
          lastRunAt: row.created_at,
        });
      }
    }

    return {
      board,
      integrity: [...latestIntegrity.values()],
      logHealth: {
        adminEvents: adminEventsCount.count ?? 0,
        errorLogs: errorLogsCount.count ?? 0,
        jobLogs: jobLogsCount.count ?? 0,
      },
      inngestActivated: Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY),
    };
  }
  ```

- [ ] 2. Create `src/app/admin/jobs/page.tsx`:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchJobsTab } from '@/lib/admin/data/jobs';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { AutoRefresh } from '../_components/AutoRefresh';
  import { StatusPill } from '@/components/fairway';

  export const dynamic = 'force-dynamic';

  const STATUS_TONE = {
    ok: 'success', overdue: 'danger', 'never-ran': 'neutral', failed: 'danger',
  } as const;

  async function JobsBody() {
    const tab = await fetchJobsTab();
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
            Cron board — expected vs actual
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
                <th className="py-2">Job</th><th>Status</th><th>Last run</th><th>Duration</th><th>Cadence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200/60">
              {tab.board.map((row) => (
                <tr key={row.jobType}>
                  <td className="py-2 font-fw-mono text-xs">{row.jobType}</td>
                  <td><StatusPill tone={STATUS_TONE[row.status]} dot size="sm">{row.status}</StatusPill></td>
                  <td className="font-fw-mono text-xs tabular-nums">
                    {row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : 'awaiting first run'}
                  </td>
                  <td className="font-fw-mono text-xs tabular-nums">{row.lastDurationMs != null ? `${row.lastDurationMs}ms` : '—'}</td>
                  <td className="font-fw-mono text-xs tabular-nums">{row.cadenceMinutes}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Data-integrity checks</h2>
          {tab.integrity.length === 0 ? (
            <p className="text-sm text-warm-500">Awaiting first nightly run (07:00 UTC).</p>
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {tab.integrity.map((c) => (
                <li key={c.check} className="flex items-center gap-3 py-2 text-sm">
                  <StatusPill tone={c.status === 'pass' ? 'success' : 'danger'} dot size="sm">{c.status}</StatusPill>
                  <span className="min-w-0 flex-1 font-fw-mono text-xs">{c.check}</span>
                  <span className="font-fw-mono text-xs tabular-nums">{c.count} offending</span>
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">{new Date(c.lastRunAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">admin_events rows</p>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.logHealth.adminEvents.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">error_logs rows</p>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.logHealth.errorLogs.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">job log rows</p>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.logHealth.jobLogs.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <p className="text-xs uppercase tracking-widest text-warm-500">Inngest</p>
            <p className="text-sm">{tab.inngestActivated ? 'activated' : 'not activated (keys absent)'}</p>
          </div>
        </section>
      </div>
    );
  }

  export default async function JobsPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh intervalMs={60_000} />
        <PanelBoundary title="Jobs & Integrity"><JobsBody /></PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 3. Gates:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```

- [ ] 4. Commit: `feat(admin): jobs & integrity tab — cron board, checks grid, log health (W11)`

---

## Acceptance Criteria

- [ ] `background_job_logs` gains rows from every triggered cron (was: zero writers); the coverage contract test pins all 16 routes to `recordJobRun`.
- [ ] Cron board renders all 16 registry entries; untriggered jobs read `never-ran`/`awaiting first run` (honest), and a job silenced past 1.5× cadence flips to OVERDUE (test-pinned).
- [ ] `run_integrity_checks()` is callable ONLY by service_role (anon/authenticated EXECUTE revoked, ACL-asserted in-migration); the nightly run writes 4 `source='integrity'` events; failures escalate severity `error` (feeds the W5 banner).
- [ ] Anon-grant drift on the six sensitive tables is now continuously monitored (the recurring-gotcha watchdog).
- [ ] Retention deletes in bounded batches; after the first run, W5's "Cron outcomes" watcher chip flips from STALE to flowing.
- [ ] All gates green; 8 new tests pass.

## Rollback

`git revert` (route wrappers unwind — crons behave exactly as before; the two new cron routes disappear; remove the 2 vercel.json entries in the same revert). DB: `DROP FUNCTION public.run_integrity_checks();` if required; `background_job_logs` rows are inert data.
