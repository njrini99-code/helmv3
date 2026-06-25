// @vitest-environment node
// =============================================================================
// src/lib/baseball/daily-contract/__tests__/missed-sweep.test.ts
//
// Locks the Daily Contract MISSED roll-over invariants — the state-machine edge
// case the honesty model requires. The schema reserved status 'missed' for "a
// committed day passed without completion (set by app layer)"; this is the app
// layer. The sweep must:
//   - flip ONLY past 'committed' days to 'missed' (never today/future)
//   - leave 'completed' terminal and pure never-committed 'draft' days alone
//   - be idempotent (a re-run is a no-op)
//   - be non-destructive (items/reflection/visibility untouched)
//   - write a best-effort honest timeline echo without rolling back the flip
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

import {
  isMissedContract,
  missedTimelineCopy,
  sweepMissedContracts,
  isoMinusDays,
  type MissedSweepClient,
} from '@/lib/baseball/daily-contract/missed-sweep';
import { todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import type { DailyContractItem } from '@/lib/types/baseball-passport';

const TODAY = '2026-06-24';
const YESTERDAY = '2026-06-23';

function items(done: number, total: number): DailyContractItem[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `i${i}`,
    label: `intent ${i}`,
    category: 'general',
    done: i < done,
    skipped: false,
  }));
}

// -----------------------------------------------------------------------------
// isMissedContract — the pure transition predicate
// -----------------------------------------------------------------------------

