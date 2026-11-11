/**
 * CoachHelm analyst, part 1: the fact sheet.
 *
 * A pure, typed, deterministic description of one player for one run: every measure over the player's last 10 rounds,
 * the 10 before those and the season, each with its sample, its window and its 95% range; the team's spread on the same
 * measure (ids only, coach-only); and the Tour figure with where it comes from. It decides nothing and writes no prose.
 *
 * `assembleFactSheets` is the pure core (rows in, sheets out). `buildTeamFactSheets` reads the rows through the
 * injectable {@link AnalystSources} and calls it, so tests use fixtures and the dry run uses a Supabase client.
 *
 * `src/lib` code: imports nothing from `src/clubhouse` or `src/app`.
 */
import { seasonStartDate } from '@/lib/coachhelm/v3/chat/season-rule';
import { tourFor } from '@/lib/golf/benchmarks/tour';
import { MEASURES, cacheForFigures, hasMeasuredStrokesGained, screenStrokesGained, type MeasureDef, type TourContext, type WindowData } from './measures';
import { countedRounds, cutWindows, dayIn, figureRounds, holeRounds, readSince, windowRef, type CountedRound, type PlayerWindows } from './rounds';
import type { AnalystSources, HoleRow, RoundCacheRow, RoundRow, ShotRow, TeamRow, TourStandardRow } from './sources';
import { MAD_TO_SD, median, medianAbsoluteDeviation } from './stats';
import type { FactSheet, MeasureFact, RoundStrokesGained, TeamDistribution, WindowFigure, WindowKey, WindowRef } from './types';

/** Everything a team's fact sheets are computed from. */
export interface TeamRows {
  team: TeamRow;
  /** The players to build a sheet for: the team's active members. */
  playerIds: readonly string[];
  rounds: readonly RoundRow[];
  roundCache: readonly RoundCacheRow[];
  holes: readonly HoleRow[];
  shots: readonly ShotRow[];
  tourStandards: readonly TourStandardRow[];
  /** The moment the run is for. The season's first day and the sheet's date are this moment on the team's calendar. */
  now: Date;
}

