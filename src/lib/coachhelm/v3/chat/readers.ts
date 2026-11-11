/**
 * CoachHelm chat: the readers whose figures a Clubhouse screen draws.
 *
 * Each calls the screen's own loader (handed in on `ctx.loaders`, see screen-loaders.ts) for the window asked, and
 * turns what the screen shows into labelled, already-computed figures with their window, sample and source. Nothing
 * here recomputes a figure the screen computes; where a list is returned the counts and averages over it are worked
 * out here, so the model never adds rows up.
 */
import { z } from 'zod';
import type { ReadTool, ToolContext, ToolResult } from './engine/tool';
import { compareSeasons } from './engine-reads';
import { nowIso, type Measurement, type ToolEnvelope } from './provenance';
import { boardOrder } from '../qualifying/ranking';
import { TEAM_FIGURES_KEY } from './read-tools';
import { empty, failed, nameOf, ownOr, ownOrOne, part, playerOf, round, say, teamOf, together, withText } from './reader-kit';
import { screenLoaders, STATS_WINDOWS, type PlayerStatsScreen, type StatsComparisonRow, type StatsWindow, type TeamRoundRow } from './screen-loaders';

const PlayerId = z.string().uuid();
const Window = z.enum(STATS_WINDOWS).default('last10').describe('last10 unless the question names another.');

export const WINDOW_WORDS: Record<StatsWindow, string> = { last5: 'last 5 rounds', last10: 'last 10 rounds', last20: 'last 20 rounds', season: 'this season' };
const SOURCE_STATS = 'Stats page';

/** The catalogue id of a Stats row, so a visual and a goal name the same metric the old reads did. */
const METRIC_ID: Record<string, string> = {
  'SG total': 'sg_total',
  'SG off the tee': 'sg_tee',
  'SG approach': 'sg_approach',
  'SG around green': 'sg_around_green',
  'SG putting': 'sg_putting',
  'Scoring avg': 'scoring_average',
  'Fairways hit': 'driving_accuracy_pct',
  'Greens in regulation': 'gir_pct',
  Scrambling: 'scrambling_pct',
  'Sand saves': 'sand_save_pct',
  'Putts per round': 'putts_per_round',
  'Penalty strokes': 'penalties_per_round',
};
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const metricIdOf = (label: string): string => METRIC_ID[label] ?? slug(label);

const unitOf = (row: Pick<StatsComparisonRow, 'unit' | 'label'>): Measurement['unit'] => (row.unit === '%' ? 'percent' : row.unit === ' ft' ? 'feet' : /^SG |gap|hole$/i.test(row.label) ? 'strokes' : /scoring/i.test(row.label) ? 'score' : 'count');

/** The dates the window's rounds run between, from the rounds the page lists. */
function windowDates(page: PlayerStatsScreen): { start: string | null; end: string | null } {
  const days = page.rounds.map((r) => r.iso?.slice(0, 10)).filter((d): d is string => !!d).sort();
  return { start: days[0] ?? null, end: days[days.length - 1] ?? page.win.lastRoundDate?.slice(0, 10) ?? null };
}

function statMeasurements(page: PlayerStatsScreen, player: { id: string; name: string }): Measurement[] {
  const { start, end } = windowDates(page);
  return page.comparisons
    .filter((row) => row.you !== null)
    .map((row) => {
      const sg = row.label.startsWith('SG ');
      return {
        metric_id: metricIdOf(row.label),
        metric_label: row.label,
        unit: unitOf(row),
        value: round(row.you as number, Math.max(row.digits, sg ? 2 : 0)),
        entity: { kind: 'player' as const, id: player.id, label: player.name },
        window_start: start,
        window_end: end,
        sample_size: sg ? page.win.sgRounds : page.win.rounds,
        sample_unit: 'rounds' as const,
        as_of: nowIso(),
        coverage: 'complete' as const,
        coverage_note: row.early ?? null,
        source: SOURCE_STATS,
        method: 'stats_page_window',
        denominator: null,
        benchmark: row.bench === null ? null : { source: 'Tour average, as Stats shows it', version: 'stats page', value: row.bench, omitted_for_cohort: false },
        comparisons: [
          { kind: 'team' as const, label: 'Team average, same window', value: row.team, place_percent: null, place: null, place_of: null, note: null, missing_reason: row.team === null ? 'no team figure on Stats' : null },
          { kind: 'tour' as const, label: 'Tour', value: row.bench, place_percent: null, place: null, place_of: null, note: null, missing_reason: row.bench === null ? 'no Tour figure on Stats' : null },
        ],
        direction: row.lowerIsBetter ? ('lower_better' as const) : ('higher_better' as const),
      };
    });
}

/** Where the player trails the team, worst first, by the size of the gap relative to the team's figure (the rows have different units). */
export function gapsToTeam(rows: readonly StatsComparisonRow[]): Array<{ label: string; you: number; team: number; gap: number; unit: string }> {
  return rows
    .filter((r): r is StatsComparisonRow & { you: number; team: number } => r.you !== null && r.team !== null)
    .map((r) => ({ r, gap: r.you - r.team }))
    .filter(({ r, gap }) => (r.lowerIsBetter ? gap > 0 : gap < 0))
    .map(({ r, gap }) => ({ label: r.label, you: round(r.you, r.digits), team: round(r.team, r.digits), gap: round(gap, Math.max(r.digits, 1)), unit: r.unit.trim(), weight: Math.abs(gap) / (Math.abs(r.team) > 1 ? Math.abs(r.team) : 1) }))
    .sort((a, b) => b.weight - a.weight)
    .map(({ weight: _weight, ...rest }) => rest);
}

/**
 * One distance band in words. A band nobody putted from is "no attempts": it has no make rate, and is never written as 0 of 0 or 0%, which
 * reads as a player who missed everything from there.
 */
const bandWords = (b: { label: string; made: number; attempts: number; bench: number | null }): string =>
  b.attempts > 0 ? `${b.label} ${b.made} of ${b.attempts} (${round((b.made / b.attempts) * 100, 0)}%${b.bench === null ? '' : `, Tour ${round(b.bench, 0)}%`})` : `${b.label} no attempts`;

