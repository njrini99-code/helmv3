/**
 * Qualifier standings parity harness (P009, 2026-10-17).
 *
 * One in-memory database, served through a fake Supabase client that applies
 * the filters each real query asks for (eq, in, order, range, limit), so the
 * three real pipelines run unchanged over the same rows:
 *
 *   - Fairway's live leaderboard: `FairwayQualifierLeaderboard` with the real
 *     `useQualifierRealtime` hook, read back from the rendered table (what
 *     production shows a coach today).
 *   - The selection workspace: `loadQualifyingWorkspace` (what production's
 *     confirm commits the squad from).
 *   - Clubhouse: `loadQualifierDetail`'s board (src/clubhouse/data/qualifiers.ts).
 *
 * Each comes back as the same `Standing` list, so a test (or the read-only
 * real-data check in the session scratchpad) compares them field by field.
 * It lives beside the Fairway component because Clubhouse code, tests
 * included, may not import Fairway (eslint `no-restricted-imports`).
 *
 * The test file that uses it must mock `@/lib/supabase/server`,
 * `@/lib/supabase/client` and `@/lib/observability/supabase/realtime` onto
 * `parityClient()` (see standings-parity.test.tsx).
 */
import { cleanup, render, waitFor } from '@testing-library/react';

import { FairwayQualifierLeaderboard } from '../FairwayQualifierLeaderboard';
import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import type { QualifyingOrder } from '@/lib/coachhelm/v3/qualifying/types';
import { loadQualifierDetail } from '@/clubhouse/data/qualifiers';

import { parityClient, seed, type ParityCut, type ParityFixture, type Standing } from './standings-parity-db';
export * from './standings-parity-db';

const num = (s: string): number | null => (s === '—' || s === '' ? null : Number(s));
const toParOf = (s: string): number | null => (s === '—' ? null : s === 'E' ? 0 : Number(s.replace('−', '-').replace('+', '')));

/** Fairway's live leaderboard as production draws it: the desktop table, read back. */
export async function runFairway(fx: ParityFixture): Promise<Standing[]> {
  seed(fx);
  const { container, unmount } = render(<FairwayQualifierLeaderboard qualifierId={fx.qualifier.id} entrantCount={fx.entries.length} selectionSlotsTotal={fx.qualifier.selection_slots_total} selectionSlotsCoachPick={fx.qualifier.selection_slots_coach_pick} />);
  try {
    await waitFor(() => {
      if (container.querySelector('[aria-label="Loading leaderboard"]')) throw new Error('loading');
    });
    // The confirmed squad is a second read; wait for its badges when the squad is confirmed and anyone is drawn.
    if (fx.qualifier.selection_state === 'selected' && container.querySelector('table')) {
      await waitFor(() => {
        if (!/Selected|Not selected/.test(container.querySelector('table')!.textContent ?? '')) throw new Error('selections');
      });
    }
    // A player's row is the one with the player link (cut lines and opened detail panels are one-cell rows).
    // Cells: position, player (avatar, link, lineup chip), rounds ("played/of"), avg, total, to par, details.
    const drawn = [...container.querySelectorAll('table tbody tr')].filter((tr) => tr.querySelector('a[href*="player="]'));
    const out: Standing[] = [];
    let order = 0;
    for (const tr of drawn) {
      const td = [...tr.children].map((c) => (c.textContent ?? '').trim());
      const link = tr.querySelector('a[href*="player="]')!;
      const playerId = new URL(link.getAttribute('href')!, 'http://x').searchParams.get('player')!;
      // The chip sits beside the link, after the avatar's initials.
      const badge = (link.parentElement!.textContent ?? '').slice((link.textContent ?? '').length).trim();
      const scored = td[0] !== '—';
      out.push({
        playerId,
        scored,
        label: scored ? td[0]! : null,
        order: scored ? order++ : null,
        played: num(td[2]!.split('/')[0]!) ?? 0,
        total: num(td[4]!),
        toPar: toParOf(td[5]!),
        avg: td[3] === '—' ? null : td[3]!,
        cut: !scored ? null : badge === 'In lineup' || badge === 'Selected' ? 'in' : badge === 'Bubble' ? 'bubble' : badge === 'Tie at cut' ? 'tie' : 'out',
      });
    }
    // With nobody scored Fairway draws no table, only "Awaiting first round": every entrant is unscored.
    const seen = new Set(out.map((s) => s.playerId));
    for (const e of fx.entries) {
      if (!seen.has(e.player_id)) out.push({ playerId: e.player_id, scored: false, label: null, order: null, played: 0, total: null, toPar: null, avg: null, cut: null });
    }
    return out;
  } finally {
    unmount();
    cleanup();
  }
}

