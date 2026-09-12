/**
 * Pure derivations for the coach roster (LANGUAGE.md, roster row of the
 * per-page table). `players` arrives from `roster/page.tsx` with every
 * round each player has ever logged, so the stage, the window control and
 * the masthead verdict all work from that one payload — no further fetch,
 * and (per the honesty rule) never a client re-classification of trend
 * that could disagree with `roster-health.ts`'s own `recent_trend`-driven
 * "needs attention" math over the same players. `recent_trend`/
 * `recent_trend_delta` are the one source of truth for direction+magnitude
 * everywhere on this screen (stage, table, ledger, masthead).
 */

import type { NeedRow } from '@/components/fairway/pages/coachhelm/roster-health';
import type { PlayersGridFocusArea, PlayersGridStats, RosterRow } from '@/components/fairway/pages/coachhelm/PlayersGridView';
import type { RosterHealth } from '@/components/fairway/pages/coachhelm/roster-health';
import type { ReadoutItem } from '@/components/fairway/pages/dashboard/coach-home-parts';
import type { RosterPlayer } from './FairwayPlayerCard';
import type { ScoreFieldRound, ScoreFieldRow, ScoreFieldTrend } from '@/components/fairway/modules/types';

const DAY_MS = 86_400_000;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type RosterWindow = '30d' | '90d' | 'all';
export type RosterSortField = 'name' | 'avg' | 'handicap' | 'rounds';

export interface RosterVerdictPart {
  text: string;
  href?: string;
}

function dayMs(date: string): number {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return Number.NaN;
  return Date.UTC(y, mo - 1, d);
}

/** "Aug 31" from a `YYYY-MM-DD` day, without a Date round trip through the local zone. */
export function shortDay(date: string): string {
  const [, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!mo || !d) return '';
  return `${MONTH[mo - 1]} ${d}`;
}