const SECTIONS = ['rounds', 'putting', 'approach', 'holes'] as const;
type Section = (typeof SECTIONS)[number];
const ROUNDS_LISTED = 20;

function playerLines(page: PlayerStatsScreen, name: string, window: StatsWindow, sections: readonly Section[]): { lines: string[]; detail: Record<string, unknown> } {
  const { start, end } = windowDates(page);
  const lines = [`${name}, ${WINDOW_WORDS[window]}: ${page.win.rounds} rounds${start && end ? ` (${start} to ${end})` : ''}, strokes gained over ${page.win.sgRounds}. Source: ${SOURCE_STATS}.`];
  // Each line stands on its own (who, what, which rounds, how many): it is what gets quoted, and a small model copies a labelled figure more reliably than it reads a table.
  for (const row of page.comparisons) {
    const signed = row.signed || row.label.startsWith('SG ');
    const what = `${name}, ${row.label}, ${WINDOW_WORDS[window]}`;
    if (row.you === null) {
      if (row.floor) lines.push(`${what}: no figure yet (${row.floor})`);
      continue;
    }
    const digits = Math.max(row.digits, signed ? 2 : 0);
    const n = row.label.startsWith('SG ') ? page.win.sgRounds : page.win.rounds;
    lines.push(`${what}: ${say(row.you, row.unit, digits, signed)} (n=${n} rounds)${row.team === null ? '' : ` | team average ${say(row.team, row.unit, digits, signed)}`}${row.bench === null ? '' : ` | Tour ${say(row.bench, row.unit, row.digits, signed)}`}${row.early ? ` (${row.early})` : ''}`);
  }
  const gaps = gapsToTeam(page.comparisons);
  const detail: Record<string, unknown> = { window: WINDOW_WORDS[window], rounds: page.win.rounds, gaps_to_team: gaps };
  if (gaps.length) lines.push(`${name}, furthest behind the team average, largest gap first: ${gaps.slice(0, 5).map((g) => `${g.label} (${g.you}${g.unit} against ${g.team}${g.unit}, ${g.gap > 0 ? '+' : ''}${g.gap}${g.unit})`).join('; ')}.`);
  if (sections.includes('putting')) {
    if (page.extra.puttsError || !page.puttBands) lines.push('Putting by distance: could not be read.');
    else {
      detail.kind = 'putt_profile';
      // The shape the putting block of a visual draws (visuals/compile-composition.ts).
      detail.profile = { buckets: page.puttBands.map((b) => ({ id: slug(b.label), label: b.label, attempts: b.attempts, made: b.made, rate: b.attempts ? round((b.made / b.attempts) * 100, 1) : null })) };
      detail.putt_bands = page.puttBands.map((b) => ({ band: b.label, made: b.made, attempts: b.attempts, make_pct: b.attempts ? round((b.made / b.attempts) * 100, 0) : null, tour_pct: b.bench }));
      lines.push(`Putting by distance (made of attempts): ${page.puttBands.map(bandWords).join('; ')}.`);
    }
  }
  if (sections.includes('approach')) {
    if (page.extra.approachError || !page.extra.approach) lines.push('Approach by distance: could not be read.');
    else {
      detail.approach_bands = page.extra.approach.map((b) => ({ band: b.label, avg_feet_left: b.belowFloor ? null : b.value, shots: b.shots, tour_feet: b.bench, green_hit_pct: b.greenHitPct }));
      lines.push(`Approach by distance (average feet left): ${page.extra.approach.map((b) => `${b.label} ${b.belowFloor || b.value === null ? `too few shots (${b.shots})` : `${round(b.value, 0)} ft over ${b.shots} shots${b.bench === null ? '' : `, Tour ${round(b.bench, 0)} ft`}`}`).join('; ')}.`);
    }
  }
  if (sections.includes('holes')) {
    const t = page.extra.toughest;
    if (page.extra.holesError) lines.push('Hole-level figures: could not be read.');
    else {
      detail.toughest_holes = t?.holes ?? [];
      detail.pressure = page.extra.pressure;
      detail.opening_hole = page.extra.opening;
      if (t?.holes.length) lines.push(`Toughest holes (average to par, plays): ${t.holes.map((h) => `hole ${h.hole} par ${h.par} ${say(h.avgToPar, '', 2, true)} over ${h.plays}`).join('; ')}.`);
      else if (t?.belowFloor) lines.push(`Toughest holes: no hole has ${t.minPlays} plays yet.`);
      if (page.extra.pressure.gap !== null) lines.push(`Pressure gap (tournament and qualifier scoring minus practice): ${say(page.extra.pressure.gap, '', 1, true)} over ${page.extra.pressure.pressureRounds} and ${page.extra.pressure.practiceRounds} rounds.`);
    }
  }
  if (sections.includes('rounds')) {
    const listed = page.rounds.slice(0, ROUNDS_LISTED);
    detail.rounds = listed.map((r) => ({ round_id: r.id, date: r.iso?.slice(0, 10) ?? r.date, course: r.course, type: r.type, holes: r.holes, score: r.score, to_par: r.toPar, putts: r.putts, gir_pct: r.girPct === null ? null : round(r.girPct, 0), fairways_pct: r.fairwaysPct === null ? null : round(r.fairwaysPct, 0), sg_total: r.sg === null ? null : round(r.sg, 2) }));
    lines.push(`Rounds, newest first${page.rounds.length > listed.length ? ` (${listed.length} of ${page.rounds.length})` : ''}:`);
    for (const r of listed) lines.push(`  ${r.iso?.slice(0, 10) ?? r.date} ${r.course}${r.holes === 9 ? ' (9 holes)' : ''}: ${r.score}${r.toPar === null ? '' : ` (${say(r.toPar, '', 0, true)})`}${r.putts === null ? '' : `, ${r.putts} putts`}${r.girPct === null ? '' : `, greens ${round(r.girPct, 0)}%`}${r.sg === null ? '' : `, SG ${say(r.sg, '', 2, true)}`}${r.type ? `, ${r.type}` : ''} [round ${r.id}]`);
  }
  return { lines, detail };
}

