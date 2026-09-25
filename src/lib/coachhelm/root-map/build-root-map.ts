/**
 * ============================================================================
 * CoachHelm ROOT MAP: the pure layout behind the "root map" Today view
 * ----------------------------------------------------------------------------
 * One strokes-weighted diagram replaces the card stack:
 *
 *   GAINS   areas with positive SG/round, drawn above the Tour line
 *   ─────── Tour line (PGA Tour expected-strokes baseline, the same one
 *           `src/lib/golf/strokes-gained.ts` and the stats cache use)
 *   WHERE   areas with negative SG/round, width = |SG/round|
 *   WHAT    v3 cause insights under each losing area, width = the insight's
 *           stored `evidence.counterfactual.strokes_saved_per_round`; an
 *           approach-band row with no counterfactual is sized by its band's
 *           share of the stored approach SG (`sizedBy: 'band_sg'`, see
 *           `approach-context.ts`) when that split reconciles
 *   WHY     the root driver from `evidence.diagnosis`, styled by how firmly
 *           it is supported (see {@link rootStyleFor}); approach branches also
 *           carry the gated length → par → shape path (`contextPath`)
 *
 * PURE and read-only. Every number comes from rows the page already read
 * (stored round SG, stored insight evidence, the approach band split the
 * page built from recorded shots). Nothing is generated. A value that is
 * missing is left out and reported as such (`unsized`, `other`), never
 * filled in.
 *
 * WIDTHS vs VALUES. Area SG and a cause's counterfactual are different
 * quantities: the cache SG is an average over every counted round, while a
 * counterfactual is a per-metric gap to the Tour that is capped and can
 * overlap a sibling (3-5 ft and 5-10 ft putts are not additive). So the
 * children of one area can add up to MORE than the area itself. When that
 * happens the children are scaled down to fit the parent (`scaledToFit`)
 * and the remainder is 0. The stored numbers (`strokes`) are always what
 * gets printed; only the drawn fractions (`x`, `w`) are scaled.
 *
 * CLIENT-SAFE: no server or ranking imports live here, so the client map
 * components can import the types and copy helpers. The insight → model
 * step that needs the delivery ranking helpers is `build-player-root-map.ts`.
 * ========================================================================== */

import type { CausalityLevel, Diagnosis, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { isTemplatedRootCause, plainMetricLabel, plainRootCause, richWhySentence } from './plain-copy';

/** The four strokes-gained areas the map is drawn over. */
export type RootArea = 'tee' | 'approach' | 'short_game' | 'putting';

export const ROOT_AREAS: readonly RootArea[] = ['tee', 'approach', 'short_game', 'putting'];

export const ROOT_AREA_LABEL: Record<RootArea, string> = {
  tee: 'Off the tee',
  approach: 'Approach',
  short_game: 'Around the green',
  putting: 'Putting',
};

export function isRootArea(value: unknown): value is RootArea {
  return typeof value === 'string' && (ROOT_AREAS as readonly string[]).includes(value);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Confidence + causality
 * ──────────────────────────────────────────────────────────────────────── */

export type ConfidenceTier = 'solid' | 'early' | 'thin';

export const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  solid: 'Solid read',
  early: 'Early read',
  thin: 'Thin read',
};

/**
 * Same bands as the counterfactual formatter's `bandFor`
 * (`v3/counterfactual/compute.ts`): < 0.4 low, < 0.7 medium, else high.
 * A missing or non-finite confidence has no tier (never "solid" by default).
 */
export function confidenceTier(confidence: number | null | undefined): ConfidenceTier | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  if (confidence < 0.4) return 'thin';
  if (confidence < 0.7) return 'early';
  return 'solid';
}

/**
 * How a root driver is drawn:
 * - `observed`: diagnosis traced to a recorded shot sequence (solid fill,
 *   "seen in your shots").
 * - `likely`: an inferred hypothesis (hatched, "likely").
 * - `forming`: a thin or early read, whatever its causality (dashed).
 * - `unexplained`: no diagnosis on the row (neutral gray).
 */
