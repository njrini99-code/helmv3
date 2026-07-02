# W8: Golf Tab (+ Tracer Port)

**Goal:** Ship `/admin/golf` — activity pulse, teams health, CoachHelm engine health, AI/LLM spend, demo strip — plus the ported Tracer data-quality suite (the only admin surface with remediation powers), preserved with its null-score refusal guard intact.

**Depends-on:** W3 (data layer patterns), W4 (chrome), W5 (AutoRefresh/panels).

**PR-scope:** ONE PR.

**Gate discipline:** the legacy tracer actions (`src/app/golf/actions/admin-tracer-data.ts` — exports verified: `getTracerData:650`, `getTracerEnrichedData:1163`, `getTracerRoundDiagnostic:1286`, `fixRoundData:1372`) each internally check `users.role === 'admin'` (lines 661/1173/1296/1393). Nick's account HOLDS `role='admin'` (it also gates the CRM per OQ9), so `/admin` wrappers add `requireSuperAdmin()` FIRST and then delegate — the double gate passes for Nick and nobody else. Do NOT rewrite the legacy internal gates in this wave.

Similarly, the rollup RPCs (`get_admin_rounds_rollup`, `get_admin_coachhelm_rollup`, etc.) keep their internal `role='admin'` checks and are called with Nick's USER-SCOPED client via the existing `fetchAdminRollupA()` (`src/app/golf/actions/admin/rollup-a.ts:298-352`) — never service_role (509-storm rule).

---

### Task 1 — Golf data layer

**Files**
- Create: `src/lib/admin/data/golf.ts`
- Create: `src/lib/admin/data/__tests__/golf.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export type TeamHealth = 'active' | 'cooling' | 'dormant';
  export function classifyTeamHealth(lastActivityIso: string | null, now: Date): TeamHealth;
  export interface GolfTeamHealthRow {
    teamId: string; name: string; playerCount: number;
    lastActivity: string | null; health: TeamHealth; errors7d: number;
  }
  export async function fetchGolfTab(): Promise<{
    rollup: RollupA;                       // rounds + users + featureAdoption + coachhelm (user-scoped RPCs)
    teams: GolfTeamHealthRow[];
    llm: { calls30d: number; cost30d: number; budgetRemaining: number | null };
    demos: { demoSessions30d: number; demoRequests: number };
  }>;
  ```