/** Players set side by side on every Stats row at least two of them have, best first, with the gap from first to last. The model sorts nothing. */
export function sideBySide(players: ReadonlyArray<{ name: string; page: PlayerStatsScreen }>): Array<{ metric: string; unit: string; best_first: Array<{ player: string; value: number }>; gap: number }> {
  const labels = [...new Set(players.flatMap((p) => p.page.comparisons.map((r) => r.label)))];
  return labels.flatMap((label) => {
    const rows = players.flatMap((p) => {
      const row = p.page.comparisons.find((r) => r.label === label);
      return row && row.you !== null ? [{ player: p.name, row, value: row.you }] : [];
    });
    if (rows.length < 2) return [];
    const first = rows[0]!.row;
    const digits = Math.max(first.digits, first.label.startsWith('SG ') ? 2 : 0);
    const ordered = [...rows].sort((a, b) => (first.lowerIsBetter ? a.value - b.value : b.value - a.value)).map((r) => ({ player: r.player, value: round(r.value, digits) }));
    return [{ metric: label, unit: first.unit.trim(), best_first: ordered, gap: round(Math.abs(ordered[0]!.value - ordered[ordered.length - 1]!.value), Math.max(digits, 1)) }];
  });
}

type PlayerStatsInput = { player_ids?: string[]; window: StatsWindow; sections: Section[] };

async function runPlayerStats(ctx: ToolContext, input: PlayerStatsInput): Promise<ToolResult> {
  const ids = ownOr(ctx, input.player_ids);
  if (ids.length === 0) return failed('the Stats page', 'No player was named.');
  const load = screenLoaders(ctx).playerStats;
  if (!load) return failed('the Stats page', 'The Stats page is not connected to this chat.');
  const pages = await Promise.all(ids.map((id) => load(id, input.window).catch(() => null)));
  const read = ids.flatMap((id, i) => (pages[i] ? [{ id, name: nameOf(ctx, id), page: pages[i] as PlayerStatsScreen }] : []));
  const missing = ids.filter((_, i) => !pages[i]).map((id) => nameOf(ctx, id));
  if (read.length === 0) return failed(`the Stats page for ${missing.join(', ')}`, 'The Stats page could not be read.');
  const built = read.map((p) => ({ ...p, ...playerLines(p.page, p.name, input.window, input.sections) }));
  const compared = read.length > 1 ? sideBySide(read) : [];
  const comparedLines = compared.length ? [`Side by side, ${WINDOW_WORDS[input.window]}, best first on each measure:`, ...compared.map((c) => `  ${c.metric}: ${c.best_first.map((x) => `${x.player} ${x.value}${c.unit}`).join('; ')}. Gap first to last: ${c.gap}${c.unit}.`)] : [];
  const broken = read.filter((p) => p.page.roundsError || p.page.statsError || p.page.cacheError).map((p) => p.name);
  const noRounds = read.every((p) => p.page.win.rounds === 0);
  const notes = [missing.length ? `Could not read: ${missing.join(', ')}.` : null, broken.length ? `Some of the page failed to load for ${broken.join(', ')}; a missing figure there is unread, not zero.` : null].filter(Boolean);
  const envelope: ToolEnvelope = {
    summary: `${read.map((p) => p.name).join(', ')}: Stats, ${WINDOW_WORDS[input.window]}.`,
    measurements: read.flatMap((p) => statMeasurements(p.page, p)),
    series: [],
    detail: read.length === 1 ? { player_id: read[0]!.id, ...built[0]!.detail } : { players: built.map((b) => ({ player_id: b.id, player: b.name, ...b.detail })), side_by_side: compared },
    coverage: notes.length ? 'partial' : noRounds ? 'empty' : 'complete',
    coverage_note: notes.length ? notes.join(' ') : noRounds ? `No rounds that count in ${WINDOW_WORDS[input.window]}.` : null,
    as_of: nowIso(),
    window_label: WINDOW_WORDS[input.window],
  };
  return withText(envelope, [...built.flatMap((b) => [...b.lines, '']), ...comparedLines]);
}

const sectionsField = z.array(z.enum(SECTIONS)).max(4).default([]).describe('Only when needed: rounds (each with its figures and id), putting (make rate by distance), approach (feet left by distance), holes (toughest holes, pressure gap).');

export const getPlayerStats: ReadTool<PlayerStatsInput> = {
  kind: 'read',
  name: 'get_player_stats',
  description:
    'The Stats page for one to six players over one window: scoring, strokes gained by area, greens, fairways, scrambling, sand saves, putts, three-putts, putt makes and penalties, each beside the team average for the same window and the Tour, with the areas where the player trails the team. Use it for how a player is playing, for comparing players (all in one call) and for recent rounds (section rounds).',
  input: z.object({ player_ids: z.array(PlayerId).min(1).max(6), window: Window, sections: sectionsField }),
  progress: (i) => (i.sections?.includes('rounds') ? 'Reading the rounds and statistics' : 'Reading the statistics'),
  run: runPlayerStats,
};

/** A player's own Stats page. There is no player id to give: it is always the caller's. */
export const getMyStats: ReadTool<PlayerStatsInput> = {
  ...getPlayerStats,
  description: 'Your Stats page over one window: scoring, strokes gained by area, greens, fairways, scrambling, putts, putt makes and penalties, each beside the Tour where Stats shows one. Use it for any question about how you are playing, and for your recent rounds (section rounds).',
  input: z.object({ window: Window, sections: sectionsField }),
  progress: () => 'Reading your statistics',
};

// ---------------------------------------------------------------------------------------------------------------------
// Team Stats
// ---------------------------------------------------------------------------------------------------------------------