export type RootStyle = 'observed' | 'likely' | 'forming' | 'unexplained';

export const ROOT_STYLE_LABEL: Record<RootStyle, string> = {
  observed: 'Seen in your shots',
  likely: 'Likely',
  forming: 'Forming',
  unexplained: 'Not yet explained',
};

/**
 * Who a root-map surface is speaking to. The player map says "your"; the
 * coach surfaces (team roots, the coach's drill into one player) never do.
 */
export type RootAudience = 'player' | 'coach';

/** {@link ROOT_STYLE_LABEL} in the audience's voice ("Seen in shots" for a
 *  coach). */
export function rootStyleLabel(style: RootStyle, audience: RootAudience = 'player'): string {
  if (audience === 'coach' && style === 'observed') return 'Seen in shots';
  return ROOT_STYLE_LABEL[style];
}

type EvidenceWithExtras = InsightEvidence & {
  counterfactual?: { strokes_saved_per_round?: unknown; suppressed?: unknown; current_baseline_score?: unknown; projected_score_if_closed?: unknown } | null;
};

export function diagnosisOf(evidence: InsightEvidence | null | undefined): Diagnosis | null {
  const d = evidence?.diagnosis;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.root_cause !== 'string' || d.root_cause.trim().length === 0) return null;
  return d;
}

/** `diagnosis.causality_level`, falling back to the evidence-level field. */
export function causalityOf(evidence: InsightEvidence | null | undefined): CausalityLevel | null {
  const fromDiagnosis = evidence?.diagnosis?.causality_level;
  if (fromDiagnosis === 'observed_sequence' || fromDiagnosis === 'inferred_hypothesis') return fromDiagnosis;
  const fromEvidence = evidence?.causality_level;
  if (fromEvidence === 'observed_sequence' || fromEvidence === 'inferred_hypothesis') return fromEvidence;
  return null;
}

export function rootStyleFor(evidence: InsightEvidence | null | undefined): RootStyle {
  if (!diagnosisOf(evidence)) return 'unexplained';
  const tier = confidenceTier(evidence?.confidence);
  if (tier !== 'solid') return 'forming';
  return causalityOf(evidence) === 'observed_sequence' ? 'observed' : 'likely';
}

/**
 * The strokes/round a cause is worth: the stored, non-suppressed
 * `evidence.counterfactual.strokes_saved_per_round`. Null when there is no
 * live counterfactual (every approach row in production today), so the
 * cause is listed as unsized instead of being given an invented width.
 */