function groupBy<T>(rows: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export interface PlayerCut {
  playerId: string;
  /** Practice left out: what every figure but the pressure gap reads. */
  counted: PlayerWindows;
  /** Practice kept: the pressure gap's rounds. */
  allTypes: PlayerWindows;
}

function cutPlayer(playerId: string, rounds: readonly CountedRound[], seasonStart: string): PlayerCut {
  return {
    playerId,
    counted: cutWindows(figureRounds(rounds), seasonStart),
    allTypes: cutWindows(figureRounds(rounds, { keepPractice: true }), seasonStart),
  };
}

/** The round ids whose cache rows, holes and shots a team's sheets need: every window's rounds that have their holes. */
export function detailRoundIds(cuts: readonly PlayerCut[]): string[] {
  const ids = new Set<string>();
  for (const c of cuts) {
    for (const list of [c.counted.last10, c.counted.previous10 ?? [], c.counted.season]) {
      for (const r of holeRounds(list)) ids.add(r.id);
    }
  }
  return [...ids].sort();
}

interface Lookups {
  cache: Map<string, RoundCacheRow>;
  holesByRound: Map<string, HoleRow[]>;
  shotsByRound: Map<string, ShotRow[]>;
  parByHole: Map<string, number | null>;
  measuredRoundIds: Set<string>;
}

/**
 * The rows in one fixed order (holes by number, shots by id), so the sheets do not depend on the order a database
 * happened to return them in: a sum of the same numbers in another order can differ in its last digit.
 */
function lookups(rows: TeamRows): Lookups {
  const shotsByRound = groupBy([...rows.shots].sort((a, b) => a.id.localeCompare(b.id)), (s) => s.round_id);
  const holes = [...rows.holes].sort((a, b) => a.round_id.localeCompare(b.round_id) || a.hole_number - b.hole_number || a.id.localeCompare(b.id));
  return {
    cache: new Map(rows.roundCache.map((c) => [c.round_id, cacheForFigures(c)])),
    holesByRound: groupBy(holes, (h) => h.round_id),
    shotsByRound,
    parByHole: new Map(rows.holes.map((h) => [h.id, h.par])),
    measuredRoundIds: new Set([...shotsByRound].filter(([, shots]) => hasMeasuredStrokesGained(shots)).map(([id]) => id)),
  };
}

type FigureRef = WindowFigure['window'];

const refOf = (key: WindowKey, rounds: readonly CountedRound[]): FigureRef => {
  const { round_ids: _ids, ...ref } = windowRef(key, rounds);
  return ref;
};

/** One player's figures for every measure over the three windows. */
export interface PlayerFigures {
  current: Map<string, WindowFigure>;
  previous: Map<string, WindowFigure | null>;
  season: Map<string, WindowFigure>;
  screen: Map<string, { value: number | null; rounds: number; blended: boolean }>;
}

const SCREEN_KEY = {
  strokes_gained_total: 'strokes_gained_total',
  strokes_gained_off_the_tee: 'strokes_gained_tee',
  strokes_gained_approach: 'strokes_gained_approach',
  strokes_gained_around_the_green: 'strokes_gained_around_green',
  strokes_gained_putting: 'strokes_gained_putting',
} as const;

function computeFigures(cut: PlayerCut, look: Lookups): PlayerFigures {
  const data = (key: 'last10' | 'previous10' | 'season'): WindowData | null => {
    const rounds = cut.counted[key];
    const allTypes = cut.allTypes[key];
    if (!rounds && !allTypes) return null;
    return { rounds: rounds ?? [], allTypeRounds: allTypes ?? [], ...look };
  };
  const figure = (def: MeasureDef, key: 'last10' | 'previous10' | 'season'): WindowFigure | null => {
    // The pressure gap sets practice against competition, so its window is cut from the rounds with practice kept.
    const scope = def.id === 'pressure_gap' ? cut.allTypes : cut.counted;
    const rounds = scope[key];
    const w = data(key);
    if (!rounds || !w) return null;
    return { window: refOf(key, rounds), ...def.compute(w) };
  };
  const out: PlayerFigures = { current: new Map(), previous: new Map(), season: new Map(), screen: new Map() };
  const current = data('last10')!;
  for (const def of MEASURES) {
    out.current.set(def.id, figure(def, 'last10')!);
    out.previous.set(def.id, figure(def, 'previous10'));
    out.season.set(def.id, figure(def, 'season')!);
    const screenKey = SCREEN_KEY[def.id as keyof typeof SCREEN_KEY];
    if (screenKey) out.screen.set(def.id, screenStrokesGained(current, screenKey));
  }
  return out;
}

const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The team's spread on one measure over each teammate's own last 10 rounds, without the player the sheet is about. */
export function teamDistribution(measureId: string, playerId: string, all: ReadonlyMap<string, PlayerFigures>): TeamDistribution {
  const teammates = [...all]
    .filter(([id]) => id !== playerId)
    .flatMap(([id, f]) => {
      const fig = f.current.get(measureId);
      return fig && fig.value != null ? [{ player_id: id, value: fig.value, attempts: fig.sample.attempts, rounds: fig.sample.rounds }] : [];
    })
    .sort((a, b) => a.player_id.localeCompare(b.player_id));
  const values = teammates.map((t) => t.value);
  const med = median(values);
  const mad = medianAbsoluteDeviation(values);
  return {
    audience: 'coach_only',
    window: 'last10',
    teammates,
    n: teammates.length,
    median: med == null ? null : r4(med),
    mad: mad == null ? null : r4(mad),
    spread: mad != null && mad > 0 ? r4(mad * MAD_TO_SD) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

function strokesGainedByRound(last10: readonly CountedRound[], look: Lookups): RoundStrokesGained[] {
  return holeRounds(last10)
    .filter((r) => r.strokes_gained_total != null)
    .map((r) => ({
      round_id: r.id,
      date: r.round_date.slice(0, 10),
      measured: look.measuredRoundIds.has(r.id),
      total: r.strokes_gained_total,
      off_the_tee: r.strokes_gained_tee,
      approach: r.strokes_gained_approach,
      around_the_green: r.strokes_gained_around_green,
      putting: r.strokes_gained_putting,
    }));
}

function notesFor(cut: PlayerCut, sg: readonly RoundStrokesGained[]): string[] {
  const notes: string[] = [];
  const last = cut.counted.last10;
  if (last.length === 0) notes.push('No counted 18-hole round in the last twelve months, so no figure can be read.');
  const estimated = sg.filter((r) => !r.measured).length;
  if (estimated > 0) {
    notes.push(
      `${estimated} of the last ${last.length} rounds have no shots logged: their strokes gained is an estimate from the scorecard, is not on the Tour's scale, and is kept apart from the measured rounds.`,
    );
  }
  const totalOnly = last.filter((r) => r.total_only).length;
  if (totalOnly > 0) notes.push(`${totalOnly} of the last ${last.length} rounds were posted as a total only: they count in the scoring average and in nothing hole by hole.`);
  if (!cut.counted.previous10) notes.push('Fewer than three rounds before the last 10, so there is no previous window to compare with.');
  return notes;
}

/** Rows in, one fact sheet per player out. Pure and deterministic: the same rows and the same `now` give the same sheets. */
export function assembleFactSheets(rows: TeamRows): FactSheet[] {
  const { team, now } = rows;
  const tour = tourFor(team.gender);
  const tourCtx: TourContext = { tour, gender: tour === 'lpga' ? 'womens' : 'mens', standards: new Map(rows.tourStandards.map((s) => [s.metric_id, s])) };
  const seasonStart = seasonStartDate(now, team.timezone);
  const byPlayer = groupBy(countedRounds(rows.rounds), (r) => r.player_id);
  const playerIds = [...new Set(rows.playerIds)].sort();
  const look = lookups(rows);
  const cuts = new Map(playerIds.map((id) => [id, cutPlayer(id, byPlayer.get(id) ?? [], seasonStart)]));
  const figures = new Map(playerIds.map((id) => [id, computeFigures(cuts.get(id)!, look)]));

  return playerIds.map((playerId): FactSheet => {
    const cut = cuts.get(playerId)!;
    const mine = figures.get(playerId)!;
    const sg = strokesGainedByRound(cut.counted.last10, look);
    const measures = MEASURES.map((def): MeasureFact => {
      const screen = mine.screen.get(def.id);
      return {
        id: def.id,
        label: def.label,
        unit: def.unit,
        direction: def.direction,
        area: def.area,
        level: def.level,
        basis: def.basis,
        estimated: def.estimated,
        source: def.source,
        current: mine.current.get(def.id)!,
        previous: mine.previous.get(def.id) ?? null,
        season: mine.season.get(def.id)!,
        team: playerIds.length > 1 ? teamDistribution(def.id, playerId, figures) : null,
        tour: def.tour(tourCtx),
        ...(screen ? { screen } : {}),
      };
    });
    const ref = (key: WindowKey, rounds: readonly CountedRound[]): WindowRef => windowRef(key, rounds);
    return {
      version: 1,
      team_id: team.id,
      player_id: playerId,
      as_of: dayIn(now, team.timezone),
      timezone: team.timezone,
      season_start: seasonStart,
      tour,
      strokes_gained_baseline: tour === 'lpga' ? 'womens' : 'pga_tour',
      windows: {
        last10: ref('last10', cut.counted.last10),
        previous10: cut.counted.previous10 ? ref('previous10', cut.counted.previous10) : null,
        season: ref('season', cut.counted.season),
      },
      strokes_gained_by_round: sg,
      measures,
      notes: notesFor(cut, sg),
    };
  });
}

/** Reads a team's rows through the sources. Throws when the team does not exist or any read fails. */
export async function loadTeamRows(sources: AnalystSources, opts: { teamId: string; now: Date }): Promise<TeamRows> {
  const team = await sources.team(opts.teamId);
  if (!team) throw new Error(`analyst: team ${opts.teamId} was not found`);
  const playerIds = [...new Set(await sources.activePlayerIds(opts.teamId))].sort();
  const rounds = playerIds.length ? await sources.rounds(playerIds, readSince(opts.now)) : [];
  const seasonStart = seasonStartDate(opts.now, team.timezone);
  const byPlayer = groupBy(countedRounds(rounds), (r) => r.player_id);
  const ids = detailRoundIds(playerIds.map((id) => cutPlayer(id, byPlayer.get(id) ?? [], seasonStart)));
  const [roundCache, holes, shots, tourStandards] = await Promise.all([
    ids.length ? sources.roundCache(ids) : Promise.resolve([]),
    ids.length ? sources.holes(ids) : Promise.resolve([]),
    ids.length ? sources.shots(ids) : Promise.resolve([]),
    sources.tourStandards(tourFor(team.gender)),
  ]);
  return { team, playerIds, rounds, roundCache, holes, shots, tourStandards, now: opts.now };
}

/** Every active player's fact sheet for one team, ordered by player id. */
export async function buildTeamFactSheets(sources: AnalystSources, opts: { teamId: string; now: Date }): Promise<FactSheet[]> {
  return assembleFactSheets(await loadTeamRows(sources, opts));
}

/** One player's fact sheet, with the team's spread beside each measure. Null when the player is not an active member of the team. */
export async function buildFactSheet(sources: AnalystSources, opts: { teamId: string; playerId: string; now: Date }): Promise<FactSheet | null> {
  const sheets = await buildTeamFactSheets(sources, opts);
  return sheets.find((s) => s.player_id === opts.playerId) ?? null;
}
