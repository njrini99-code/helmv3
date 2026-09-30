import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import type { ChSgTour } from '../lib/sg';
import { homeClock, latestWithHoles, loadHomeWeek, type ChHomeEvent, type ChHomeWeek, type ChLatestRound } from './home';
import { isFull18, loadSeasonRounds, mean, summarizePlayer, type ChRound } from './season';
import { loadD1, loadRoundCache, tourForGender, type ChRoundCache } from './stats-common';

/**
 * Player Home (Clubhouse; design/handoff/Player - Home.html and
 * Player - Home - Mobile.html). One server read, final data on first paint.
 *
 * The player's own rounds only: nothing here reads a teammate's scores (a
 * player is compared against D1, never against teammates, as on Stats). The
 * week is the team's calendar without who else is invited. Every section
 * carries its own error flag, and a figure with no source is absent, never
 * approximated.
 */

/** Rounds in the leg figures and the brief's form. */
export const LEG_WINDOW = 10;
/** Points in a leg's spark line. */
const LEG_TREND = 7;
/** Scores sent for the scoring chart: 20 shown at most, and 20 before them for "vs previous". */
const SCORING_MAX = 40;

export type ChLegKey = 'tee' | 'approach' | 'short' | 'putting';

export interface ChPlayerLeg {
  key: ChLegKey;
  /** "Off the tee" */
  label: string;
  /** "Fairways hit" */
  stat: string;
  /** Over the last LEG_WINDOW rounds; null with nothing logged. */
  value: number | null;
  unit: '%' | '';
  digits: number;
  lowerIsBetter: boolean;
  /** Strokes gained per round in this leg (three or more rounds with it); null otherwise. */
  sg: number | null;
  /** The D1 average for the stat where golf_pga_standards has one; null draws no mark. */
  d1: number | null;
  /** Oldest to newest, one value per round, up to seven. */
  trend: number[];
  /** One plain line from the same rounds, or null. */
  note: string | null;
}

export interface ChScoringPoint {
  id: string;
  /** "Oct 12" */
  label: string;
  score: number;
  par: number | null;
}

export interface ChPlayerHome {
  /** "Good afternoon, Theo." */
  greeting: string;
  todayLabel: string;
  /** One sentence from the player's own rounds; null before their first round or when rounds didn't load. */
  brief: string | null;
  /** The coach "Message coach" opens a thread with; null opens Messages. */
  coachUserId: string | null;
  week: ChHomeWeek['week'];
  next: ChHomeEvent | null;
  today: ChHomeEvent[];
  weekNote: ChHomeWeek['weekNote'];
  latest: { rounds: ChLatestRound[]; error: boolean; holesError: boolean };
  /** Oldest to newest, 18-hole countable rounds, up to SCORING_MAX. */
  scoring: { points: ChScoringPoint[]; error: boolean };
  sgPerRound: number | null;
  /** What the strokes gained here is measured against; null when the team's own row didn't load (no baseline is claimed). */
  tour: ChSgTour;
  handicap: number | null;
  /** Null when the rounds didn't load. `cacheError`: scrambling and three-putts didn't load. */
  legs: { rows: ChPlayerLeg[]; cacheError: boolean; d1Error: boolean } | null;
}

function log(read: string, error: unknown) {
  chLogServer('home', read, error);
}

const LEG_LABELS: Record<ChLegKey, [string, string]> = {
  tee: ['Off the tee', 'Fairways hit'],
  approach: ['Approach', 'Greens in regulation'],
  short: ['Short game', 'Scrambling'],
  putting: ['Putting', 'Putts per round'],
};

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