export function titleCase(name: string): string {
  return name
    .trim()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function signed(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function playerName(p: { first_name: string | null; last_name: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/**
 * `today` minus `days`, as a `YYYY-MM-DD` string — pure UTC-ms math from a
 * caller-supplied FIXED date string, never `Date.now()`/a bare `new Date()`
 * (IMPLEMENTING.md's server/client agreement rule: `today` is a server
 * prop, so this reduces to deterministic string arithmetic, not a clock
 * read that could disagree between server and client renders).
 */
export function subtractDays(today: string, days: number): string {
  const ms = dayMs(today) - days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The window control's start date, or `null` for the unbounded `all` window. */
export function windowStartFor(window: RosterWindow, today: string): string | null {
  if (window === '30d') return subtractDays(today, 30);
  if (window === '90d') return subtractDays(today, 90);
  return null;
}

/** roster-health's own input shapes, unchanged from the pre-facelift page —
 *  computeRosterHealth/computeNeedsAttention are reused verbatim, never
 *  re-derived here. */
export function rosterHealthInputs(players: ReadonlyArray<RosterPlayer>): {
  statsByPlayer: Record<string, PlayersGridStats>;
  rows: RosterRow[];
} {
  const statsByPlayer: Record<string, PlayersGridStats> = {};
  for (const p of players) {
    statsByPlayer[p.id] = {
      rounds_played: p.rounds_count ?? 0,
      avg_score: p.avg_score ?? null,
      avg_putts: null,
      fairway_pct: null,
      gir_pct: null,
      best_score: null,
      recent_trend: p.recent_trend ?? null,
    };
  }
  const rows: RosterRow[] = players.map((p) => ({
    player: p,
    stats: statsByPlayer[p.id],
    activeCount: p.active_focus_areas ?? 0,
    completedCount: 0,
  }));
  return { statsByPlayer, rows };
}

function trendFor(p: RosterPlayer): ScoreFieldTrend | null {
  if (!p.recent_trend) return null;
  return { direction: p.recent_trend, delta: p.recent_trend_delta ?? 0 };
}

/**
 * ScoreField rows: one per player, their real rounds filtered to the
 * selected window. `avg` is the average of the WINDOWED rounds (a real
 * computed figure, distinct from the table's all-time `avg_score` — the
 * two regions answer different questions and are allowed to disagree
 * about which rounds they cover); `trend` is always the server-computed,
 * all-time direction+delta, unaffected by the window, so it can never
 * contradict the Attention ledger's own `recent_trend`-driven math over
 * the same players.
 */
export function buildScoreFieldRows(
  players: ReadonlyArray<RosterPlayer>,
  windowStart: string | null,
): ScoreFieldRow[] {
  return players.map((p) => {
    const all = p.rounds ?? [];
    const windowed = windowStart == null ? all : all.filter((r) => r.date >= windowStart);
    const rounds: ScoreFieldRound[] = windowed.map((r) => ({
      id: r.id,
      date: r.date,
      score: r.score,
      toPar: r.toPar,
      label: `${shortDay(r.date)}, ${r.courseName ? titleCase(r.courseName) : 'Round'}, ${r.score} (${signed(r.toPar)})`,
      href: `/golf/dashboard/rounds/${r.id}`,
    }));
    const avg = windowed.length > 0 ? windowed.reduce((sum, r) => sum + r.score, 0) / windowed.length : null;
    return {
      id: p.id,
      name: playerName(p),
      avatarUrl: p.avatar_url,
      href: `/golf/dashboard/roster/${p.id}`,
      rounds,
      avg,
      trend: trendFor(p),
    };
  });
}

/**
 * Sorted by trend, not standing (LANGUAGE.md's per-page table: "ScoreField
 * sorted by trend"). Decliners first (largest slide on top), then stable
 * (alphabetical), then improvers (largest improvement on top), then
 * players with no trend read yet (alphabetical, sunk to the bottom) — the
 * same grouping `attentionOrder` uses in coach-home-logic.ts, applied to
 * every row instead of a capped top-5.
 */
export function sortByTrend(rows: ReadonlyArray<ScoreFieldRow>): ScoreFieldRow[] {
  const declining = rows.filter((r) => r.trend?.direction === 'declining').sort((a, b) => b.trend!.delta - a.trend!.delta);
  const stable = rows.filter((r) => r.trend?.direction === 'stable').sort((a, b) => a.name.localeCompare(b.name));
  const improving = rows.filter((r) => r.trend?.direction === 'improving').sort((a, b) => a.trend!.delta - b.trend!.delta);
  const unread = rows.filter((r) => r.trend == null).sort((a, b) => a.name.localeCompare(b.name));
  return [...declining, ...stable, ...improving, ...unread];
}

/** The stage's shared axis: the window start, or the oldest plotted round for `all`, through today. */
export function fieldDomain(
  rows: ReadonlyArray<ScoreFieldRow>,
  windowStart: string | null,
  today: string,
): { start: string; end: string } {
  if (windowStart) return { start: windowStart, end: today };
  let oldest: string | null = null;
  for (const row of rows) {
    const first = row.rounds[0]?.date;
    if (first && (oldest == null || first < oldest)) oldest = first;
  }
  return { start: oldest ?? today, end: today };
}

/** The masthead verdict sentence, built only from facts already on the payload. */
export function buildRosterVerdict(
  players: ReadonlyArray<RosterPlayer>,
  teamName: string,
  needsAttention: ReadonlyArray<NeedRow>,
  playersWithRounds: number,
): RosterVerdictPart[] {
  const parts: RosterVerdictPart[] = [];
  const n = players.length;
  parts.push({ text: `${n} ${n === 1 ? 'player' : 'players'} on ${teamName}. ` });

  const withTrend = players.filter((p) => p.recent_trend != null);
  if (withTrend.length === 0) {
    parts.push({ text: 'Trends appear once players have rounds to compare. ' });
  } else {
    const improving = withTrend.filter((p) => p.recent_trend === 'improving');
    const declining = withTrend.filter((p) => p.recent_trend === 'declining');
    parts.push({ text: `${improving.length} improving, ${declining.length} sliding. ` });

    if (improving.length > 0) {
      const lead = improving.slice().sort((a, b) => (a.recent_trend_delta ?? 0) - (b.recent_trend_delta ?? 0))[0]!;
      parts.push({ text: playerName(lead), href: `/golf/dashboard/roster/${lead.id}` });
      parts.push({
        text:
          lead.recent_trend_delta != null
            ? ` improving the most, ${Math.abs(lead.recent_trend_delta).toFixed(1)} strokes. `
            : ' improving the most. ',
      });
    }
    if (declining.length > 0) {
      const worst = declining.slice().sort((a, b) => (b.recent_trend_delta ?? 0) - (a.recent_trend_delta ?? 0))[0]!;
      parts.push({ text: playerName(worst), href: `/golf/dashboard/roster/${worst.id}` });
      parts.push({
        text:
          worst.recent_trend_delta != null
            ? ` sliding the most, ${Math.abs(worst.recent_trend_delta).toFixed(1)} strokes. `
            : ' sliding the most. ',
      });
    }
  }

  if (needsAttention.length > 0) {
    const top = needsAttention[0]!.row.player;
    parts.push({ text: `${needsAttention.length} need a look, ` });
    parts.push({ text: playerName(top), href: `/golf/dashboard/roster/${top.id}` });
    parts.push({ text: ' first.' });
  } else if (playersWithRounds > 0) {
    parts.push({ text: "Roster's covered." });
  } else {
    parts.push({ text: 'Nothing to assess yet.' });
  }

  return parts;
}

/** The stage readouts column — roster count, needs-attention breakdown,
 *  focus-area and rounds coverage. None carries a sparkline: roster's
 *  loader has no per-metric historical series to plot (a fabricated one
 *  is banned). */
export function buildRosterReadouts(
  health: RosterHealth,
  needsAttention: ReadonlyArray<NeedRow>,
  activeCount: number,
): ReadoutItem[] {
  let downUncoached = 0;
  let down = 0;
  let uncoached = 0;
  for (const need of needsAttention) {
    if (need.priority === 3) downUncoached += 1;
    else if (need.priority === 2) down += 1;
    else if (need.priority === 1) uncoached += 1;
  }
  const reasonParts = [
    downUncoached > 0 ? `${downUncoached} down & uncoached` : null,
    down > 0 ? `${down} down` : null,
    uncoached > 0 ? `${uncoached} uncoached` : null,
  ].filter((s): s is string => s != null);

  return [
    { key: 'roster', label: 'Roster', value: String(health.totalPlayers), note: `${activeCount} active` },
    {
      key: 'attention',
      label: 'Needs attention',
      value: String(needsAttention.length),
      note: reasonParts.length > 0 ? reasonParts.join(', ') : undefined,
    },
    { key: 'focus', label: 'With focus area', value: `${health.playersWithActive} of ${health.totalPlayers}` },
    { key: 'rounds', label: 'With rounds', value: `${health.playersWithRounds} of ${health.totalPlayers}` },
  ];
}

/** The table's own search box — case-insensitive substring over the full name. */
export function filterRosterByQuery(players: ReadonlyArray<RosterPlayer>, query: string): RosterPlayer[] {
  const q = query.trim().toLowerCase();
  if (!q) return players.slice();
  return players.filter((p) => playerName(p).toLowerCase().includes(q));
}

/** The table's sort control — verbatim comparator carried over from the
 *  pre-facelift board. */
export function sortRosterTable(players: ReadonlyArray<RosterPlayer>, sort: RosterSortField): RosterPlayer[] {
  const arr = players.slice();
  arr.sort((a, b) => {
    switch (sort) {
      case 'avg':
        return (a.avg_score || Infinity) - (b.avg_score || Infinity);
      case 'handicap':
        return (a.handicap ?? Infinity) - (b.handicap ?? Infinity);
      case 'rounds':
        return (b.rounds_count ?? 0) - (a.rounds_count ?? 0);
      default:
        return `${a.last_name ?? ''}`.localeCompare(`${b.last_name ?? ''}`);
    }
  });
  return arr;
}

export type FocusOutcomeTone = 'improved' | 'no_change' | 'worsened';

export interface FocusOutcomeRow {
  playerId: string;
  name: string;
  href: string;
  tone: FocusOutcomeTone;
}

/** The ledger's Focus-outcomes column: one row per focus area that carries
 *  a recorded outcome (i.e. one created from a coaching insight that itself
 *  has an outcome — see roster.v3.md's "The ledger row" section). */
export function buildFocusOutcomes(
  focusAreas: ReadonlyArray<PlayersGridFocusArea>,
  players: ReadonlyArray<RosterPlayer>,
): FocusOutcomeRow[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows: FocusOutcomeRow[] = [];
  for (const fa of focusAreas) {
    if (fa.outcome_status !== 'improved' && fa.outcome_status !== 'no_change' && fa.outcome_status !== 'worsened') continue;
    const player = byId.get(fa.player_id);
    if (!player) continue;
    rows.push({ playerId: player.id, name: playerName(player), href: `/golf/dashboard/roster/${player.id}`, tone: fa.outcome_status });
  }
  return rows;
}