/**
 * The selection workspace production confirms from. It draws no position labels and no Bubble. Fairway reads it in the
 * plain order (the default); Clubhouse's Manage selections and Confirm squad read it in the board's (`order: 'board'`).
 */
export async function runWorkspace(fx: ParityFixture, opts: { order?: QualifyingOrder } = {}): Promise<Standing[] | null> {
  seed(fx);
  const ws = await loadQualifyingWorkspace(parityClient() as never, fx.qualifier.id, opts);
  if (!ws) return null;
  const confirmed = ws.selection_state === 'selected';
  return ws.candidates.map((c) => {
    const scored = c.leaderboard_rank != null;
    return {
      playerId: c.player_id,
      scored,
      label: null,
      order: scored ? c.leaderboard_rank! - 1 : null,
      played: c.rounds_completed,
      total: c.total_score,
      toPar: c.total_to_par,
      avg: null,
      cut: !scored ? null : confirmed ? (c.selection ? 'in' : 'out') : c.tied_at_cut ? 'tie' : c.is_top_score_slot ? 'in' : 'out',
    };
  });
}

/** Clubhouse's board, read through its loader. Null when Clubhouse does not show the qualifier (a test qualifier). */
export async function runClubhouse(fx: ParityFixture): Promise<Standing[] | null> {
  seed(fx);
  const detail = await loadQualifierDetail({ role: 'coach', teamId: fx.qualifier.team_id, playerId: null, qualifierId: fx.qualifier.id });
  if (!detail) return null;
  await detail.secondary;
  const b = detail.board;
  if (!b) throw new Error('Clubhouse: the board did not load');
  const cut = (s: (typeof b.rows)[number]['state']): ParityCut =>
    s === 'tie' ? 'tie' : s === 'bubble' ? 'bubble' : s === 'qualifying' || s === 'qualified' || s === 'selected' || s === 'pick' ? 'in' : 'out';
  return [
    ...b.rows.map((r, i) => ({
      playerId: r.playerId,
      scored: true,
      label: (r.tied ? 'T' : '') + r.position,
      order: i,
      played: r.played,
      total: r.total,
      toPar: r.toPar,
      avg: r.avg == null ? null : r.avg.toFixed(1),
      cut: cut(r.state),
    })),
    ...b.unscored.map((r) => ({ playerId: r.playerId, scored: false, label: null, order: null, played: 0, total: null, toPar: null, avg: null, cut: null })),
  ];
}

/** Players grouped by drawn position, as sorted sets: inside a tie the order is not a ranking (Fairway's follows the stored position). */
export function tieGroups(rows: Standing[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.scored || r.label == null) continue;
    const at = r.label.replace(/^T/, '');
    groups.set(at, [...(groups.get(at) ?? []), r.playerId]);
  }
  return [...groups.values()].map((g) => g.sort());
}

/** The ranked order up to ties: consecutive scored rows level on to par and strokes, as sorted sets. */
export function rankedOrder(rows: Standing[]): string[][] {
  const scored = rows.filter((r) => r.scored).sort((a, b) => a.order! - b.order!);
  const out: Array<{ key: string; ids: string[] }> = [];
  for (const r of scored) {
    const key = `${r.toPar}|${r.total}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.ids.push(r.playerId);
    else out.push({ key, ids: [r.playerId] });
  }
  return out.map((g) => g.ids.sort());
}

/** One player's standing, by id. */
export const byId = (rows: Standing[], id: string): Standing => {
  const r = rows.find((x) => x.playerId === id);
  if (!r) throw new Error(`no standing for ${id}`);
  return r;
};