- Consumes: `fetchAdminRollupA` + `RollupA` from `@/app/golf/actions/admin/rollup-a` (existing, exact types at `rollup-a.ts:191-201`), `createAdminClient`.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/golf.test.ts` (pure health model — 7-14d amber, 14d+ red):
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { classifyTeamHealth } from '@/lib/admin/data/golf';

  const now = new Date('2026-07-01T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

  describe('classifyTeamHealth', () => {
    it('active within 7d', () => {
      expect(classifyTeamHealth(daysAgo(2), now)).toBe('active');
    });
    it('cooling between 7 and 14d', () => {
      expect(classifyTeamHealth(daysAgo(10), now)).toBe('cooling');
    });
    it('dormant past 14d or never', () => {
      expect(classifyTeamHealth(daysAgo(30), now)).toBe('dormant');
      expect(classifyTeamHealth(null, now)).toBe('dormant');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/golf.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/golf.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { fetchAdminRollupA, type RollupA } from '@/app/golf/actions/admin/rollup-a';

  export type TeamHealth = 'active' | 'cooling' | 'dormant';

  export function classifyTeamHealth(lastActivityIso: string | null, now: Date): TeamHealth {
    if (!lastActivityIso) return 'dormant';
    const ageDays = (now.getTime() - new Date(lastActivityIso).getTime()) / 86400_000;
    if (ageDays <= 7) return 'active';
    if (ageDays <= 14) return 'cooling';
    return 'dormant';
  }

  export interface GolfTeamHealthRow {
    teamId: string;
    name: string;
    playerCount: number;
    lastActivity: string | null;
    health: TeamHealth;
    errors7d: number;
  }

  /** CALLER must have passed requireSuperAdmin(). fetchAdminRollupA uses the
   *  invoking admin's USER-SCOPED client internally (rollup-a.ts:298-303) —
   *  the SECURITY DEFINER gates need auth.uid(), so this function must run in
   *  a request context with Nick's session. */
  export async function fetchGolfTab(): Promise<{
    rollup: RollupA;
    teams: GolfTeamHealthRow[];
    llm: { calls30d: number; cost30d: number; budgetRemaining: number | null };
    demos: { demoSessions30d: number; demoRequests: number };
  }> {
    const admin = createAdminClient();
    const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const ago30d = new Date(Date.now() - 30 * 86400_000).toISOString();
    const now = new Date();

    const [rollup, teamsRes, membersRes, errorRes, llmCallsRes, llmBudgetRes, demoSessionsRes, demoRequestsRes] =
      await Promise.all([
        fetchAdminRollupA(),
        admin.from('golf_teams').select('id, name'),
        admin.from('golf_team_members').select('team_id'),
        admin.from('admin_events').select('team_id')
          .eq('sport', 'golf').eq('event_type', 'error').gte('created_at', ago7d).limit(1000),
        admin.from('golf_coachhelm_llm_calls').select('cost_usd').gte('created_at', ago30d).limit(1000),
        admin.from('golf_coachhelm_llm_budget').select('*').order('created_at', { ascending: false }).limit(1),
        admin.from('golf_demo_sessions').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
        admin.from('demo_requests').select('id', { count: 'exact', head: true }),
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
    // Last activity per team from the rollup's bounded 12-week round slice.
    const lastRound = new Map<string, string>();
    for (const r of rollup.allRoundsMinimal) {
      if (r.team_id && (!lastRound.has(r.team_id) || r.created_at > lastRound.get(r.team_id)!)) {
        lastRound.set(r.team_id, r.created_at);
      }
    }

    const teams: GolfTeamHealthRow[] = (teamsRes.data ?? []).map((t) => {
      const row = t as { id: string; name: string };
      const lastActivity = lastRound.get(row.id) ?? null;
      return {
        teamId: row.id,
        name: row.name,
        playerCount: memberCounts.get(row.id) ?? 0,
        lastActivity,
        health: classifyTeamHealth(lastActivity, now),
        errors7d: errorCounts.get(row.id) ?? 0,
      };
    });

    const llmCalls = (llmCallsRes.data ?? []) as Array<{ cost_usd: number | null }>;
    const budgetRow = (llmBudgetRes.data?.[0] ?? null) as { remaining_usd?: number | null } | null;

    return {
      rollup,
      teams: teams.sort((a, b) => (a.health === b.health ? b.errors7d - a.errors7d : a.health.localeCompare(b.health))),
      llm: {
        calls30d: llmCalls.length,
        cost30d: llmCalls.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0),
        budgetRemaining: budgetRow?.remaining_usd ?? null,
      },
      demos: {
        demoSessions30d: demoSessionsRes.count ?? 0,
        demoRequests: demoRequestsRes.count ?? 0,
      },
    };
  }
  ```
  EXECUTOR NOTE: verify the exact column names on `golf_coachhelm_llm_calls` (`cost_usd`, `created_at`) and `golf_coachhelm_llm_budget` (`remaining_usd`) against `src/lib/types/database.ts` before compiling — the table comment says it was purpose-built for this dashboard, but the plan does not guess columns: conform to the generated types and adjust the two field names here if they differ.

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/golf.test.ts
  npm run typecheck
  ```

- [ ] 5. Commit: `feat(admin): golf tab data layer — rollup, team health, llm spend (W8)`

---

### Task 2 — Tracer wrappers under the new gate

**Files**
- Create: `src/app/admin/actions/golf-tracer.ts`

**Interfaces**
- Produces (thin delegations — the legacy internals, including the `fixRoundData` null-score refusal guard, are NOT modified):
  ```typescript
  export async function bridgeGetTracerData(): Promise<TracerData>;
  export async function bridgeGetTracerRoundDiagnostic(roundId: string): Promise<TracerRoundDiagnosticData>;
  export async function bridgeFixRoundData(...args: Parameters<typeof fixRoundData>): ReturnType<typeof fixRoundData>;
  ```

**Steps**

- [ ] 1. Create `src/app/admin/actions/golf-tracer.ts`:
  ```typescript
  'use server';

  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import {
    getTracerData,
    getTracerRoundDiagnostic,
    fixRoundData,
    type TracerData,
    type TracerRoundDiagnosticData,
  } from '@/app/golf/actions/admin-tracer-data';

  /**
   * Helm Bridge → Tracer delegation. requireSuperAdmin() first (Layer 2);
   * the legacy actions then re-check users.role='admin' internally
   * (admin-tracer-data.ts:661/1296/1393) — a deliberate DOUBLE gate during
   * the transition. fixRoundData performs service-role UPDATEs on live
   * golf_rounds/golf_holes; its null-score refusal guard ships UNTOUCHED.
   */

  export async function bridgeGetTracerData(): Promise<TracerData> {
    await requireSuperAdmin();
    return getTracerData();
  }

  export async function bridgeGetTracerRoundDiagnostic(
    roundId: string,
  ): Promise<TracerRoundDiagnosticData> {
    await requireSuperAdmin();
    return getTracerRoundDiagnostic(roundId);
  }

  export async function bridgeFixRoundData(
    ...args: Parameters<typeof fixRoundData>
  ): ReturnType<typeof fixRoundData> {
    await requireSuperAdmin();
    return fixRoundData(...args);
  }
  ```

- [ ] 2. Gates (the W1 contract test verifies these actions carry the gate):
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck
  ```