describe('isMissedContract', () => {
  it('flips a PAST committed day', () => {
    expect(
      isMissedContract(
        { contract_date: YESTERDAY, status: 'committed', committed_at: '2026-06-23T12:00:00Z' },
        TODAY,
      ),
    ).toBe(true);
  });

  it('never touches today (still live)', () => {
    expect(
      isMissedContract(
        { contract_date: TODAY, status: 'committed', committed_at: '2026-06-24T08:00:00Z' },
        TODAY,
      ),
    ).toBe(false);
  });

  it('never touches a future day', () => {
    expect(
      isMissedContract(
        { contract_date: '2026-06-25', status: 'committed', committed_at: null },
        TODAY,
      ),
    ).toBe(false);
  });

  it('leaves a completed day terminal', () => {
    expect(
      isMissedContract(
        { contract_date: YESTERDAY, status: 'completed', committed_at: '2026-06-23T12:00:00Z' },
        TODAY,
      ),
    ).toBe(false);
  });

  it('is idempotent: an already-missed day is not re-missed', () => {
    expect(
      isMissedContract(
        { contract_date: YESTERDAY, status: 'missed', committed_at: '2026-06-23T12:00:00Z' },
        TODAY,
      ),
    ).toBe(false);
  });

  it('leaves a pure never-committed past draft alone (not an accountability miss)', () => {
    expect(
      isMissedContract(
        { contract_date: YESTERDAY, status: 'draft', committed_at: null },
        TODAY,
      ),
    ).toBe(false);
  });

  it('DOES miss a past draft that was actually committed (committed_at set)', () => {
    expect(
      isMissedContract(
        { contract_date: YESTERDAY, status: 'draft', committed_at: '2026-06-23T09:00:00Z' },
        TODAY,
      ),
    ).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// missedTimelineCopy — honest, partial-progress-aware echo
// -----------------------------------------------------------------------------

describe('missedTimelineCopy', () => {
  it('reports partial progress truthfully', () => {
    const { title } = missedTimelineCopy({
      id: 'c1',
      player_id: 'p1',
      team_id: 't1',
      contract_date: YESTERDAY,
      status: 'committed',
      committed_at: null,
      items: items(2, 4),
    });
    expect(title).toContain('2/4 honored');
  });

  it('handles an empty-item day without dividing by zero', () => {
    const { title } = missedTimelineCopy({
      id: 'c1',
      player_id: 'p1',
      team_id: 't1',
      contract_date: YESTERDAY,
      status: 'committed',
      committed_at: null,
      items: [],
    });
    expect(title).toContain('without completion');
  });
});

// -----------------------------------------------------------------------------
// isoMinusDays
// -----------------------------------------------------------------------------

describe('isoMinusDays', () => {
  it('subtracts UTC-safe across a month boundary', () => {
    expect(isoMinusDays('2026-07-01', 1)).toBe('2026-06-30');
  });
});

// -----------------------------------------------------------------------------
// sweepMissedContracts — the per-team driver over a fake client
// -----------------------------------------------------------------------------

interface Row {
  id: string;
  player_id: string;
  team_id: string;
  contract_date: string;
  status: string;
  committed_at: string | null;
  items: DailyContractItem[] | null;
}

/**
 * A tiny in-memory fake of the supabase query-builder surface the sweep uses:
 *   .from(table).select(...).eq().lt().in().order().limit()  (thenable read)
 *   .from(table).update(patch).eq().eq().in()                (thenable write)
 * Filters are applied to an internal rows[] so the test exercises the real
 * predicate + the real write path.
 */
function makeClient(rows: Row[]): { client: MissedSweepClient; rows: Row[] } {
  const store = rows;

  function builder(table: string) {
    let mode: 'select' | 'update' = 'select';
    let patch: Partial<Row> = {};
    const filters: Array<(r: Row) => boolean> = [];

    const b: Record<string, unknown> = {
      select() {
        mode = 'select';
        return b;
      },
      update(p: Partial<Row>) {
        mode = 'update';
        patch = p;
        return b;
      },
      eq(col: keyof Row, val: unknown) {
        filters.push((r) => r[col] === val);
        return b;
      },
      lt(col: keyof Row, val: string) {
        filters.push((r) => String(r[col]) < val);
        return b;
      },
      in(col: keyof Row, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      order() {
        return b;
      },
      // The sweep now paginates the candidate read via fetchAllRowsResult, which
      // ends the SELECT chain on `.range(from, to)` instead of `.limit()`. Resolve
      // the page slice so the pagination loop terminates on a short page.
      range(from: number, to: number) {
        if (mode === 'select') {
          const matched = store.filter((r) => filters.every((f) => f(r)));
          const data = matched.slice(from, to + 1);
          return Promise.resolve({ data, error: null });
        }
        return b;
      },
      limit() {
        // For SELECT: resolve the read now (legacy single-read path).
        if (mode === 'select') {
          const data = store.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data, error: null });
        }
        return b;
      },
      // UPDATE chains end on .in() (no .limit); make the builder thenable so
      // `await client.from().update().eq().eq().in()` resolves + applies the patch.
      then(resolve: (v: { data: null; error: null }) => void) {
        if (table !== 'baseball_player_daily_contracts') {
          resolve({ data: null, error: null });
          return;
        }
        for (const r of store) {
          if (filters.every((f) => f(r))) Object.assign(r, patch);
        }
        resolve({ data: null, error: null });
      },
    };
    return b;
  }

  return { client: { from: builder } as unknown as MissedSweepClient, rows: store };
}

describe('sweepMissedContracts', () => {
  it('flips only past committed rows and writes one timeline echo each', async () => {
    const rows: Row[] = [
      // past committed -> MISS
      { id: 'a', player_id: 'p1', team_id: 't1', contract_date: YESTERDAY, status: 'committed', committed_at: 'x', items: items(1, 3) },
      // today committed -> stays
      { id: 'b', player_id: 'p2', team_id: 't1', contract_date: TODAY, status: 'committed', committed_at: 'x', items: items(0, 2) },
      // past completed -> stays terminal
      { id: 'c', player_id: 'p3', team_id: 't1', contract_date: YESTERDAY, status: 'completed', committed_at: 'x', items: items(2, 2) },
      // past pure draft -> stays
      { id: 'd', player_id: 'p4', team_id: 't1', contract_date: YESTERDAY, status: 'draft', committed_at: null, items: items(0, 1) },
    ];
    const { client, rows: store } = makeClient(rows);
    const writer = vi.fn(async () => ({ ok: true }));

    const res = await sweepMissedContracts(client, 't1', TODAY, writer);

    expect(res.evaluated).toBe(1);
    expect(res.missed).toBe(1);
    expect(res.timelineWritten).toBe(1);
    expect(store.find((r) => r.id === 'a')!.status).toBe('missed');
    expect(store.find((r) => r.id === 'b')!.status).toBe('committed');
    expect(store.find((r) => r.id === 'c')!.status).toBe('completed');
    expect(store.find((r) => r.id === 'd')!.status).toBe('draft');
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a second pass over already-missed rows is a no-op', async () => {
    const rows: Row[] = [
      { id: 'a', player_id: 'p1', team_id: 't1', contract_date: YESTERDAY, status: 'committed', committed_at: 'x', items: items(1, 2) },
    ];
    const { client } = makeClient(rows);
    const writer = vi.fn(async () => ({ ok: true }));

    const first = await sweepMissedContracts(client, 't1', TODAY, writer);
    const second = await sweepMissedContracts(client, 't1', TODAY, writer);

    expect(first.missed).toBe(1);
    expect(second.missed).toBe(0);
    expect(second.evaluated).toBe(0);
    expect(writer).toHaveBeenCalledTimes(1); // only the first pass echoed
  });

  it('does NOT roll back the status flip when the timeline echo fails', async () => {
    const rows: Row[] = [
      { id: 'a', player_id: 'p1', team_id: 't1', contract_date: YESTERDAY, status: 'committed', committed_at: 'x', items: items(0, 2) },
    ];
    const { client, rows: store } = makeClient(rows);
    const writer = vi.fn(async () => {
      throw new Error('timeline down');
    });

    const res = await sweepMissedContracts(client, 't1', TODAY, writer);

    expect(res.missed).toBe(1);
    expect(res.timelineWritten).toBe(0);
    expect(store[0]!.status).toBe('missed'); // flip stands despite echo failure
  });

  it('preserves items/committed_at (non-destructive) on the flipped row', async () => {
    const orig = items(2, 4);
    const rows: Row[] = [
      { id: 'a', player_id: 'p1', team_id: 't1', contract_date: YESTERDAY, status: 'committed', committed_at: 'keep-me', items: orig },
    ];
    const { client, rows: store } = makeClient(rows);

    await sweepMissedContracts(client, 't1', TODAY, async () => ({ ok: true }));

    expect(store[0]!.items).toEqual(orig);
    expect(store[0]!.committed_at).toBe('keep-me');
  });
});

// -----------------------------------------------------------------------------
// PER-TEAM TIMEZONE cutover (Gap 1, the audit's required test)
//
// A committed day == today-in-the-TEAM-tz must NOT be swept before that team's
// local midnight, even though the cron fires at one global instant. The cron
// computes cutover = todayIsoInTz(teamTz); a row whose contract_date equals that
// cutover is NOT missed (it's still live). Only after the team's local midnight
// has passed does the cutover advance and the now-past committed day flip.
// -----------------------------------------------------------------------------

describe('per-team timezone cutover (Gap 1)', () => {
  // Fixed cron instant: 2026-06-24T04:00:00Z.
  //   Eastern (UTC-4 EDT) → 2026-06-24 00:00 → local day already '2026-06-24'.
  //   Pacific (UTC-7 PDT) → 2026-06-23 21:00 → local day still '2026-06-23'.
  const CRON_INSTANT = new Date('2026-06-24T04:00:00Z');

  function committedRow(contractDate: string): Row {
    return {
      id: 'x',
      player_id: 'p1',
      team_id: 't1',
      contract_date: contractDate,
      status: 'committed',
      committed_at: '2026-06-23T15:00:00Z',
      items: items(1, 3),
    };
  }

  it('a Pacific team is NOT swept at the cron instant: its local "today" (the 23rd) is still live', async () => {
    const ptCutover = todayIsoInTz('America/Los_Angeles', CRON_INSTANT);
    expect(ptCutover).toBe('2026-06-23');

    // The player's committed day IS the 23rd — the team's own current day.
    const { client, rows: store } = makeClient([committedRow('2026-06-23')]);
    const res = await sweepMissedContracts(client, 't1', ptCutover, async () => ({ ok: true }));

    expect(res.missed).toBe(0);
    expect(store[0]!.status).toBe('committed'); // still owns the local day
  });

  it('an Eastern team at the SAME instant: its local "today" already rolled to the 24th, so a committed 23rd is missed', async () => {
    const etCutover = todayIsoInTz('America/New_York', CRON_INSTANT);
    expect(etCutover).toBe('2026-06-24');

    const { client, rows: store } = makeClient([committedRow('2026-06-23')]);
    const res = await sweepMissedContracts(client, 't1', etCutover, async () => ({ ok: true }));

    expect(res.missed).toBe(1);
    expect(store[0]!.status).toBe('missed'); // ET local midnight has passed
  });

  it('once the Pacific team is past its local midnight, the day finally flips', async () => {
    // 2026-06-24T08:00:00Z → Pacific 01:00 on the 24th → cutover advances.
    const ptCutoverNextDay = todayIsoInTz(
      'America/Los_Angeles',
      new Date('2026-06-24T08:00:00Z'),
    );
    expect(ptCutoverNextDay).toBe('2026-06-24');

    const { client, rows: store } = makeClient([committedRow('2026-06-23')]);
    const res = await sweepMissedContracts(client, 't1', ptCutoverNextDay, async () => ({ ok: true }));

    expect(res.missed).toBe(1);
    expect(store[0]!.status).toBe('missed');
  });
});