export async function loadPlayerHome(input: { teamId: string; playerId: string; firstName: string }): Promise<ChPlayerHome> {
  const supabase = await createClient();
  const now = new Date();
  const { tz, greeting, todayLabel } = await homeClock(supabase, input.teamId, now);

  const [wk, roundsRes, playerRes, teamRes] = await Promise.all([
    // No names: a player's Home never lists who else is invited.
    loadHomeWeek(supabase, { teamId: input.teamId, tz, now, names: new Map() }),
    loadSeasonRounds(supabase, [input.playerId], { surface: 'home' }),
    supabase.from('golf_players').select('handicap_index, handicap').eq('id', input.playerId).maybeSingle(),
    supabase.from('golf_teams').select('gender, created_by, organization_id').eq('id', input.teamId).maybeSingle(),
  ]);
  if (playerRes.error) log('player', playerRes.error);
  if (teamRes.error) log('team', teamRes.error);

  const full = roundsRes.error ? [] : roundsRes.rounds.filter(isFull18);
  const window = full.slice(0, LEG_WINDOW);

  const [latest, cache, d1, coachUserId] = await Promise.all([
    latestWithHoles(supabase, full, () => input.firstName),
    window.length ? loadRoundCache(supabase, window.map((r) => r.id), 'home') : Promise.resolve({ byRound: new Map<string, ChRoundCache>(), error: false }),
    // Without the team's row its tour is unknown, so no benchmark is claimed (as on Stats, CH-4210).
    teamRes.data ? loadD1(supabase, tourForGender(teamRes.data.gender), 'home') : Promise.resolve(null),
    coachFor(supabase, teamRes.data ?? null),
  ]);

  const season = summarizePlayer(full);
  const legs = roundsRes.error ? null : { rows: legRows(window, cache.byRound, d1, season.sgLegs), cacheError: cache.error, d1Error: d1 === null || d1.size === 0 };

  const points: ChScoringPoint[] = full
    .slice(0, SCORING_MAX)
    .reverse()
    .map((r) => ({
      id: r.id,
      label: shortDate.format(new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)),
      score: r.total_score as number,
      par: r.score_to_par != null ? (r.total_score as number) - r.score_to_par : null,
    }));

  return {
    greeting: `${greeting}, ${input.firstName}.`,
    todayLabel,
    brief: roundsRes.error ? null : briefFor(full, legs?.rows ?? []),
    coachUserId,
    week: wk.week,
    next: wk.next,
    today: wk.todayEvents,
    weekNote: wk.weekNote,
    latest: { rounds: latest.rounds, error: roundsRes.error, holesError: latest.holesError },
    scoring: { points, error: roundsRes.error },
    sgPerRound: season.sgPerRound,
    tour: teamRes.data ? tourForGender(teamRes.data.gender) : null,
    handicap: playerRes.data?.handicap_index ?? playerRes.data?.handicap ?? null,
    legs,
  };
}

/**
 * The user id of the coach who created the team (golf_teams.created_by is a
 * golf_coaches.id, not a user id), else the organisation's first coach with an
 * account; null when neither loads.
 */
async function coachFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  team: { created_by: string | null; organization_id: string | null } | null,
): Promise<string | null> {
  if (!team?.organization_id) return null;
  const { data, error } = await supabase.from('golf_coaches').select('id, user_id').eq('organization_id', team.organization_id).not('user_id', 'is', null).limit(50);
  if (error) {
    log('coaches', error);
    return null;
  }
  const coaches = (data ?? []).filter((c): c is { id: string; user_id: string } => !!c.user_id);
  return (coaches.find((c) => c.id === team.created_by) ?? coaches[0])?.user_id ?? null;
}

type Pick = { made: number; total: number } | null;