- [ ] 3. Commit: `feat(admin): tracer suite delegated behind requireSuperAdmin (W8)`

---

### Task 3 — Golf page

**Files**
- Create: `src/app/admin/golf/page.tsx`
- Create: `src/app/admin/golf/tracer/page.tsx`
- Create: `src/app/admin/_components/TeamHealthTable.tsx`

**Interfaces** — consumes Tasks 1-2 + W4 components. Golf lanes use the existing green accent (`accent-*` / `fw-success`) — never the clay ink.

**Steps**

- [ ] 1. Create `src/app/admin/_components/TeamHealthTable.tsx` (shared with W9/W10 — sport-agnostic):
  ```tsx
  import Link from 'next/link';
  import { StatusPill } from '@/components/fairway';
  import type { TeamHealth } from '@/lib/admin/data/golf';

  const HEALTH_TONE: Record<TeamHealth, 'success' | 'warning' | 'danger'> = {
    active: 'success',
    cooling: 'warning',
    dormant: 'danger',
  };

  export interface TeamHealthEntry {
    teamId: string; name: string; playerCount: number;
    lastActivity: string | null; health: TeamHealth; errors7d: number;
    href: string;
  }

  export function TeamHealthTable({ teams }: { teams: TeamHealthEntry[] }) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="py-2">Team</th><th>Roster</th><th>Last activity</th><th>Health</th><th>Errors 7d</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {teams.map((t) => (
            <tr key={t.teamId}>
              <td className="py-2">
                <Link href={t.href} className="font-medium text-warm-900 underline-offset-2 hover:underline">
                  {t.name}
                </Link>
              </td>
              <td className="font-fw-mono tabular-nums">{t.playerCount}</td>
              <td className="font-fw-mono text-xs tabular-nums text-warm-600">
                {t.lastActivity ? new Date(t.lastActivity).toLocaleDateString() : 'never'}
              </td>
              <td><StatusPill tone={HEALTH_TONE[t.health]} dot size="sm">{t.health}</StatusPill></td>
              <td className="font-fw-mono tabular-nums">{t.errors7d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  ```

