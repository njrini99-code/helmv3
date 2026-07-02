# W9: Baseball Tab (+ Lift Lab)

**Goal:** Ship `/admin/baseball` — the admin surface that has NEVER existed: activity pulse from the C5 rollup (computed on every old golf-admin load, rendered nowhere — `BaseballOps.tsx` is dead code), teams registry, Lift Lab panel, honest event-level readiness card, and the absorbed demo-sessions table — all in the clay ink built in W4.

**Depends-on:** W4 (clay token + SportBadge + TeamHealthTable), W8 (`classifyTeamHealth`).

**PR-scope:** ONE PR.

**Data-layer facts (verified):** `fetchAdminRollupB()` (`src/app/golf/actions/admin/rollup-b.ts:568-572`) invokes C5 `get_admin_baseball_rollup` with the SERVICE-ROLE client — unlike rollup-a, its gate discipline is out-of-band verification by the orchestrator (documented in `rollup-a.ts:8-15`), and it already runs this way on every legacy admin load. Our pages call it strictly AFTER `requireSuperAdmin()`, preserving the existing discipline. The typed payload is `RollupBBaseball` (`rollup-b.ts:101-119`). Baseball demo sessions come from `getBaseballDemoSessions()` (`src/app/baseball/actions/demo-tracking.ts:37` — internal `role='admin'` check at :48, double-gated like the Tracer port). OQ10 stands: baseball/lifting events carry sport-only attribution in v1.

---

### Task 1 — Baseball data layer + readiness logic

**Files**
- Create: `src/lib/admin/data/baseball.ts`
- Create: `src/lib/admin/data/__tests__/baseball.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export interface ReadinessEntry { table: string; label: string; rows: number; state: 'live' | 'awaiting-ingestion'; }
  export function classifyReadiness(entries: Array<{ table: string; label: string; rows: number }>): ReadinessEntry[];
  export interface BaseballTeamRow {
    teamId: string; name: string; playerCount: number;
    lastActivity: string | null; health: TeamHealth; errors7d: number;
  }
  export async function fetchBaseballTab(): Promise<{
    rollup: RollupBBaseball;
    teams: BaseballTeamRow[];
    liftLab: { athletes: number; sessions7d: number; setResults7d: number; checkins7d: number };
    readiness: ReadinessEntry[];
    weeklyPulse: { games7d: number; practices7d: number; checkins7d: number };
  }>;
  ```
