/**
 * ============================================================================
 * Team roots: the coach's "who carries which root" model
 * ----------------------------------------------------------------------------
 * PURE. Built from data the coach Brief page already reads:
 *   - `getSignalGroups` insight signals (stored `golf_coach_insights` rows,
 *     visibility-filtered, each with its stored `evidence`),
 *   - `golf_player_stats_cache` SG per round per player.
 *
 * COLUMNS are causes grouped by `evidence.metric`, exactly the grouping
 * `team-synthesis.ts` already uses for its team-leak cards. There is NO
 * root-driver clustering here: two players sharing a metric share a column,
 * nothing more is inferred.
 *
 * SIZE is the stored counterfactual strokes/round (`strokesPerRound`), the
 * same quantity the player root map uses. Team-leak cards sum
 * `evidence.strokes_impact` instead; the two differ (strokes_impact is
 * frequently 0), so a bubble here is not expected to match those cards.
 *
 * `team_synthesis` rows and patterns are skipped: a synthesis row is a sum of
 * rows already in the list (it would double-count), and patterns carry no
 * evidence blob.
 * ========================================================================== */

import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import type { DiagnosisNarrowing, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { TEAM_SIGNAL_MIN_PLAYERS } from '@/lib/coachhelm/v3/insights/team-synthesis';
import {
  confidenceTier,
  formatStrokes,
  isRootArea,
  layoutRootMap,
  rootStyleFor,
  ROOT_AREAS,
  ROOT_AREA_LABEL,
  strokesPerRound,
  type CauseSeed,
  type ConfidenceTier,
  type RootArea,
  type RootMapModel,
  type RootStyle,
  humanizeCauseLabel,
} from './build-root-map';

export interface TeamRosterPlayer {
  id: string;
  name: string;
  roundsPlayed: number | null;
  /** Stored SG per round by area (stats cache); null when unknown. */
  sg: Record<RootArea, number | null>;
  /** Stored total SG per round (stats cache); null when unknown. */
  sgTotal: number | null;
}

export interface TeamRootCell {
  insightId: string;
  /** Stored strokes/round; null when the row has no live counterfactual. */
  strokes: number | null;
  style: RootStyle;
  tier: ConfidenceTier | null;
  /** The stored context narrowing's path ("175+ yd → long par 3s →
   *  short-right") when it got past the length step; null otherwise. */
  contextPath: string | null;
}

export interface TeamRootColumn {
  metric: string;
  label: string;
  /** Area the column sits under, or 'other' for non-SG categories. */
  area: RootArea | 'other';
  players: number;
  /** Sum of sized cells / roster size: a team-average strokes/round,
   *  comparable to the team-average area SG. Null when no cell is sized. */
  teamStrokes: number | null;
  /** Carried by at least TEAM_SIGNAL_MIN_PLAYERS players. */
  shared: boolean;
}

export interface TeamRootRow {
  playerId: string;
  name: string;
  roundsPlayed: number | null;
  sgTotal: number | null;
  cells: Record<string, TeamRootCell>;
}

export interface TeamRootsModel {
  rosterSize: number;
  /** Players with a stored SG row; the team averages are over these. */
  playersWithSg: number;
  teamAreaSg: Record<RootArea, number | null>;
  map: RootMapModel;
  columns: TeamRootColumn[];
  /** Columns left out by the cap (single-player causes first). */
  hiddenColumns: number;
  rows: TeamRootRow[];
}

export const TEAM_MATRIX_MAX_COLUMNS = 10;

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function evidenceOf(signal: GroupedSignal): InsightEvidence | null {
  const ev = signal.evidence;
  return ev && typeof ev === 'object' ? (ev as InsightEvidence) : null;
}

/**
 * The context narrowing a generator stored on this signal
 * (`evidence.diagnosis.basis.narrowing`), validated, or null. Only a
 * narrowing that passed MORE than its length step is returned: the par and
 * shape steps are the gated concentrations (`v3/engine/context-narrowing.ts`)
 * — a bare length band says nothing the column does not already say. Rows
 * written before narrowing existed have none; that is "not stated", not "no
 * concentration". Nothing is recomputed on read.
 */
export function storedConcentration(signal: GroupedSignal): DiagnosisNarrowing | null {
  const n = evidenceOf(signal)?.diagnosis?.basis?.narrowing as unknown;
  if (!n || typeof n !== 'object') return null;
  const cand = n as Partial<DiagnosisNarrowing>;
  if (!Array.isArray(cand.path) || !cand.path.every((x) => typeof x === 'string')) return null;
  if (!Array.isArray(cand.steps) || typeof cand.sentence !== 'string') return null;
  const passed = cand.steps.filter((st) => st && typeof st === 'object' && st.passed === true);
  if (cand.path.length < 2 || passed.length < 2) return null;
  return cand as DiagnosisNarrowing;
}

/** "175+ yd → long par 3s → short-right". */
export function concentrationPathText(n: DiagnosisNarrowing): string {
  return n.path.join(' → ');
}

/** A column's aggregate style: observed only if every diagnosed member is
 *  observed; forming if the mean confidence is below solid; unexplained if
 *  no member carries a diagnosis. */
function aggregateStyle(cells: TeamRootCell[], confidences: number[]): { style: RootStyle; tier: ConfidenceTier | null } {
  const meanConf = confidences.length > 0 ? confidences.reduce((s, v) => s + v, 0) / confidences.length : null;
  const tier = confidenceTier(meanConf);
  const diagnosed = cells.filter((c) => c.style !== 'unexplained');
  if (diagnosed.length === 0) return { style: 'unexplained', tier };
  if (tier !== 'solid') return { style: 'forming', tier };
  if (diagnosed.every((c) => c.style === 'observed')) return { style: 'observed', tier };
  return { style: 'likely', tier };
}

export function buildTeamRoots(input: {
  players: TeamRosterPlayer[];
  signals: GroupedSignal[];
}): TeamRootsModel {
  const rosterSize = input.players.length;
  const rosterIds = new Set(input.players.map((p) => p.id));

  // Team-average area SG over players who have a stored value.
  const teamAreaSg = {} as Record<RootArea, number | null>;
  for (const area of ROOT_AREAS) {
    const vals = input.players.map((p) => p.sg[area]).filter(finite);
    teamAreaSg[area] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }
  const playersWithSg = input.players.filter((p) => ROOT_AREAS.some((a) => finite(p.sg[a]))).length;

  // (metric → player → cell), one cell per player per metric (largest wins).
  const byMetric = new Map<string, { label: string; area: RootArea | 'other'; cells: Map<string, TeamRootCell>; conf: Map<string, number> }>();
  for (const s of input.signals) {
    if (s.kind !== 'insight' || s.playerId === null || !rosterIds.has(s.playerId)) continue;
    const ev = evidenceOf(s);
    const metric = ev?.metric;
    if (!ev || typeof metric !== 'string' || metric.length === 0) continue;
    const label = humanizeCauseLabel(typeof ev.metric_label === 'string' && ev.metric_label.length > 0 ? ev.metric_label : metric);
    const area: RootArea | 'other' = isRootArea(s.category) ? s.category : 'other';
    const entry = byMetric.get(metric) ?? { label, area, cells: new Map(), conf: new Map() };
    const cell: TeamRootCell = {
      insightId: s.id,
      strokes: strokesPerRound(ev),
      style: rootStyleFor(ev),
      tier: confidenceTier(ev.confidence),
      contextPath: (() => {
        const n = storedConcentration(s);
        return n ? concentrationPathText(n) : null;
      })(),
    };
    const held = entry.cells.get(s.playerId);
    if (!held || (cell.strokes ?? -1) > (held.strokes ?? -1)) {
      entry.cells.set(s.playerId, cell);
      if (finite(ev.confidence)) entry.conf.set(s.playerId, ev.confidence);
      else entry.conf.delete(s.playerId);
    }
    byMetric.set(metric, entry);
  }

  const allColumns = [...byMetric.entries()].map(([metric, e]) => {
    const sized = [...e.cells.values()].map((c) => c.strokes).filter(finite);
    const teamStrokes = sized.length > 0 && rosterSize > 0 ? sized.reduce((s, v) => s + v, 0) / rosterSize : null;
    return {
      column: {
        metric,
        label: e.label,
        area: e.area,
        players: e.cells.size,
        teamStrokes,
        shared: e.cells.size >= TEAM_SIGNAL_MIN_PLAYERS,
      } satisfies TeamRootColumn,
      entry: e,
    };
  });

  // Keep the most-carried, largest columns; then order by area, then size.
  const ranked = allColumns
    .slice()
    .sort((a, b) => b.column.players - a.column.players || (b.column.teamStrokes ?? 0) - (a.column.teamStrokes ?? 0));
  const kept = ranked.slice(0, TEAM_MATRIX_MAX_COLUMNS);
  const areaOrder = (a: RootArea | 'other') => (a === 'other' ? ROOT_AREAS.length : ROOT_AREAS.indexOf(a));
  kept.sort(
    (a, b) =>
      areaOrder(a.column.area) - areaOrder(b.column.area) ||
      b.column.players - a.column.players ||
      (b.column.teamStrokes ?? 0) - (a.column.teamStrokes ?? 0),
  );

  const rows: TeamRootRow[] = input.players
    .map((p) => {
      const cells: Record<string, TeamRootCell> = {};
      for (const { column, entry } of kept) {
        const c = entry.cells.get(p.id);
        if (c) cells[column.metric] = c;
      }
      return { playerId: p.id, name: p.name, roundsPlayed: p.roundsPlayed, sgTotal: p.sgTotal, cells };
    })
    // Most strokes lost to the Tour first; players with no stored total last.
    .sort((a, b) => {
      if (a.sgTotal === null && b.sgTotal === null) return a.name.localeCompare(b.name);
      if (a.sgTotal === null) return 1;
      if (b.sgTotal === null) return -1;
      return a.sgTotal - b.sgTotal;
    });

  // Team root map: WHERE = team-average area SG; WHAT = shared SG columns.
  const losing = new Set(ROOT_AREAS.filter((a) => (teamAreaSg[a] ?? 0) < 0));
  const sized: CauseSeed[] = [];
  for (const { column, entry } of allColumns) {
    if (!column.shared || column.area === 'other' || !losing.has(column.area)) continue;
    if (column.teamStrokes === null || column.teamStrokes <= 0) continue;
    const cells = [...entry.cells.values()];
    const agg = aggregateStyle(cells, [...entry.conf.values()]);
    sized.push({
      id: `team:${column.metric}`,
      area: column.area,
      title: column.label,
      label: column.label,
      strokes: column.teamStrokes,
      style: agg.style,
      tier: agg.tier,
      causality: null,
      rootCause: null,
      isNew: false,
    });
  }
  const map = layoutRootMap({
    areas: ROOT_AREAS.map((area) => ({ area, sgPerRound: teamAreaSg[area] })),
    sized,
    unsized: [],
    other: [],
    newCount: 0,
  });

  return {
    rosterSize,
    playersWithSg,
    teamAreaSg,
    map,
    columns: kept.map((k) => k.column),
    hiddenColumns: allColumns.length - kept.length,
    rows,
  };
}

/**
 * One sentence for the team view, from the stored team-average area SG and
 * the shared columns. Null when no player has a stored SG row.
 */
export function buildTeamHeadline(model: TeamRootsModel): string | null {
  if (model.playersWithSg === 0) return null;
  const areas = ROOT_AREAS.map((a) => ({ a, v: model.teamAreaSg[a] })).filter(
    (x): x is { a: RootArea; v: number } => finite(x.v),
  );
  if (areas.length === 0) return null;
  const worst = areas.reduce((m, x) => (x.v < m.v ? x : m));
  const best = areas.reduce((m, x) => (x.v > m.v ? x : m));
  const label = (a: RootArea) => ROOT_AREA_LABEL[a];
  if (worst.v >= 0) {
    return `On average the team sits at or above the Tour line in every area; ${label(best.a)} leads at ${formatStrokes(best.v, { signed: true })} a round.`;
  }
  const shared = model.columns
    .filter((c) => c.shared && c.area === worst.a)
    .sort((x, y) => y.players - x.players)[0];
  const where: Record<RootArea, string> = {
    tee: 'off the tee',
    approach: 'on approach',
    short_game: 'around the green',
    putting: 'in putting',
  };
  const lead = `On average the team gives back ${formatStrokes(-worst.v)} a round to the Tour line ${where[worst.a]}`;
  return shared
    ? `${lead}; ${shared.players} players carry “${shared.label}” there.`
    : `${lead}.`;
}