- [ ] 2. Create `src/app/admin/golf/page.tsx`:
  ```tsx
  import Link from 'next/link';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchGolfTab } from '@/lib/admin/data/golf';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { KpiTile } from '../_components/KpiTile';
  import { TeamHealthTable } from '../_components/TeamHealthTable';
  import { AutoRefresh } from '../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  async function GolfBody() {
    const tab = await fetchGolfTab();
    const r = tab.rollup.rounds;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Rounds this week" value={r.roundsThisWeek} delta={r.roundsThisWeek - r.roundsLastWeek} href="/admin/golf" />
          <KpiTile label="Rounds today" value={r.roundsToday} href="/admin/golf" />
          <KpiTile label="Insights this week" value={tab.rollup.coachhelm.insightsThisWeek} href="/admin/golf" />
          <KpiTile label="Insight failures 7d" value={tab.rollup.coachhelm.insightsFailed7d} href="/admin/errors?sport=golf" tone={tab.rollup.coachhelm.insightsFailed7d > 0 ? 'warning' : 'neutral'} goodDirection="down" />
        </div>

        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Teams health</h2>
          <TeamHealthTable
            teams={tab.teams.map((t) => ({ ...t, href: `/admin/users?team=${t.teamId}` }))}
          />
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">AI / LLM spend (30d)</h2>
            <p className="font-fw-mono text-2xl tabular-nums">${tab.llm.cost30d.toFixed(2)}</p>
            <p className="text-xs text-warm-500">
              {tab.llm.calls30d} calls · budget remaining{' '}
              {tab.llm.budgetRemaining === null ? 'n/a' : `$${tab.llm.budgetRemaining.toFixed(2)}`}
            </p>
          </section>
          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Demo & leads</h2>
            <p className="font-fw-mono text-2xl tabular-nums">{tab.demos.demoSessions30d}</p>
            <p className="text-xs text-warm-500">
              demo sessions 30d · {tab.demos.demoRequests} inbound requests ·{' '}
              <a href="/golf/admin/crm" className="text-accent-700 underline">outreach lives in the CRM →</a>
            </p>
          </section>
        </div>

        <Link
          href="/admin/golf/tracer"
          className="block rounded-2xl border border-accent-200 bg-accent-50 p-4 text-sm font-medium text-accent-700"
        >
          Tracer data-quality suite → (diagnostics + the only admin write powers)
        </Link>
      </div>
    );
  }

  export default async function GolfAdminPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh />
        <PanelBoundary title="Golf"><GolfBody /></PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 3. Create `src/app/admin/golf/tracer/page.tsx` — port strategy, not a rewrite: the page calls `bridgeGetTracerData()` server-side and reuses the EXISTING tracer UI components from `src/app/golf/admin/components/` where they are self-contained (read `src/app/golf/admin/components/index.ts` and the tracer tab component list first; import the round-diagnostic + quality-grid components directly — they live outside `crm/` and are pure props-in components). Where a legacy component reaches into the `AdminDashboardData` blob, inline a small local table instead (same discipline as TeamHealthTable). Minimum viable port for this wave:
  ```tsx
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { bridgeGetTracerData } from '@/app/admin/actions/golf-tracer';
  import { PanelBoundary } from '../../_components/PanelBoundary';
  import { AutoRefresh } from '../../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  async function TracerBody() {
    const data = await bridgeGetTracerData();
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Player data quality</h2>
          <ul className="divide-y divide-warm-200/60">
            {data.playerSummaries.map((p) => (
              <li key={p.playerId} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.playerName}</span>
                <span className="font-fw-mono text-xs tabular-nums">{p.roundCount} rounds</span>
                <span className="font-fw-mono text-xs tabular-nums">quality {p.qualityScore ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  export default async function TracerPage() {
    await requireSuperAdmin();
    return (
      <main className="space-y-6 p-6">
        <AutoRefresh intervalMs={60_000} />
        <PanelBoundary title="Tracer"><TracerBody /></PanelBoundary>
      </main>
    );
  }
  ```
  EXECUTOR NOTE: `TracerData`'s exact field names live at `admin-tracer-data.ts:141+` (`TracerPlayerSummary` at :13) — conform the JSX to the real interface fields (e.g. if it is `player_id`/`name`, use those). The per-round diagnostic + `bridgeFixRoundData` fix button is wired on `/admin/golf/tracer` as a follow-on client component in THIS PR only if the legacy `TracerRoundDetail` component ports cleanly; otherwise land read-only Tracer here and the fix-button port as the first W14 retirement prerequisite. Record the choice in the PR description.

- [ ] 4. Gates + smoke:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Manual: `/admin/golf` renders live rollup numbers matching `/golf/admin` (same RPCs, same session); Tracer list matches the legacy Tracer tab.

- [ ] 5. Commit: `feat(admin): golf tab — pulse, team health, llm spend, tracer port (W8)`

---

## Acceptance Criteria

- [ ] `/admin/golf` renders rounds/insights KPIs from the SAME user-scoped rollup RPCs the old admin used (numbers match side-by-side).
- [ ] Team health statuses follow the 7/14-day model (test-pinned); per-team error counts come from the new `admin_events.team_id` column (0s expected until emitters tag teams — honest, not broken).
- [ ] Zero calls to `get_admin_*_rollup` with `createAdminClient()` anywhere in the new code (grep `rollup` under `src/lib/admin/ src/app/admin/` and verify each call site).
- [ ] Tracer reads work behind the double gate; `bridgeFixRoundData` refuses null-score recalcs exactly as before (guard untouched — diff of `admin-tracer-data.ts` must be EMPTY this wave).
- [ ] LLM spend panel shows real `golf_coachhelm_llm_calls` totals.
- [ ] All gates green; 3 new tests pass.

## Rollback

`git revert` — `/admin/golf` disappears; `admin-tracer-data.ts` was never modified; no DB changes.