- Consumes: `fetchAdminRollupB` + `RollupBBaseball` from `@/app/golf/actions/admin/rollup-b`, `classifyTeamHealth`/`TeamHealth` from `@/lib/admin/data/golf` (W8), `createAdminClient`.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/baseball.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { classifyReadiness } from '@/lib/admin/data/baseball';

  describe('classifyReadiness', () => {
    it('marks 0-row event tables as awaiting-ingestion (honest zero-state, not broken)', () => {
      const out = classifyReadiness([
        { table: 'baseball_plate_appearances', label: 'Plate appearances', rows: 0 },
        { table: 'baseball_pitch_events', label: 'Pitch events', rows: 0 },
      ]);
      expect(out.every((e) => e.state === 'awaiting-ingestion')).toBe(true);
    });
    it('flips live automatically once rows exist', () => {
      const out = classifyReadiness([{ table: 'baseball_pitch_events', label: 'Pitch events', rows: 12 }]);
      expect(out[0]).toMatchObject({ state: 'live', rows: 12 });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/baseball.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/baseball.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { fetchAdminRollupB, type RollupBBaseball } from '@/app/golf/actions/admin/rollup-b';
  import { classifyTeamHealth, type TeamHealth } from '@/lib/admin/data/golf';

  export interface ReadinessEntry {
    table: string;
    label: string;
    rows: number;
    state: 'live' | 'awaiting-ingestion';
  }

  export function classifyReadiness(
    entries: Array<{ table: string; label: string; rows: number }>,
  ): ReadinessEntry[] {
    return entries.map((e) => ({
      ...e,
      state: e.rows > 0 ? 'live' : 'awaiting-ingestion',
    }));
  }

  export interface BaseballTeamRow {
    teamId: string;
    name: string;
    playerCount: number;
    lastActivity: string | null;
    health: TeamHealth;
    errors7d: number;
  }

  const EVENT_LEVEL_TABLES = [
    { table: 'baseball_plate_appearances', label: 'Plate appearances' },
    { table: 'baseball_pitch_events', label: 'Pitch events' },
    { table: 'baseball_batted_ball_events', label: 'Batted-ball events' },
  ] as const;

  /** CALLER must have passed requireSuperAdmin(). */
  export async function fetchBaseballTab() {
    const admin = createAdminClient();
    const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const now = new Date();

    const [rollupB, teamsRes, membersRes, gamesRes, practicesRes, checkinsRes, errorRes,
      liftAthletes, liftSessions, liftSets, liftCheckins, ...eventCounts] = await Promise.all([
      fetchAdminRollupB(),
      admin.from('baseball_teams').select('id, name'),
      admin.from('baseball_team_members').select('team_id'),
      admin.from('baseball_games').select('team_id, created_at').order('created_at', { ascending: false }).limit(500),
      admin.from('baseball_practices').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
      admin.from('baseball_readiness_checkins').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
      admin.from('admin_events').select('team_id')
        .eq('sport', 'baseball').eq('event_type', 'error').gte('created_at', ago7d).limit(1000),
      admin.from('helm_lifting_athletes').select('id', { count: 'exact', head: true }),
      admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
      admin.from('helm_lifting_set_results').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
      admin.from('helm_lifting_readiness_checkins').select('id', { count: 'exact', head: true }).gte('created_at', ago7d),
      ...EVENT_LEVEL_TABLES.map((t) =>
        admin.from(t.table).select('id', { count: 'exact', head: true }),
      ),
    ]);

    const memberCounts = new Map<string, number>();
    for (const m of membersRes.data ?? []) {
      const tid = (m as { team_id: string | null }).team_id;
      if (tid) memberCounts.set(tid, (memberCounts.get(tid) ?? 0) + 1);
    }
    const errorCounts = new Map<string, number>();
    for (const e of errorRes.data ?? []) {
      const tid = (e as { team_id: string | null }).team_id;
      if (tid) errorCounts.set(tid, (errorCounts.get(tid) ?? 0) + 1);
    }
    const games = (gamesRes.data ?? []) as Array<{ team_id: string | null; created_at: string }>;
    const lastGame = new Map<string, string>();
    let games7d = 0;
    for (const g of games) {
      if (g.created_at >= ago7d) games7d += 1;
      if (g.team_id && !lastGame.has(g.team_id)) lastGame.set(g.team_id, g.created_at);
    }

    const teams: BaseballTeamRow[] = (teamsRes.data ?? []).map((t) => {
      const row = t as { id: string; name: string };
      const lastActivity = lastGame.get(row.id) ?? null;
      return {
        teamId: row.id,
        name: row.name,
        playerCount: memberCounts.get(row.id) ?? 0,
        lastActivity,
        health: classifyTeamHealth(lastActivity, now),
        errors7d: errorCounts.get(row.id) ?? 0,
      };
    });

    return {
      rollup: rollupB.baseball,
      teams,
      liftLab: {
        athletes: liftAthletes.count ?? 0,
        sessions7d: liftSessions.count ?? 0,
        setResults7d: liftSets.count ?? 0,
        checkins7d: liftCheckins.count ?? 0,
      },
      readiness: classifyReadiness(
        EVENT_LEVEL_TABLES.map((t, i) => ({
          table: t.table,
          label: t.label,
          rows: eventCounts[i]?.count ?? 0,
        })),
      ),
      weeklyPulse: {
        games7d,
        practices7d: practicesRes.count ?? 0,
        checkins7d: checkinsRes.count ?? 0,
      },
    };
  }
  ```
  EXECUTOR NOTE: confirm `rollupB.baseball` is the field name on the `RollupB` combined type (read `rollup-b.ts`'s `RollupB` interface) and that the three event-level table names exist in `src/lib/types/database.ts` — if a name differs (e.g. `baseball_batted_ball_events`), conform to the generated types.

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/baseball.test.ts
  npm run typecheck
  ```

- [ ] 5. Commit: `feat(admin): baseball tab data layer — C5 rollup finally consumed (W9)`

---

### Task 2 — Demo-sessions delegation + Baseball page

**Files**
- Create: `src/app/admin/actions/baseball-demo.ts`
- Create: `src/app/admin/baseball/page.tsx`

**Interfaces**
- Produces:
  ```typescript
  // actions/baseball-demo.ts ('use server')
  export async function bridgeGetBaseballDemoSessions(): ReturnType<typeof getBaseballDemoSessions>;
  ```

**Steps**

- [ ] 1. Create `src/app/admin/actions/baseball-demo.ts`:
  ```typescript
  'use server';

  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { getBaseballDemoSessions } from '@/app/baseball/actions/demo-tracking';

  /** Double gate: requireSuperAdmin() + the legacy action's internal
   *  role='admin' check (demo-tracking.ts:48). The unguarded
   *  /baseball/admin/demo-sessions page is retired in W14. */
  export async function bridgeGetBaseballDemoSessions() {
    await requireSuperAdmin();
    return getBaseballDemoSessions();
  }
  ```

- [ ] 2. Create `src/app/admin/baseball/page.tsx` — clay-inked lanes (accents only; the shell stays neutral; NEVER the golf green in this pane):
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchBaseballTab } from '@/lib/admin/data/baseball';
  import { bridgeGetBaseballDemoSessions } from '../actions/baseball-demo';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { PanelNoData } from '../_components/PanelStates';
  import { KpiTile } from '../_components/KpiTile';
  import { TeamHealthTable } from '../_components/TeamHealthTable';
  import { AutoRefresh } from '../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  async function BaseballBody() {
    const tab = await fetchBaseballTab();
    return (
      <div className="space-y-6 border-l-2 border-team-baseball/40 pl-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Games 7d" value={tab.weeklyPulse.games7d} href="/admin/baseball" />
          <KpiTile label="Practices 7d" value={tab.weeklyPulse.practices7d} href="/admin/baseball" />
          <KpiTile label="Check-ins 7d" value={tab.weeklyPulse.checkins7d} href="/admin/baseball" />
          <KpiTile label="Errors 7d (baseball)" value={tab.teams.reduce((s, t) => s + t.errors7d, 0)} href="/admin/errors?sport=baseball" goodDirection="down" />
        </div>

        <section className="rounded-2xl border border-team-baseball/30 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-team-baseball">Teams registry</h2>
          <TeamHealthTable
            teams={tab.teams.map((t) => ({ ...t, href: `/admin/users?team=${t.teamId}` }))}
          />
          <p className="mt-2 font-fw-mono text-xs tabular-nums text-warm-500">
            {tab.rollup.totalPlayers} players · {tab.rollup.totalCoaches} coaches ·{' '}
            {tab.rollup.playersOnboarded} players onboarded
          </p>
        </section>

        <section className="rounded-2xl border border-team-baseball/30 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-team-baseball">Lift Lab</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><p className="font-fw-mono text-2xl tabular-nums">{tab.liftLab.athletes}</p><p className="text-xs text-warm-500">athletes</p></div>
            <div><p className="font-fw-mono text-2xl tabular-nums">{tab.liftLab.sessions7d}</p><p className="text-xs text-warm-500">sessions 7d</p></div>
            <div><p className="font-fw-mono text-2xl tabular-nums">{tab.liftLab.setResults7d}</p><p className="text-xs text-warm-500">set results 7d</p></div>
            <div><p className="font-fw-mono text-2xl tabular-nums">{tab.liftLab.checkins7d}</p><p className="text-xs text-warm-500">check-ins 7d</p></div>
          </div>
        </section>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Event-level data readiness</h2>
          <ul className="space-y-2">
            {tab.readiness.map((r) => (
              <li key={r.table} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">{r.label}</span>
                {r.state === 'live' ? (
                  <span className="rounded-full bg-fw-success-bg px-2 py-0.5 font-fw-mono text-xs text-accent-700">
                    {r.rows} rows
                  </span>
                ) : (
                  <span className="rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-600">
                    no data yet — appears here once ingestion starts
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  async function DemoSessions() {
    const result = await bridgeGetBaseballDemoSessions();
    const sessions = Array.isArray(result) ? result : (result as { sessions?: unknown[] }).sessions ?? [];
    if (sessions.length === 0) {
      return <PanelNoData label="No demo sessions" description="Demo-gate visits appear here." />;
    }
    return (
      <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Demo sessions ({sessions.length})
        </h2>
        <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(sessions.slice(0, 25), null, 2)}</pre>
      </section>
    );
  }

  export default async function BaseballAdminPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh />
        <PanelBoundary title="Baseball"><BaseballBody /></PanelBoundary>
        <PanelBoundary title="Demo sessions"><DemoSessions /></PanelBoundary>
      </main>
    );
  }
  ```
  EXECUTOR NOTE: read `GetBaseballDemoSessionsResult` in `demo-tracking.ts` and replace the defensive `Array.isArray` unwrap + `<pre>` dump with a proper table over the REAL result fields (visitor, timestamps, converted). The `<pre>` is a placeholder pattern only acceptable while the shape is confirmed — the committed PR must render real columns.

- [ ] 3. Gates + smoke:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Manual: `/admin/baseball` shows 9 teams, Lift Lab counts > 0, readiness card says "no data yet" for all three event tables (correct — they are 0-row), demo sessions render.

- [ ] 4. Commit: `feat(admin): baseball tab — pulse, registry, Lift Lab, readiness, demos (W9)`

---

## Acceptance Criteria

- [ ] `/admin/baseball` renders the C5 rollup for the first time anywhere (compare counts against direct SQL: `SELECT count(*) FROM baseball_teams;` etc.).
- [ ] Lift Lab panel shows live sessions/check-ins (currently small but non-zero).
- [ ] Event-level readiness card renders explicit "no data yet — appears once ingestion starts" for the 0-row tables (never a bare blank tile), and flips live automatically when rows exist (test-pinned).
- [ ] Clay ink (`team-baseball`) is the ONLY accent in baseball lanes; no golf green inside the pane; the neutral shell unchanged.
- [ ] Demo sessions double-gated (requireSuperAdmin + legacy role check).
- [ ] All gates green; 2 new tests pass.

## Rollback

`git revert` — `/admin/baseball` disappears; `demo-tracking.ts` and `rollup-b.ts` were never modified; no DB changes.
