/**
 * Pure rollups for the coach home (LANGUAGE.md, home row of the per-page
 * table). Everything here derives from the payload the route already loads:
 * `recentRounds` is the FULL windowed round set (paginated server side), so
 * the stage can draw every player's rounds without another query.
 */

import { computeScoringTrendFromRounds } from '@/lib/golf/scoring-trend';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { ScoreFieldRound, ScoreFieldRow, ScoreFieldTrend } from '@/components/fairway/modules/types';

type RecentRound = CoachDashboardData['recentRounds'][number];
type RosterEntry = CoachDashboardPayload['roster'][number];
type TopPlayer = CoachDashboardData['topPlayers'][number];

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Aug 31" from a `YYYY-MM-DD` day, without a Date round trip through the local zone. */
export function shortDay(date: string): string {
  const [, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!mo || !d) return '';
  return `${MONTH[mo - 1]} ${d}`;
}

export function titleCase(name: string): string {
  const MINOR = new Set(['a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'nor']);
  return name
    .trim()
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      if (word !== word.toLowerCase()) return word;
      if (i > 0 && MINOR.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function signed(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export interface PlayerRollup extends ScoreFieldRow {
  roundsInWindow: number;
  lastDate: string | null;
}

/**
 * One row per roster player (or per player seen in the rounds when the
 * roster is missing), rounds oldest to newest. `avg` prefers the server's
 * hole-normalized top-player average so the row agrees with the leaderboard;
 * the trend is the canonical five-versus-five scoring classifier, the same
 * one behind the payload's improving / stable / declining counts.
 */
export function rollupPlayers(
  rounds: ReadonlyArray<RecentRound>,
  roster: ReadonlyArray<RosterEntry> | undefined,
  topPlayers: ReadonlyArray<TopPlayer>,
): PlayerRollup[] {
  const byPlayer = new Map<string, RecentRound[]>();
  for (const r of rounds) {
    const list = byPlayer.get(r.player_id);
    if (list) list.push(r);
    else byPlayer.set(r.player_id, [r]);
  }
  const identities: RosterEntry[] = roster && roster.length > 0
    ? [...roster]
    : Array.from(byPlayer.entries()).map(([id, list]) => ({
        id,
        name: list[0]!.player_name,
        avatar_url: list[0]!.player_avatar_url,
      }));
  const serverAvg = new Map(topPlayers.map((p) => [p.id, p.avg_score]));

  return identities.map((p) => {
    const mine = (byPlayer.get(p.id) ?? []).slice().sort((a, b) => a.round_date.localeCompare(b.round_date));
    const newestFirst = mine.slice().reverse();
    const trendResult = computeScoringTrendFromRounds(
      newestFirst.map((r) => ({ total_score: r.total_score, holes_played: 18 })),
    );
    const trend: ScoreFieldTrend | null = trendResult.hasSignal
      ? { delta: trendResult.delta, direction: trendResult.trend }
      : null;
    const avg = serverAvg.get(p.id)
      ?? (mine.length > 0 ? mine.reduce((sum, r) => sum + r.total_score, 0) / mine.length : null);
    const plotted: ScoreFieldRound[] = mine.map((r) => ({
      id: r.id,
      date: r.round_date.slice(0, 10),
      score: r.total_score,
      toPar: r.total_to_par,
      label: `${shortDay(r.round_date)}, ${titleCase(r.course_name)}, ${r.total_score} (${signed(r.total_to_par)})`,
      href: `/golf/dashboard/rounds/${r.id}`,
    }));
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatar_url,
      href: `/golf/dashboard/roster/${p.id}`,
      rounds: plotted,
      avg,
      trend,
      roundsInWindow: mine.length,
      lastDate: mine.length > 0 ? mine[mine.length - 1]!.round_date.slice(0, 10) : null,
    };
  });
}

/** Best average first; players without rounds sink to the bottom, alphabetical. */
export function sortByStanding(rows: ReadonlyArray<PlayerRollup>): PlayerRollup[] {
  return rows.slice().sort((a, b) => {
    if (a.avg == null && b.avg == null) return a.name.localeCompare(b.name);
    if (a.avg == null) return 1;
    if (b.avg == null) return -1;
    return a.avg - b.avg || a.name.localeCompare(b.name);
  });
}

/** Sliders first (largest slide on top), then improvers (largest gain on top). Flat and unread players are left out. */
export function attentionOrder(rows: ReadonlyArray<PlayerRollup>, limit = 5): PlayerRollup[] {
  const sliding = rows.filter((r) => r.trend?.direction === 'declining').sort((a, b) => b.trend!.delta - a.trend!.delta);
  const improving = rows.filter((r) => r.trend?.direction === 'improving').sort((a, b) => a.trend!.delta - b.trend!.delta);
  return [...sliding, ...improving].slice(0, limit);
}

/** The stage's shared axis: the window start, or the oldest round for `all`, through today. */
export function fieldDomain(
  rows: ReadonlyArray<PlayerRollup>,
  windowStart: string | null | undefined,
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

export interface VerdictPart {
  text: string;
  href?: string;
}

export interface VerdictInput {
  todayEventCount: number;
  pulse?: { improving: number; stable: number; declining: number; topMover?: { name: string; delta: number } } | null;
  leader?: { id: string; name: string; avg: number } | null;
  worstSlide?: { id: string; name: string; delta: number } | null;
  signals: number;
  roundsInWindow: number;
  rangeIsAll: boolean;
}

/** The masthead sentence, built only from facts in the payload. */
export function buildVerdict(input: VerdictInput): VerdictPart[] {
  const parts: VerdictPart[] = [];
  const { todayEventCount: events, pulse, leader, worstSlide, signals } = input;
  if (events > 0) {
    parts.push({ text: `${events} ${events === 1 ? 'event' : 'events'} today.`, href: '/golf/dashboard/calendar' });
  } else {
    parts.push({ text: 'Quiet day.' });
  }
  if (input.roundsInWindow === 0) {
    parts.push({ text: input.rangeIsAll ? ' No rounds logged yet.' : ' No rounds in this window.' });
  } else if (leader) {
    parts.push({ text: ' ' });
    parts.push({ text: leader.name, href: `/golf/dashboard/roster/${leader.id}` });
    parts.push({ text: ` leads at ${leader.avg.toFixed(1)}.` });
  }
  const tracked = pulse ? pulse.improving + pulse.stable + pulse.declining : 0;
  if (pulse && tracked > 0) {
    parts.push({ text: ` ${pulse.improving} improving, ${pulse.declining} sliding` });
    if (worstSlide) {
      parts.push({ text: ', ' });
      parts.push({ text: worstSlide.name, href: `/golf/dashboard/roster/${worstSlide.id}` });
      parts.push({ text: ` the most at ${Math.abs(worstSlide.delta).toFixed(1)} strokes.` });
    } else {
      parts.push({ text: '.' });
    }
  }
  if (signals > 0) {
    parts.push({ text: ' ' });
    parts.push({ text: `${signals} ${signals === 1 ? 'signal' : 'signals'} waiting.`, href: '/golf/dashboard/intelligence' });
  }
  return parts;
}