const GRID_COLUMNS = ['scoring_average', 'sg_total', 'sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
const FIGURE_COLUMNS = ['putts_per_round', 'gir_pct', 'driving_accuracy_pct'] as const;
const RANK_BY = [...GRID_COLUMNS, ...FIGURE_COLUMNS] as const;
type RankBy = (typeof RANK_BY)[number];
const RANK_LABEL: Record<RankBy, string> = { scoring_average: 'Scoring avg', sg_total: 'SG total', sg_tee: 'SG off the tee', sg_approach: 'SG approach', sg_around_green: 'SG around green', sg_putting: 'SG putting', putts_per_round: 'Putts per round', gir_pct: 'Greens in regulation', driving_accuracy_pct: 'Fairways hit' };
const LOWER_BETTER: ReadonlySet<RankBy> = new Set(['scoring_average', 'putts_per_round']);
const LEG_LABELS = ['SG off the tee', 'SG approach', 'SG around green', 'SG putting'] as const;

type TeamStatsInput = { window: StatsWindow; rank_by?: RankBy; putting: boolean };

/** Players ordered best first on one column, ties sharing a place; players with no figure listed after, unranked. */
export function ranked<T extends { value: number | null }>(rows: readonly T[], lowerBetter: boolean): Array<T & { place: number | null }> {
  const have = rows.filter((r): r is T & { value: number } => r.value !== null).sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value));
  const placed = have.map((r, i) => ({ ...r, place: i }));
  for (let i = 0; i < placed.length; i += 1) placed[i]!.place = i > 0 && placed[i - 1]!.value === placed[i]!.value ? placed[i - 1]!.place : i + 1;
  return [...placed, ...rows.filter((r) => r.value === null).map((r) => ({ ...r, place: null }))];
}

async function runTeamStats(ctx: ToolContext, input: TeamStatsInput): Promise<ToolResult> {
  const who = teamOf(ctx);
  const loaders = screenLoaders(ctx);
  if (!loaders.teamStats) return failed('Team Stats', 'The Team Stats page is not connected to this chat.');
  const page = await loaders.teamStats(input.window).catch(() => null);
  if (!page) return failed('Team Stats', 'The Team Stats page could not be read.');
  const words = WINDOW_WORDS[input.window];
  const team = { kind: 'team' as const, id: who.team_id, label: who.team_name };
  const base = { window_start: null, window_end: null, as_of: nowIso(), coverage: 'complete' as const, coverage_note: null, source: 'Team Stats page', method: 'team_stats_window', denominator: null, benchmark: null };
  const measurements: Measurement[] = [];
  const lines = [`${who.team_name}, ${words}: ${page.activeCount} active players, ${page.roundCount} rounds in the window, strokes gained over ${page.sgRounds}. Source: Team Stats page.`];
  const teamFigureIds: Record<string, string> = { sg: 'sg_total', score: 'scoring_average', gir: 'gir_pct', putts: 'putts_per_round', scramble: 'scrambling_pct', birdies: 'birdies_per_round' };
  for (const f of page.figures) {
    if (f.value === null) continue;
    const signed = f.key === 'sg';
    measurements.push({ ...base, metric_id: teamFigureIds[f.key] ?? slug(f.label), metric_label: f.label, unit: f.unit === '%' ? 'percent' : f.key === 'sg' ? 'strokes' : f.key === 'score' ? 'score' : 'count', value: round(f.value, Math.max(f.digits, signed ? 2 : 0)), entity: team, sample_size: page.roundCount, sample_unit: 'rounds', direction: f.lowerIsBetter ? 'lower_better' : 'higher_better' });
    lines.push(`${who.team_name} team average, ${f.label}, ${words}: ${say(f.value, f.unit, Math.max(f.digits, signed ? 2 : 0), signed)} (n=${page.roundCount} rounds)${f.delta === null ? '' : ` (${say(f.delta, f.unit, Math.max(f.digits, 1), true)} ${f.context})`}`);
  }
  page.legTotals.forEach((v, i) => {
    const label = LEG_LABELS[i];
    if (v === null || !label) return;
    measurements.push({ ...base, metric_id: metricIdOf(label), metric_label: label, unit: 'strokes', value: round(v, 2), entity: team, sample_size: page.sgRounds, sample_unit: 'rounds', direction: 'higher_better' });
    lines.push(`${who.team_name} team average, ${label}, ${words}: ${say(v, '', 2, true)} (n=${page.sgRounds} rounds)`);
  });

  const detail: Record<string, unknown> = { window: words, active_players: page.activeCount, rounds: page.roundCount };
  const rankBy = input.rank_by ?? 'sg_total';
  let rows: Array<{ id: string; name: string; rounds: number; value: number | null }>;
  let rankNote: string | null = null;
  if ((GRID_COLUMNS as readonly string[]).includes(rankBy)) {
    const leg = ['sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting'].indexOf(rankBy);
    rows = page.grid.map((g) => ({ id: g.id, name: g.name, rounds: g.rounds, value: rankBy === 'scoring_average' ? g.avg : rankBy === 'sg_total' ? g.total : (g.legs[leg] ?? null) }));
  } else {
    // No column for these on the Team Stats grid: Stats' own per-player calculation, for the same window.
    const figures = loaders.playerFigures ? await loaders.playerFigures(who.roster.map((p) => p.id), input.window).catch(() => null) : null;
    if (!figures) {
      rows = [];
      rankNote = `Could not read each player's ${RANK_LABEL[rankBy].toLowerCase()}.`;
    } else {
      rows = who.roster.map((p) => {
        const f = figures.get(p.id);
        return { id: p.id, name: p.name, rounds: f?.rounds ?? 0, value: !f ? null : rankBy === 'putts_per_round' ? f.putts_per_round : rankBy === 'gir_pct' ? f.gir_pct : f.fairway_pct };
      });
      const pooled = figures.get(TEAM_FIGURES_KEY);
      const teamValue = !pooled ? null : rankBy === 'putts_per_round' ? pooled.putts_per_round : rankBy === 'gir_pct' ? pooled.gir_pct : pooled.fairway_pct;
      if (teamValue !== null && !page.figures.some((f) => teamFigureIds[f.key] === rankBy && f.value !== null)) lines.push(`${who.team_name} team average, ${RANK_LABEL[rankBy]}, ${words}: ${say(teamValue, rankBy === 'putts_per_round' ? '' : '%', 1)}`);
    }
  }
  const isPct = rankBy === 'gir_pct' || rankBy === 'driving_accuracy_pct';
  const digits = rankBy.startsWith('sg_') ? 2 : 1;
  const order = ranked(rows, LOWER_BETTER.has(rankBy));
  detail.ranked_by = RANK_LABEL[rankBy];
  detail.ranking = order.map((r) => ({ place: r.place, player_id: r.id, player: r.name, value: r.value === null ? null : round(r.value, digits), rounds: r.rounds }));
  for (const r of order) {
    if (r.value === null) continue;
    measurements.push({ ...base, metric_id: rankBy, metric_label: RANK_LABEL[rankBy], unit: isPct ? 'percent' : rankBy.startsWith('sg_') ? 'strokes' : rankBy === 'scoring_average' ? 'score' : 'count', value: round(r.value, digits), entity: { kind: 'player', id: r.id, label: r.name }, sample_size: r.rounds, sample_unit: 'rounds', direction: LOWER_BETTER.has(rankBy) ? 'lower_better' : 'higher_better' });
  }
  if (order.length) {
    const placed = order.filter((r) => r.place !== null).length;
    lines.push(`Players ranked on ${RANK_LABEL[rankBy]}, ${words}, best first (${LOWER_BETTER.has(rankBy) ? 'lower' : 'higher'} is better), ${placed} with a figure:`);
    for (const r of order) lines.push(`  ${r.place === null ? 'no place' : `place ${r.place} of ${placed}`}: ${r.name}, ${RANK_LABEL[rankBy]} ${r.value === null ? `no figure (${r.rounds} rounds)` : `${say(r.value, isPct ? '%' : '', digits, rankBy.startsWith('sg_'))} (n=${r.rounds} rounds)`} [player ${r.id}]`);
  }
  if (input.putting) {
    if (page.puttsError || !page.putting) lines.push('Team putting by distance: could not be read.');
    else {
      detail.kind = 'putt_profile';
      detail.profile = { buckets: page.putting.bands.map((b) => ({ id: slug(b.label), label: b.label, attempts: b.attempts, made: b.made, rate: b.attempts ? round((b.made / b.attempts) * 100, 1) : null })) };
      detail.putt_bands = page.putting.bands.map((b) => ({ band: b.label, made: b.made, attempts: b.attempts, make_pct: b.attempts ? round((b.made / b.attempts) * 100, 0) : null, tour_pct: b.bench }));
      lines.push(`Team putting by distance (made of attempts, ${page.putting.putts} putts): ${page.putting.bands.map(bandWords).join('; ')}.`);
    }
  }
  if (page.bests.length) {
    detail.bests = page.bests.map((b) => ({ what: b.label, player: b.name, value: b.value, when: b.meta }));
    lines.push(`Bests in the window: ${page.bests.map((b) => `${b.label} ${b.value}, ${b.name} (${b.meta})`).join('; ')}.`);
  }
  const notes = [page.roundsError ? 'The rounds could not all be read; the figures may be short.' : null, page.cacheError ? 'Hole-level figures (greens, putts, scrambling) could not be read.' : null, rankNote].filter(Boolean);
  const envelope: ToolEnvelope = { summary: `${who.team_name}: Team Stats, ${words}.`, measurements, series: [], detail, coverage: notes.length ? 'partial' : page.roundCount === 0 ? 'empty' : 'complete', coverage_note: notes.length ? notes.join(' ') : page.roundCount === 0 ? `No rounds that count in ${words}.` : null, as_of: nowIso(), window_label: words };
  return withText(envelope, lines);
}

