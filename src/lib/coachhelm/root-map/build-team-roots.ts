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
  type AreaMeasuredMeta,
  type CauseSeed,
  type ConfidenceTier,
  type OtherRead,
  type RootArea,
  type RootMapModel,
  type RootStyle,
  type UnsizedCause,
  humanizeCauseLabel,
} from './build-root-map';
import {
  OTHER_KEY,
  groupMeasured,
  measuredLabel,
  nodeIdForKey,
  subKeyForMetric,
  teamMeasuredKeys,
  type MeasuredWhat,
} from './measured-what';

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
  /** A short header for the matrix and the map ("Downhill putts"); the full
   *  stored label stays in `label` (title / spoken). */
  shortLabel: string;
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

/** Causes drawn per losing area on the team map (sized first, then unsized). */
export const TEAM_MAP_CAUSES_PER_AREA = 3;

/**
 * Short, plain names for stored metric ids whose `metric_label` reads like a
 * column name. Named by what the generator actually measures:
 * - `sg_ott` is only written by the tee_strategy generator (category `tee`):
 *   driver vs other-tee-club fairway % on par 4s and 5s.
 * - `putt_miss_bias_left_pct` / `_right_pct` are the putt_bias generator's
 *   left-to-right / right-to-left BREAK make-rate gaps (not miss direction).
 */
const SHORT_METRIC_LABEL: Record<string, string> = {
  sg_ott: 'Driver vs layback',
  putt_slope_downhill_penalty_pct: 'Downhill putts',
  putt_miss_bias_left_pct: 'L-to-R breaks',
  putt_miss_bias_right_pct: 'R-to-L breaks',
  opening_hole_delta: 'First hole',
  scoring_par_3: 'Par 3s',
  scoring_par_4: 'Par 4s',
  scoring_par_5: 'Par 5s',
  scrambling_pct_sand: 'Sand saves',
  approach_proximity_50_125ft: 'Approach 50–125 yd',
  approach_proximity_125_175ft: 'Approach 125–175 yd',
  approach_proximity_175_plus_ft: 'Approach 175+ yd',
};

/** Short header for a cause column: a known metric id's plain name, else the
 *  humanized stored label with trailing qualifiers ("(distance-controlled)")
 *  dropped. */
export function shortCauseLabel(metric: string, label: string): string {
  const known = SHORT_METRIC_LABEL[metric];
  if (known) return known;
  const trimmed = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return trimmed.length > 0 ? trimmed : label;
}

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
  const gated = cand.steps.some(
    (st) => !!st && typeof st === 'object' && st.passed === true && (st.level === 'par' || st.level === 'shape'),
  );
  if (!gated || cand.path.length === 0) return null;
  return cand as DiagnosisNarrowing;
}