/** The four parts of the game over the window: a weighted rate (never a mean of percentages), a per-round trend, and one line. */
export function legRows(window: ChRound[], cache: Map<string, ChRoundCache>, d1: Map<string, number> | null, sg: ReturnType<typeof summarizePlayer>['sgLegs']): ChPlayerLeg[] {
  const oldestFirst = [...window].reverse();
  const rateOf = (pick: (r: ChRound) => Pick) => {
    let made = 0;
    let total = 0;
    for (const r of window) {
      const p = pick(r);
      if (p && p.total > 0) {
        made += p.made;
        total += p.total;
      }
    }
    return { value: total ? (made / total) * 100 : null, made, total };
  };
  const trendOf = (pick: (r: ChRound) => Pick) =>
    oldestFirst
      .map(pick)
      .filter((p): p is { made: number; total: number } => !!p && p.total > 0)
      .map((p) => (p.made / p.total) * 100)
      .slice(-LEG_TREND);
  const fairways = (r: ChRound): Pick => {
    const c = cache.get(r.id);
    if (r.total_fairways_hit != null && r.total_fairways) return { made: r.total_fairways_hit, total: r.total_fairways };
    return c?.fairways_hit != null && c.fairways_total ? { made: c.fairways_hit, total: c.fairways_total } : null;
  };
  const greens = (r: ChRound): Pick => (r.total_gir != null && r.total_gir_possible ? { made: r.total_gir, total: r.total_gir_possible } : null);
  const scrambles = (r: ChRound): Pick => {
    const c = cache.get(r.id);
    return c?.scrambles_converted != null && c.scramble_attempts ? { made: c.scrambles_converted, total: c.scramble_attempts } : null;
  };
  const n = window.length;
  const tee = rateOf(fairways);
  const gir = rateOf(greens);
  const scr = rateOf(scrambles);
  const putts = window.map((r) => r.total_putts).filter((v): v is number => v != null);
  const threes = window.map((r) => cache.get(r.id)?.three_putts).filter((v): v is number => typeof v === 'number');
  const sand = window.reduce(
    (a, r) => {
      const c = cache.get(r.id);
      return c?.sand_attempts ? { saves: a.saves + (c.sand_saves ?? 0), att: a.att + c.sand_attempts } : a;
    },
    { saves: 0, att: 0 },
  );
  const rounds = (k: number) => `${k} ${k === 1 ? 'round' : 'rounds'}`;
  const row = (key: ChLegKey, value: number | null, unit: '%' | '', digits: number, lowerIsBetter: boolean, legSg: number | null, bench: number | null, trend: number[], note: string | null): ChPlayerLeg => ({
    key,
    label: LEG_LABELS[key][0],
    stat: LEG_LABELS[key][1],
    value,
    unit,
    digits,
    lowerIsBetter,
    sg: legSg,
    d1: bench,
    trend,
    note,
  });
  return [
    row('tee', tee.value, '%', 0, false, sg.tee, d1?.get('fairway_pct') ?? null, trendOf(fairways), tee.total ? `${tee.made} of ${tee.total} fairways in the last ${rounds(n)}` : null),
    row('approach', gir.value, '%', 0, false, sg.approach, d1?.get('gir_pct') ?? null, trendOf(greens), gir.total ? `${gir.made} of ${gir.total} greens in the last ${rounds(n)}` : null),
    row(
      'short',
      scr.value,
      '%',
      0,
      false,
      sg.around,
      d1?.get('scrambling_pct') ?? null,
      trendOf(scrambles),
      scr.total ? [`Up and down ${scr.made} of ${scr.total}`, sand.att ? `sand saves ${sand.saves} of ${sand.att}` : null].filter(Boolean).join(' · ') : null,
    ),
    row(
      'putting',
      mean(putts),
      '',
      1,
      true,
      sg.putting,
      d1?.get('putts_per_round') ?? null,
      window
        .map((r) => r.total_putts)
        .filter((v): v is number => v != null)
        .reverse()
        .slice(-LEG_TREND),
      threes.length ? `${(threes.reduce((a, b) => a + b, 0) / threes.length).toFixed(1)} three-putts a round` : null,
    ),
  ];
}

/** "Your last three rounds average 70.0. Off the tee is gaining you 0.8 strokes a round." From the player's own rounds only. */
export function briefFor(full: ChRound[], legs: ChPlayerLeg[]): string | null {
  const scores = full.map((r) => r.total_score).filter((v): v is number => v != null);
  if (!scores.length) return null;
  const last = scores.slice(0, 3);
  const words = ['', 'round', 'two rounds', 'three rounds'];
  const first =
    last.length === 1 ? `Your last round was ${last[0]}.` : `Your last ${words[last.length]} average ${(mean(last) as number).toFixed(1)}.`;
  const withSg = legs.filter((l): l is ChPlayerLeg & { sg: number } => l.sg != null).sort((a, b) => b.sg - a.sg);
  const best = withSg[0];
  if (!best) return first;
  if (best.sg > 0.05) return `${first} ${best.label} is gaining you ${best.sg.toFixed(1)} strokes a round.`;
  const worst = withSg[withSg.length - 1]!;
  return `${first} ${worst.label} is costing the most, ${Math.abs(worst.sg).toFixed(1)} strokes a round.`;
}