export const getTeamStats: ReadTool<TeamStatsInput> = {
  kind: 'read',
  name: 'get_team_stats',
  description:
    'The Team Stats page over one window: the team\'s scoring, strokes gained by area, greens, putts and scrambling, the players and rounds behind them, every player ranked on the column you choose, team putting by distance, and the best rounds. This team average is the only one. Use it for the team as a whole and for who leads or trails on a measure.',
  input: z.object({ window: Window, rank_by: z.enum(RANK_BY).optional().describe('The column to rank players on. Default sg_total.'), putting: z.boolean().default(false).describe('Also return the team\'s make rate by putt distance.') }),
  progress: (i) => (i.rank_by ? 'Ranking the team' : 'Reading Team Stats'),
  run: runTeamStats,
};

// ---------------------------------------------------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------------------------------------------------

const ROUND_TYPES = ['practice', 'qualifier', 'tournament'] as const;
const ROUND_LIST_MAX = 30;
type RoundsInput = { player_ids?: string[]; round_type?: (typeof ROUND_TYPES)[number]; from?: string; to?: string; list: number };
const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Counts and averages over a list of the Rounds page's rows. Averages use full rounds the page marks as counting; the list keeps every round. */
export function roundsSummary(list: readonly TeamRoundRow[]): Array<{ player_id: string; player: string; rounds: number; counted: number; avg_score: number | null; avg_to_par: number | null; avg_putts: number | null; best: number | null }> {
  const by = new Map<string, TeamRoundRow[]>();
  for (const r of list) by.set(r.playerId, [...(by.get(r.playerId) ?? []), r]);
  return [...by.entries()]
    .map(([id, rounds]) => {
      const counted = rounds.filter((r) => r.countable && r.holes === 18);
      const scores = counted.map((r) => r.score);
      const avg = mean(scores);
      const toPar = mean(counted.flatMap((r) => (r.toPar === null ? [] : [r.toPar])));
      const putts = mean(counted.flatMap((r) => (r.putts === null ? [] : [r.putts])));
      return { player_id: id, player: rounds[0]!.player, rounds: rounds.length, counted: counted.length, avg_score: avg === null ? null : round(avg, 1), avg_to_par: toPar === null ? null : round(toPar, 1), avg_putts: putts === null ? null : round(putts, 1), best: scores.length ? Math.min(...scores) : null };
    })
    .sort((a, b) => (a.avg_score ?? Infinity) - (b.avg_score ?? Infinity));
}