export function strokesPerRound(evidence: InsightEvidence | null | undefined): number | null {
  const cf = (evidence as EvidenceWithExtras | null | undefined)?.counterfactual;
  if (!cf || typeof cf !== 'object' || cf.suppressed === true) return null;
  const v = cf.strokes_saved_per_round;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Stored scoring now vs projected-if-closed, when both exist. */
export function scoringProjection(
  evidence: InsightEvidence | null | undefined,
): { now: number; ifClosed: number } | null {
  const cf = (evidence as EvidenceWithExtras | null | undefined)?.counterfactual;
  if (!cf || typeof cf !== 'object' || cf.suppressed === true) return null;
  const now = cf.current_baseline_score;
  const ifClosed = cf.projected_score_if_closed;
  if (typeof now !== 'number' || !Number.isFinite(now)) return null;
  if (typeof ifClosed !== 'number' || !Number.isFinite(ifClosed)) return null;
  return { now, ifClosed };
}

/** Date-only `YYYY-MM-DD` of an ISO timestamp or date string, or null. */
export function isoDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Model
 * ──────────────────────────────────────────────────────────────────────── */

export interface RootMapAreaInput {
  area: RootArea;
  /** SG per round vs the Tour baseline; null when unknown. */
  sgPerRound: number | null;
}

export interface GainSegment {
  area: RootArea;
  label: string;
  sg: number;
  /** Drawn fractions of the full width, 0..1. */
  x: number;
  w: number;
}

export interface CauseBranch {
  id: string;
  area: RootArea;
  title: string;
  /** Short label for the cause (the metric's display label). */
  label: string;
  /** Stored strokes/round (printed as-is). */
  strokes: number;
  /** Drawn fractions of the full width, 0..1. */
  x: number;
  w: number;
  style: RootStyle;
  tier: ConfidenceTier | null;
  causality: CausalityLevel | null;
  /** `diagnosis.root_cause`, or null when there is none. */
  rootCause: string | null;
  isNew: boolean;
  /**
   * Where `strokes` comes from. `counterfactual` (default): the stored
   * `evidence.counterfactual.strokes_saved_per_round`. `band_sg`: an approach
   * band's share of the stored approach strokes gained, split per shot on the
   * same baseline (`approach-context.ts`), only when that split reconciled.
   */
  sizedBy?: 'counterfactual' | 'band_sg' | 'measured' | 'share';
  /** One line naming what the number is, e.g. "approach strokes gained from
   *  175+ yd, last 18 rounds". */
  sizingNote?: string | null;
  /** The gated length → par → shape path, e.g. "175+ yd → par 4s →
   *  short-right" (`context-narrowing.ts`); null when it did not narrow. */
  contextPath?: string | null;
  /** Team map only: how many players carry this cause. */
  players?: number;
  /** Measured sub-area nodes: every stored insight attached as its Why
   *  (best first). The first is the one the Why view opens. */
  insightIds?: string[];
  /** The insight the Why view opens for this node; null when no stored read
   *  matches the spot (the node still shows its measured value). */
  whyId?: string | null;
  /** Present on a node built from recorded shots (`measured-what.ts`). */
  measured?: MeasuredNodeInfo;
}

/** What a measured What-row node stands on. */
export interface MeasuredNodeInfo {
  /** `measured`: printed values are the shot-level split; `share`: each is
   *  its share of the stored area total (the split did not reconcile). */
  mode: 'measured' | 'share';
  /** Shots (holes for putting) the spot was read from. */
  n: number;
  unit: 'shots' | 'holes';
  rounds: number;
  /** Labels of the thin or smaller spots folded into an "Other" node. */
  merged: string[];
  /** Approach bands: the loss by the lie the shot was played from. */
  lies: Array<{ label: string; sg: number; n: number }> | null;
  /** Whatever of the band the listed lies do not cover (thin lies). */
  liesRest: number | null;
}

/** How a losing area's What row was built from recorded shots. */
export interface AreaMeasuredMeta {
  mode: 'measured' | 'share';
  rounds: number;
  /** Stored area SG per round (the Where row). */
  stored: number;
  /** Shot-level SG per round, before any share scaling. */
  recomputed: number;
  /** Spots inside the losing area that GAIN strokes (they offset the rest). */
  offsets: Array<{ label: string; sg: number }>;
  /** One plain sentence on how the split was read and whether it matched. */
  note: string;
}

export interface AreaBranch {
  area: RootArea;
  label: string;
  /** Negative SG/round as stored. */
  sg: number;
  /** |sg| — the size of the loss. */
  loss: number;
  x: number;
  w: number;
  causes: CauseBranch[];
  /** The part of the area no sized cause explains (drawn neutral). */
  remainder: { x: number; w: number; strokes: number } | null;
  /** True when the causes' stored values added to more than the area and
   *  were scaled down to fit. */
  scaledToFit: boolean;
  /** Set when the What row is built from recorded shots: the remainder is
   *  then "Not tracked by shot", not unexplained. */
  measured?: AreaMeasuredMeta | null;
}

export interface UnsizedCause {
  id: string;
  area: RootArea;
  title: string;
  label: string;
  style: RootStyle;
  tier: ConfidenceTier | null;
  isNew: boolean;
  /** Gated length → par → shape path (approach bands), when it narrowed. */
  contextPath?: string | null;
  /** Why it has no width, when there is a specific reason. */
  note?: string | null;
  /** Team map only: how many players carry this cause. */
  players?: number;
}

export interface OtherRead {
  id: string;
  title: string;
  category: string | null;
  tier: ConfidenceTier | null;
  isNew: boolean;
}

export interface RootMapModel {
  /** Strokes/round represented by the full width. 0 when nothing to draw. */
  scale: number;
  gains: GainSegment[];
  losses: AreaBranch[];
  /** Sum of every known area SG; null when no area SG is known. */
  netSg: number | null;
  /** Losing-area causes with no stored strokes value. */
  unsized: UnsizedCause[];
  /** Every other returned insight (non-SG categories, causes under a gaining
   *  area), so each row the page fetched is rendered somewhere. */
  other: OtherRead[];
  /** Branch selected on first paint (see {@link pickDefaultSelection}). */
  defaultSelectedId: string | null;
  newCount: number;
}

const STYLE_RANK: Record<RootStyle, number> = { observed: 0, likely: 1, forming: 2, unexplained: 3 };

/**
 * The largest `observed` branch; if none, the largest `likely`; then
 * `forming`; then anything. Null only when there are no sized causes.
 * Production today has no observed diagnoses, so the fallback is the
 * normal path, not an edge case.
 */
export function pickDefaultSelection(losses: AreaBranch[]): string | null {
  const all = losses.flatMap((a) => a.causes);
  if (all.length === 0) return null;
  const best = all.slice().sort((a, b) => {
    const s = STYLE_RANK[a.style] - STYLE_RANK[b.style];
    return s !== 0 ? s : b.strokes - a.strokes;
  })[0];
  return best?.id ?? null;
}

/** A cause ready for layout: the stored strokes value plus how to draw it. */
export type CauseSeed = Omit<CauseBranch, 'x' | 'w'>;

export interface RootMapLayoutInput {
  areas: RootMapAreaInput[];
  /** Causes with a stored strokes value, under a LOSING area. */
  sized: CauseSeed[];
  unsized: UnsizedCause[];
  other: OtherRead[];
  newCount: number;
  /** Losing areas whose What row is measured from shots. */
  areaMeta?: Partial<Record<RootArea, AreaMeasuredMeta>>;
}

/**
 * Pure geometry. Shared by the player map ({@link buildRootMap}) and the team
 * map (`build-team-roots.ts`), so both draw with the same rules:
 * - one scale for gains and losses: the larger of the two totals fills the
 *   width, so a bar's length always means the same strokes on both sides;
 * - area slices are contiguous and sum to their side's total;
 * - an area's causes sit left to right, largest first, and never overflow
 *   the area (scaled to fit when their stored values add up to more).
 */
export function layoutRootMap(input: RootMapLayoutInput): RootMapModel {
  const areaSg = new Map<RootArea, number>();
  for (const a of input.areas) {
    if (typeof a.sgPerRound === 'number' && Number.isFinite(a.sgPerRound)) areaSg.set(a.area, a.sgPerRound);
  }

  const gainAreas = ROOT_AREAS.filter((a) => (areaSg.get(a) ?? 0) > 0).sort(
    (a, b) => (areaSg.get(b) ?? 0) - (areaSg.get(a) ?? 0),
  );
  const lossAreas = ROOT_AREAS.filter((a) => (areaSg.get(a) ?? 0) < 0).sort(
    (a, b) => (areaSg.get(a) ?? 0) - (areaSg.get(b) ?? 0),
  );
  const sumGain = gainAreas.reduce((s, a) => s + (areaSg.get(a) ?? 0), 0);
  const sumLoss = lossAreas.reduce((s, a) => s + Math.abs(areaSg.get(a) ?? 0), 0);
  const scale = Math.max(sumGain, sumLoss);

  const gains: GainSegment[] = [];
  let gx = 0;
  for (const area of gainAreas) {
    const sg = areaSg.get(area) ?? 0;
    const w = scale > 0 ? sg / scale : 0;
    gains.push({ area, label: ROOT_AREA_LABEL[area], sg, x: gx, w });
    gx += w;
  }

  const losses: AreaBranch[] = [];
  let lx = 0;
  for (const area of lossAreas) {
    const sg = areaSg.get(area) ?? 0;
    const loss = Math.abs(sg);
    const w = scale > 0 ? loss / scale : 0;
    const rows = input.sized
      .filter((c) => c.area === area && Number.isFinite(c.strokes) && c.strokes > 0)
      .sort((a, b) => b.strokes - a.strokes);
    const causeSum = rows.reduce((s, r) => s + r.strokes, 0);
    const scaledToFit = causeSum > loss;
    const fit = scaledToFit && causeSum > 0 ? loss / causeSum : 1;

    const causes: CauseBranch[] = [];
    let cx = lx;
    for (const seed of rows) {
      const cw = scale > 0 ? (seed.strokes * fit) / scale : 0;
      causes.push({ ...seed, x: cx, w: cw });
      cx += cw;
    }
    const remainderStrokes = scaledToFit ? 0 : loss - causeSum;
    const remainderW = scale > 0 ? remainderStrokes / scale : 0;
    losses.push({
      area,
      label: ROOT_AREA_LABEL[area],
      sg,
      loss,
      x: lx,
      w,
      causes,
      // A measured area's rest under half a hundredth prints as 0.00: drop it.
      remainder:
        remainderStrokes > (input.areaMeta?.[area] ? 0.005 : 1e-9) ? { x: cx, w: remainderW, strokes: remainderStrokes } : null,
      scaledToFit,
      measured: input.areaMeta?.[area] ?? null,
    });
    lx += w;
  }

  const netSg = areaSg.size > 0 ? [...areaSg.values()].reduce((s, v) => s + v, 0) : null;

  return {
    scale,
    gains,
    losses,
    netSg,
    unsized: input.unsized,
    other: input.other,
    defaultSelectedId: pickDefaultSelection(losses),
    newCount: input.newCount,
  };
}

/** All sized branches, flattened. */
export function allBranches(model: RootMapModel): CauseBranch[] {
  return model.losses.flatMap((a) => a.causes);
}

/** The branch with this id, or the measured node a stored insight with this
 *  id is attached to (so an insight id from a link selects its spot). */
export function findBranch(model: RootMapModel, id: string | null | undefined): CauseBranch | null {
  if (!id) return null;
  const all = allBranches(model);
  return all.find((b) => b.id === id) ?? all.find((b) => b.insightIds?.includes(id)) ?? null;
}

/** The insight a branch's Why opens: its attached read, or itself for a
 *  cause built from one insight. Null for a measured spot with no read. */
export function whyIdOf(branch: CauseBranch): string | null {
  if (branch.whyId !== undefined) return branch.whyId;
  return branch.measured ? null : branch.id;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Copy
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Stored metric labels read like column names ("Putts Made 3-5 ft"). Turn the
 * common shapes into plain phrases for the map and headline ("3–5 ft putts").
 */
export function humanizeCauseLabel(raw: string): string {
  let s = raw.trim().replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
  const putts = /^putts made\s+(.+)$/i.exec(s);
  if (putts?.[1]) s = `${putts[1]} putts`;
  return s;
}

export function formatStrokes(value: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(value).toFixed(2);
  if (!opts.signed) return abs;
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * The headline sentence, built only from the model. Wording follows the
 * selected branch's support: observed → "seen in your shots", a hypothesis →
 * "likely", a thin/early read → "still forming". Null when there is no area
 * SG at all (the page shows an honest empty state instead).
 */
export function buildRootHeadline(
  model: RootMapModel,
  selected: CauseBranch | null,
  audience: RootAudience = 'player',
): string | null {
  if (model.gains.length === 0 && model.losses.length === 0) return null;
  const parts: string[] = [];
  const topGain = model.gains[0];
  if (topGain) {
    parts.push(`${topGain.label} is gaining ${formatStrokes(topGain.sg)} a round on the Tour line.`);
  } else {
    parts.push('Every area sits below the Tour line right now.');
  }
  const topLoss = model.losses[0];
  if (topLoss) {
    const branch = selected && selected.area === topLoss.area ? selected : topLoss.causes[0] ?? null;
    const base = `${topLoss.label} gives back ${formatStrokes(topLoss.loss)}`;
    if (!branch) {
      parts.push(`${base}.`);
    } else {
      const what = lowerFirst(branch.label);
      if (branch.measured) {
        const part = `${base}; the biggest part is ${what} (${formatStrokes(branch.strokes)})`;
        if (branch.style === 'observed') parts.push(`${part}, ${supportPhrase('observed', audience)}.`);
        else if (branch.style === 'likely') parts.push(`${part}, with a likely cause on the map.`);
        else if (branch.style === 'forming') parts.push(`${part}; the read on why is still forming.`);
        else parts.push(`${part}; no stored read explains it yet.`);
      } else if (branch.style === 'observed') parts.push(`${base}, ${what} is where, ${supportPhrase('observed', audience)}.`);
      else if (branch.style === 'likely') parts.push(`${base}, likely around ${what}.`);
      else if (branch.style === 'forming') parts.push(`${base}; the read on ${what} is still forming.`);
      else parts.push(`${base}; ${what} is part of it, the cause is not explained yet.`);
    }
  } else if (topGain) {
    parts.push('No area is losing strokes to the Tour line.');
  }
  return parts.join(' ');
}

/* ─────────────────────────────────────────────────────────────────────────
 * Branch detail (the chain under the map, and the Why view)
 * ──────────────────────────────────────────────────────────────────────── */

export interface BranchDriver {
  label: string;
  value: number;
  unit: InsightEvidence['unit'];
  sampleN: number;
}

export interface BranchDetail {
  id: string;
  title: string;
  content: string;
  metricLabel: string;
  unit: InsightEvidence['unit'];
  yourValue: number;
  yourDisplay: string | null;
  comparisonValue: number;
  comparisonLabel: string;
  secondaryValue: number | null;
  secondaryLabel: string | null;
  sampleN: number;
  windowStart: string | null;
  windowEnd: string | null;
  confidence: number | null;
  tier: ConfidenceTier | null;
  style: RootStyle;
  causality: CausalityLevel | null;
  symptom: string | null;
  /** `diagnosis.root_cause` in plain words (a templated "off its benchmark"
   *  row is rewritten, see `plain-copy.ts`). */
  rootCause: string | null;
  /** The stored insight text's own explanation, when richer than a
   *  templated diagnosis: the Why's main sentence. Null otherwise. */
  whySentence: string | null;
  recommendedAction: string | null;
  confidenceReason: string | null;
  /** The first quantified driver behind the diagnosis, when stored. */
  driver: BranchDriver | null;
  /** Stored repeated shot path, only when the diagnosis traced one. */
  sequence: NonNullable<NonNullable<Diagnosis['basis']>['sequence']> | null;
  strokes: number | null;
  projection: { now: number; ifClosed: number } | null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Everything the chain + Why view print for one insight, read straight
 *  from its stored evidence. Returns null when the evidence is unusable. */
export function branchDetailOf(insight: {
  id: string;
  title: string;
  content: string;
  evidence: InsightEvidence | null | undefined;
}): BranchDetail | null {
  const ev = insight.evidence;
  if (!ev || typeof ev !== 'object') return null;
  const yourValue = finiteOrNull(ev.your_value);
  const comparisonValue = finiteOrNull(ev.comparison_value);
  if (yourValue === null || comparisonValue === null) return null;
  const diag = diagnosisOf(ev);
  const d0 = diag?.drivers?.find((d) => finiteOrNull(d?.value) !== null) ?? null;
  const seq = diag?.basis?.kind === 'shot_sequence' ? diag.basis.sequence ?? null : null;
  return {
    id: insight.id,
    title: insight.title,
    content: insight.content,
    metricLabel: typeof ev.metric_label === 'string' && ev.metric_label ? ev.metric_label : insight.title,
    unit: ev.unit,
    yourValue,
    yourDisplay: typeof ev.your_value_display === 'string' && ev.your_value_display.trim() ? ev.your_value_display : null,
    comparisonValue,
    comparisonLabel: typeof ev.comparison_label === 'string' && ev.comparison_label ? ev.comparison_label : 'Comparison',
    secondaryValue: finiteOrNull(ev.secondary_value),
    secondaryLabel: typeof ev.secondary_label === 'string' && ev.secondary_label ? ev.secondary_label : null,
    sampleN: finiteOrNull(ev.sample_n) ?? 0,
    windowStart: isoDay(ev.window_start),
    windowEnd: isoDay(ev.window_end),
    confidence: finiteOrNull(ev.confidence),
    tier: confidenceTier(ev.confidence),
    style: rootStyleFor(ev),
    causality: causalityOf(ev),
    symptom: diag?.symptom?.trim() || null,
    rootCause: plainRootCause(diag?.root_cause, typeof ev.metric === 'string' ? ev.metric : null),
    whySentence: isTemplatedRootCause(diag?.root_cause) ? richWhySentence(insight.content) : null,
    recommendedAction: diag?.recommended_action?.trim() || null,
    confidenceReason: diag?.confidence_reason?.trim() || null,
    driver: d0
      ? {
          label:
            (typeof d0.label === 'string' && d0.label.trim() && d0.label !== d0.metric && d0.label) ||
            (d0.metric === ev.metric && typeof ev.metric_label === 'string' && ev.metric_label.trim()
              ? humanizeCauseLabel(ev.metric_label)
              : plainMetricLabel(d0.metric)),
          value: d0.value,
          unit: d0.unit,
          sampleN: finiteOrNull(d0.sample_n) ?? 0,
        }
      : null,
    sequence: seq && finiteOrNull(seq.occurrences) !== null && finiteOrNull(seq.of) !== null ? seq : null,
    strokes: strokesPerRound(ev),
    projection: scoringProjection(ev),
  };
}

/** Wording for a root per its support. Never states a hypothesis as fact. */
export function supportPhrase(style: RootStyle, audience: RootAudience = 'player'): string {
  switch (style) {
    case 'observed':
      return audience === 'coach' ? 'seen in shots' : 'seen in your shots';
    case 'likely':
      return 'likely';
    case 'forming':
      return 'still forming';
    default:
      return 'not yet explained';
  }
}

/** "Sep 17" from a date-only string, without touching time zones. */
export function shortDate(day: string | null | undefined): string | null {
  const d = isoDay(day ?? null);
  if (!d) return null;
  const [, m, dd] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = Number(m) - 1;
  const name = months[mi];
  return name ? `${name} ${Number(dd)}` : null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Staleness of the data the map is read from
 * ──────────────────────────────────────────────────────────────────────── */

/** A map older than this many days calls out its last round. */
export const STALE_AFTER_DAYS = 30;

/** Whole days from `fromDay` to `toDay` (both date-only), or null. Pure date
 *  arithmetic in UTC, so server and client agree. */
export function daysBetween(fromDay: string | null | undefined, toDay: string | null | undefined): number | null {
  const a = isoDay(fromDay ?? null);
  const b = isoDay(toDay ?? null);
  if (!a || !b) return null;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

function agoText(days: number): string {
  if (days < 14) return `${days} days ago`;
  if (days < 120) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30.4);
  return `${months} ${months === 1 ? 'month' : 'months'} ago`;
}

/**
 * "Last round Jul 10 — 11 weeks ago" when the latest counted round is more
 * than {@link STALE_AFTER_DAYS} old; null when it is recent or unknown.
 * `daysAgo` is computed on the server (see the pages) so the client render
 * never reads the clock.
 */
export function staleRoundLine(throughDate: string | null | undefined, daysAgo: number | null | undefined): string | null {
  const day = shortDate(throughDate ?? null);
  if (!day || typeof daysAgo !== 'number' || !Number.isFinite(daysAgo) || daysAgo <= STALE_AFTER_DAYS) return null;
  return `Last round ${day} — ${agoText(daysAgo)}`;
}