/** Subject-aware lead: approach misses, missed fairways, or over-par holes. */
export function concentrationLead(n: Pick<DiagnosisNarrowing, 'subject'>): string {
  if (n.subject === 'tee') return 'Missed fairways concentrate';
  if (n.subject === 'par_scoring') return 'Over-par holes concentrate';
  return 'Misses concentrate';
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
  /** Per player, the measured What split (`measured-what.ts#measureWhat`).
   *  A losing team area with at least one measured player draws its What row
   *  from the summed team sub-areas; otherwise it keeps the stored causes. */
  measured?: ReadonlyMap<string, MeasuredWhat> | null;
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
        shortLabel: shortCauseLabel(metric, e.label),
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

  // Team root map: WHERE = team-average area SG; WHAT = the top causes under
  // each losing area, ranked by summed team strokes (a cause carried by one
  // player still shows when it is among the largest; `players` says how many
  // carry it). Sized causes take their team-average width; causes with no
  // stored stroke value are listed as unsized (drawn as outlined nodes).
  const losing = new Set(ROOT_AREAS.filter((a) => (teamAreaSg[a] ?? 0) < 0));
  const sized: CauseSeed[] = [];
  const unsized: UnsizedCause[] = [];
  const other: OtherRead[] = [];
  const areaMeta: Partial<Record<RootArea, AreaMeasuredMeta>> = {};
  for (const area of losing) {
    const inArea = allColumns.filter(({ column }) => column.area === area);
    // Measured: the team's sub-areas summed from each player's shot split,
    // over the same players the team-average area SG is taken over.
    const withSg = input.players.filter((p) => finite(p.sg[area]));
    const perPlayer = withSg.map((p) => input.measured?.get(p.id)?.[area]);
    const team = teamMeasuredKeys(area, perPlayer, withSg.length);
    if (team.measuredPlayers > 0) {
      const groups = groupMeasured(area, team.keys, { playersByKey: team.playersByKey });
      // "Other" folds several keys: count players losing on their sum.
      const otherNode = groups.losing.find((g) => g.key === OTHER_KEY);
      if (otherNode) {
        const folded = new Set([OTHER_KEY, ...otherNode.merged]);
        otherNode.players = perPlayer.filter(
          (m) => !!m && m.mode !== 'none' && m.keys.filter((k) => folded.has(k.key)).reduce((t, k) => t + k.sg, 0) < 0,
        ).length;
      }
      if (groups.losing.length > 0) {
        const share = perPlayer.some((m) => m?.mode === 'share');
        const recomputed = team.keys.reduce((t, k) => t + k.sg, 0);
        const stored = teamAreaSg[area] as number;
        areaMeta[area] = {
          mode: share ? 'share' : 'measured',
          rounds: 0,
          stored,
          recomputed,
          offsets: groups.gaining.filter((g) => g.sg >= 0.005).map((g) => ({ label: g.label, sg: g.sg })),
          note:
            `${ROOT_AREA_LABEL[area]}: measured from recorded shots for ${team.measuredPlayers} of ${withSg.length} players` +
            (share ? ' (for some, each spot is a share of their stored total)' : '') +
            `; the team average is ${formatStrokes(stored, { signed: true })} a round.`,
        };
        const byNode = new Map<string, typeof inArea>();
        for (const col of inArea) {
          const key = subKeyForMetric(area, col.column.metric);
          const nodeId = key ? nodeIdForKey(groups, key) : null;
          if (!nodeId) {
            other.push({ id: `team:${col.column.metric}`, title: `${col.column.label} (${col.column.players === 1 ? '1 player' : `${col.column.players} players`})`, category: area, tier: null, isNew: false });
            continue;
          }
          const list = byNode.get(nodeId) ?? [];
          list.push(col);
          byNode.set(nodeId, list);
        }
        for (const sub of groups.losing) {
          const cols = (byNode.get(sub.id) ?? []).slice().sort((a, b) => b.column.players - a.column.players);
          const lead = cols[0];
          const agg = lead ? aggregateStyle([...lead.entry.cells.values()], [...lead.entry.conf.values()]) : null;
          sized.push({
            id: `team:${sub.id}`,
            area,
            title: sub.title,
            label: sub.label,
            strokes: -sub.sg,
            style: agg?.style ?? 'unexplained',
            tier: agg?.tier ?? null,
            causality: null,
            rootCause: null,
            isNew: false,
            players: sub.players ?? 0,
            sizedBy: share ? 'share' : 'measured',
            sizingNote: `team average from recorded shots, ${sub.players ?? 0} of ${withSg.length} players losing strokes here`,
            insightIds: cols.map((c) => `team:${c.column.metric}`),
            whyId: null,
            measured: {
              mode: share ? 'share' : 'measured',
              n: sub.n,
              unit: area === 'putting' ? 'holes' : 'shots',
              rounds: sub.rounds,
              merged: sub.merged.map((k) => measuredLabel(area, k)),
              lies: null,
              liesRest: null,
            },
          });
        }
        continue;
      }
    }
    const sizedCols = inArea
      .filter(({ column }) => column.teamStrokes !== null && column.teamStrokes > 0)
      .sort((a, b) => (b.column.teamStrokes ?? 0) - (a.column.teamStrokes ?? 0) || b.column.players - a.column.players)
      .slice(0, TEAM_MAP_CAUSES_PER_AREA);
    for (const { column, entry } of sizedCols) {
      const agg = aggregateStyle([...entry.cells.values()], [...entry.conf.values()]);
      sized.push({
        id: `team:${column.metric}`,
        area,
        title: column.label,
        label: column.shortLabel,
        strokes: column.teamStrokes as number,
        style: agg.style,
        tier: agg.tier,
        causality: null,
        rootCause: null,
        isNew: false,
        players: column.players,
      });
    }
    const room = TEAM_MAP_CAUSES_PER_AREA - sizedCols.length;
    if (room <= 0) continue;
    const unsizedCols = inArea
      .filter(({ column }) => column.teamStrokes === null)
      .sort((a, b) => b.column.players - a.column.players || a.column.label.localeCompare(b.column.label))
      .slice(0, room);
    for (const { column, entry } of unsizedCols) {
      const agg = aggregateStyle([...entry.cells.values()], [...entry.conf.values()]);
      unsized.push({
        id: `team:${column.metric}`,
        area,
        title: column.label,
        label: column.shortLabel,
        style: agg.style,
        tier: agg.tier,
        isNew: false,
        players: column.players,
      });
    }
  }
  const map = layoutRootMap({
    areas: ROOT_AREAS.map((area) => ({ area, sgPerRound: teamAreaSg[area] })),
    sized,
    unsized,
    other,
    newCount: 0,
    areaMeta,
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
    ? `${lead}; ${shared.players} players carry “${shared.shortLabel}” there.`
    : `${lead}.`;
}