async function runRounds(ctx: ToolContext, input: RoundsInput): Promise<ToolResult> {
  const who = teamOf(ctx);
  const load = screenLoaders(ctx).teamRounds;
  if (!load) return failed('the rounds', 'The Rounds page is not connected to this chat.');
  const page = await load().catch(() => null);
  if (!page || page.rounds.error) return failed('the rounds', 'The Rounds page could not be read.');
  const me = playerOf(ctx);
  const only = me ? [me] : input.player_ids?.length ? ownOr(ctx, input.player_ids) : null;
  const roster = new Set(who.roster.map((p) => p.id));
  const list = page.rounds.list.filter((r) => roster.has(r.playerId) && (!only || only.includes(r.playerId)) && (!input.round_type || r.type === input.round_type) && (!input.from || r.date.slice(0, 10) >= input.from) && (!input.to || r.date.slice(0, 10) <= input.to));
  const scope = [only ? only.map((id) => nameOf(ctx, id)).join(', ') : who.team_name, input.round_type ? `${input.round_type} rounds` : 'all rounds', input.from || input.to ? `${input.from ?? 'the start'} to ${input.to ?? 'today'}` : 'every date on the Rounds page'].join(', ');
  if (list.length === 0) return empty(`No rounds: ${scope}.`, { rounds: [] });
  const per = roundsSummary(list);
  const counted = list.filter((r) => r.countable && r.holes === 18);
  const pooled = mean(counted.map((r) => r.score));
  const days = list.map((r) => r.date.slice(0, 10)).sort();
  const shown = list.slice(0, Math.min(Math.max(input.list, 0), ROUND_LIST_MAX));
  const measurements: Measurement[] = per.flatMap((p) =>
    p.avg_score === null
      ? []
      : [{ metric_id: 'scoring_average', metric_label: 'Scoring avg', unit: 'score' as const, value: p.avg_score, entity: { kind: 'player' as const, id: p.player_id, label: p.player }, window_start: days[0] ?? null, window_end: days[days.length - 1] ?? null, sample_size: p.counted, sample_unit: 'rounds' as const, as_of: nowIso(), coverage: 'complete' as const, coverage_note: null, source: 'Rounds page', method: 'mean_of_full_counting_rounds', denominator: null, benchmark: null, direction: 'lower_better' as const }],
  );
  const whole = !only && !input.round_type && !input.from && !input.to;
  const lines = [
    `${scope}: ${list.length} rounds (${days[0]} to ${days[days.length - 1]}), ${counted.length} of them full rounds that count in an average. Source: Rounds page.`,
    pooled === null ? null : `Average of those ${counted.length} rounds: ${say(pooled, '', 1)}.`,
    whole && page.season.avg !== null ? `This season (since ${page.seasonStart}), as the Rounds page shows it, every round type with practice rounds included: ${page.season.rounds} full rounds by ${page.season.players} ${page.season.players === 1 ? 'player' : 'players'}, average ${say(page.season.avg, '', 1)}, ${page.season.underPar} under par${page.season.best ? `, best ${page.season.best.score} by ${page.season.best.player} at ${page.season.best.course}` : ''}. The season scoring average that leaves practice out is get_season's.` : null,
    'Per player, lowest average first:',
    ...per.map((p) => `  ${p.player}: ${p.rounds} rounds, ${p.counted} full rounds counted${p.avg_score === null ? ', no average' : `, average score ${p.avg_score}`}${p.avg_to_par === null ? '' : `, average to par ${say(p.avg_to_par, '', 1, true)}`}${p.avg_putts === null ? '' : `, average putts ${p.avg_putts}`}${p.best === null ? '' : `, best ${p.best}`} [player ${p.player_id}]`),
    shown.length ? `Newest ${shown.length} of ${list.length}:` : null,
    ...shown.map((r) => `  ${r.date.slice(0, 10)} ${r.player}, ${r.course}${r.holes === 9 ? ' (9 holes)' : ''}: ${r.score}${r.toPar === null ? '' : ` (${say(r.toPar, '', 0, true)})`}${r.type ? `, ${r.type}` : ''} [round ${r.id}]`),
  ];
  const envelope: ToolEnvelope = {
    summary: `${list.length} rounds: ${scope}.`,
    measurements,
    series: [],
    detail: { scope, rounds_total: list.length, counted_rounds: counted.length, average_of_counted: pooled === null ? null : round(pooled, 1), per_player: per, rounds: shown.map((r) => ({ round_id: r.id, date: r.date.slice(0, 10), player: r.player, player_id: r.playerId, course: r.course, type: r.type, holes: r.holes, score: r.score, to_par: r.toPar, putts: r.putts })) },
    coverage: page.rosterError ? 'partial' : 'complete',
    coverage_note: page.rosterError ? 'The roster could not be read in full, so some names may be missing.' : (page.rounds.unscored ?? 0) > 0 ? `${page.rounds.unscored} rounds have no score yet and are left out.` : null,
    as_of: nowIso(),
  };
  return withText(envelope, lines);
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const getRounds: ReadTool<RoundsInput> = {
  kind: 'read',
  name: 'get_rounds',
  description:
    'The team\'s rounds from the Rounds page, narrowed by players, type and dates: how many, each player\'s count, average score, to par and putts, the season line, and the newest rounds with their ids. Use it for which rounds were played, for qualifier, tournament or practice scoring, and to find a round for get_round.',
  input: z.object({ player_ids: z.array(PlayerId).max(12).optional(), round_type: z.enum(ROUND_TYPES).optional(), from: Day.optional(), to: Day.optional(), list: z.number().int().min(0).max(ROUND_LIST_MAX).default(10).describe('How many of the newest rounds to list.') }),
  progress: () => 'Reading the rounds',
  run: runRounds,
};

// ---------------------------------------------------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------------------------------------------------

type SeasonInput = { player_id?: string; compare_last_season: boolean };

async function seasonNow(ctx: ToolContext, playerId: string | undefined): Promise<ToolEnvelope> {
  const who = teamOf(ctx);
  const loaders = screenLoaders(ctx);
  const figure = (entity: Measurement['entity'], value: number, rounds: number, source: string): Measurement => ({ metric_id: 'scoring_average', metric_label: 'Scoring avg, this season', unit: 'score', value: round(value, 1), entity, window_start: null, window_end: null, sample_size: rounds, sample_unit: 'rounds', as_of: nowIso(), coverage: 'complete', coverage_note: null, source, method: 'season_full_counting_rounds', denominator: null, benchmark: null, direction: 'lower_better' });
  if (playerOf(ctx)) {
    // A player's own season is on their own Stats page; the Roster page is the coach's.
    const page = loaders.playerStats ? await loaders.playerStats(playerId as string, 'season').catch(() => null) : null;
    if (!page) return failed('your season', 'The Stats page could not be read.');
    if (page.season.rounds === 0 || page.season.avg === null) return empty('No full rounds that count this season yet.');
    const me = { kind: 'player' as const, id: playerId as string, label: nameOf(ctx, playerId as string) };
    return withText({ summary: `${me.label}: this season.`, measurements: [figure(me, page.season.avg, page.season.rounds, SOURCE_STATS)], series: [], detail: { rounds: page.season.rounds, scoring_average: round(page.season.avg, 1), to_par: page.season.toPar === null ? null : round(page.season.toPar, 1) }, coverage: 'complete', coverage_note: null, as_of: nowIso(), window_label: 'this season' }, [
      `Scoring average ${say(page.season.avg, '', 1)}${page.season.toPar === null ? '' : ` (${say(page.season.toPar, '', 1, true)} to par)`} over ${page.season.rounds} full rounds that count, since 1 August. Source: ${SOURCE_STATS}.`,
    ]);
  }
  if (!loaders.roster) return failed('the season', 'The Roster page is not connected to this chat.');
  const page = await loaders.roster().catch(() => null);
  if (!page || page.playersError || page.statsError) return failed('the season', 'The Roster page could not be read.');
  const active = page.players.filter((p) => p.status === 'active' && (!playerId || p.id === playerId));
  const order = ranked(active.map((p) => ({ ...p, value: p.avg })), true);
  const measurements = [...(page.teamAvg === null || playerId ? [] : [figure({ kind: 'team', id: who.team_id, label: who.team_name }, page.teamAvg, active.reduce((n, p) => n + p.rounds, 0), 'Roster page')]), ...order.flatMap((p) => (p.value === null ? [] : [figure({ kind: 'player', id: p.id, label: p.name }, p.value, p.rounds, 'Roster page')]))];
  if (measurements.length === 0) return empty('No full rounds that count this season yet.');
  return withText(
    { summary: `${playerId ? nameOf(ctx, playerId) : who.team_name}: this season${page.season ? ` (${page.season})` : ''}.`, measurements, series: [], detail: { season: page.season, team_average: playerId ? undefined : page.teamAvg === null ? null : round(page.teamAvg, 1), players: order.map((p) => ({ place: p.place, player_id: p.id, player: p.name, rounds: p.rounds, scoring_average: p.value === null ? null : round(p.value, 1), sg_per_round: p.sgPerRound === null ? null : round(p.sgPerRound, 2), form: p.form })) }, coverage: 'complete', coverage_note: null, as_of: nowIso(), window_label: 'this season' },
    [
      `This season${page.season ? ` (${page.season})` : ''}: full rounds that count since 1 August, practice left out. Source: Roster page.`,
      page.teamAvg === null || playerId ? null : `${who.team_name} team scoring average this season: ${say(page.teamAvg, '', 1)}.`,
      ...order.map((p) => `  ${p.place === null ? 'no place' : `place ${p.place}`}: ${p.name}, scoring average this season ${p.value === null ? 'none yet (no rounds)' : `${say(p.value, '', 1)} (n=${p.rounds} rounds)`}${p.sgPerRound === null ? '' : `, strokes gained ${say(p.sgPerRound, '', 2, true)} a round`}, form ${p.form} [player ${p.id}]`),
    ],
  );
}

export const getSeason: ReadTool<SeasonInput> = {
  kind: 'read',
  name: 'get_season',
  description: 'Scoring this season as the Roster page shows it (full rounds that count since 1 August, practice left out): the team average and every player, or one player. With compare_last_season, also this season against last.',
  input: z.object({ player_id: PlayerId.optional(), compare_last_season: z.boolean().default(false) }),
  progress: (i) => (i.compare_last_season ? 'Comparing the seasons' : 'Reading the season'),
  run: async (ctx, input) => {
    const id = ownOrOne(ctx, input.player_id);
    const now = await part('this season', () => seasonNow(ctx, id));
    if (!input.compare_last_season) return now[1];
    // No screen draws last season beside this one; this is the chat library's own read and says so in its source.
    const last = await part('against last season', () => compareSeasons(ctx.sb, teamOf(ctx), { player_id: id }));
    const both = together('', [now, last]);
    // The season block of a visual draws from the comparison's own detail, so it stays at the top level.
    return last[1].coverage === 'unavailable' || !last[1].detail || typeof last[1].detail !== 'object' ? both : { ...both, detail: { ...(last[1].detail as Record<string, unknown>), this_season: now[1].detail ?? null } };
  },
};
export const getMySeason: ReadTool<SeasonInput> = { ...getSeason, description: 'Your scoring this season (full rounds that count since 1 August, practice left out). With compare_last_season, also this season against last.', input: z.object({ compare_last_season: z.boolean().default(false) }), progress: () => 'Reading your season' };

// ---------------------------------------------------------------------------------------------------------------------
// Qualifiers
// ---------------------------------------------------------------------------------------------------------------------

type QualifiersInput = { qualifier_id?: string; limit: number };

async function runQualifiers(ctx: ToolContext, input: QualifiersInput): Promise<ToolResult> {
  const loaders = screenLoaders(ctx);
  if (input.qualifier_id) {
    if (!loaders.qualifierBoard) return failed('the qualifier', 'The Qualifiers page is not connected to this chat.');
    const q = await loaders.qualifierBoard(input.qualifier_id).catch(() => null);
    if (!q) return failed('that qualifier', 'It could not be read, or it is not one of this team\'s.');
    if (q.entriesError || q.roundsError || !q.board) return failed(`the board for ${q.name}`, 'The entries or rounds could not be read.');
    const rows = q.board.rows;
    // The board's own rule (`qualifying/ranking.ts`): a card with fewer rounds than the most anyone has played ranks below every complete
    // card. The row's `shortRounds` is something else: how many of the player's counted rounds were not 18 holes.
    const behind = boardOrder(rows).short;
    const cardNote = (r: (typeof rows)[number]) => [behind(r) ? 'fewer rounds than the leaders, so ranked below every complete card' : null, r.shortRounds > 0 ? `${r.shortRounds} of the rounds not 18 holes` : null].filter(Boolean).join('; ') || null;
    const picked = new Map((q.selections ?? []).map((s) => [s.playerId, s]));
    return withText(
      {
        summary: `${q.name}: the board, ${rows.length} with a score.`,
        measurements: rows.flatMap((r) => (r.toPar === null ? [] : [{ metric_id: 'qualifier_to_par', metric_label: 'Qualifier total to par', unit: 'score' as const, value: r.toPar, entity: { kind: 'player' as const, id: r.playerId, label: r.name }, window_start: q.startDate, window_end: q.endDate, sample_size: r.played, sample_unit: 'rounds' as const, as_of: nowIso(), coverage: 'complete' as const, coverage_note: cardNote(r), source: 'Qualifiers board', method: 'board_order', denominator: null, benchmark: null, direction: 'lower_better' as const }])),
        series: [],
        detail: { qualifier_id: q.id, name: q.name, status: q.status, selection: q.selectionState, rounds_planned: q.numRounds, squad: q.squad, coach_picks: q.picks, entrants: q.entrants, standings: rows.map((r) => ({ position: r.position === null ? null : `${r.tied ? 'T' : ''}${r.position}`, player_id: r.playerId, player: r.name, rounds: r.played, total: r.total, to_par: r.toPar, avg_score: r.avg === null ? null : round(r.avg, 1), fewer_rounds_than_leaders: behind(r), rounds_not_18_holes: r.shortRounds, state: r.state, selected: picked.get(r.playerId)?.type ?? null, reason: picked.get(r.playerId)?.reasoning ?? null })), no_score_yet: q.board.unscored.map((u) => u.name) },
        coverage: 'complete',
        coverage_note: null,
        as_of: nowIso(),
      },
      [
        `${q.name} (${q.status}, ${q.startDate}${q.endDate ? ` to ${q.endDate}` : ''}): ${q.numRounds} rounds, squad of ${q.squad} with ${q.picks} coach picks, ${q.entrants} entered. In the board's own order. Source: Qualifiers board.`,
        ...rows.map((r) => `  ${r.position === null ? '-' : `${r.tied ? 'T' : ''}${r.position}`} ${r.name}: ${r.toPar === null ? 'no total' : `${say(r.toPar, '', 0, true)} to par, ${r.total} strokes`} over ${r.played} ${r.played === 1 ? 'round' : 'rounds'}${cardNote(r) ? ` (${cardNote(r)})` : ''}${r.state ? `, ${r.state}` : ''}${picked.has(r.playerId) ? `, selected (${picked.get(r.playerId)!.type === 'coach_pick' ? 'coach pick' : 'on score'}${picked.get(r.playerId)!.reasoning ? `: ${picked.get(r.playerId)!.reasoning}` : ''})` : ''} [player ${r.playerId}]`),
        q.board.unscored.length ? `No score yet: ${q.board.unscored.map((u) => u.name).join(', ')}.` : null,
      ],
    );
  }
  if (!loaders.qualifierList) return failed('the qualifiers', 'The Qualifiers page is not connected to this chat.');
  const page = await loaders.qualifierList().catch(() => null);
  if (!page || page.listError) return failed('the qualifiers', 'The Qualifiers page could not be read.');
  const items = page.items.slice(0, Math.min(Math.max(input.limit, 1), 8));
  if (items.length === 0) return empty('No qualifiers on record.', { qualifiers: [] });
  return withText(
    {
      summary: `${items.length} qualifier${items.length === 1 ? '' : 's'}, in the Qualifiers page's order.`,
      measurements: [],
      series: [],
      detail: { qualifiers: items.map((q) => ({ qualifier_id: q.id, name: q.name, status: q.status, start_date: q.startDate, end_date: q.endDate, course: q.course, rounds_planned: q.numRounds, squad: q.squad, coach_picks: q.picks, entrants: q.entrants, cards_in: q.submitted, leaders: q.leaders.map((l) => ({ position: l.position, player_id: l.playerId, player: l.name, rounds: l.played, to_par: l.toPar })) })) },
      coverage: page.standingsError ? 'partial' : 'complete',
      coverage_note: page.standingsError ? 'The standings could not be read; the leaders are missing.' : null,
      as_of: nowIso(),
    },
    items.flatMap((q) => [`${q.name} (${q.status}, ${q.startDate}): ${q.numRounds} rounds, squad of ${q.squad} with ${q.picks} coach picks, ${q.entrants} entered, ${q.submitted} cards in [qualifier ${q.id}]`, q.leaders.length ? `  Leaders: ${q.leaders.map((l) => `${l.position} ${l.name} ${l.toPar === null ? '' : say(l.toPar, '', 0, true)} (${l.played} rounds)`).join('; ')}` : null]),
  );
}

export const getQualifiers: ReadTool<QualifiersInput> = {
  kind: 'read',
  name: 'get_qualifiers',
  description: 'Qualifiers from the Qualifiers page. Without an id: the list with dates, status, squad size and leaders. With qualifier_id: the full board in its own order (position, to par, rounds, who is a round short, who was selected and why).',
  input: z.object({ qualifier_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(8).default(5) }),
  progress: (i) => (i.qualifier_id ? 'Reading the qualifier board' : 'Reading the qualifiers'),
  run: runQualifiers,
};
