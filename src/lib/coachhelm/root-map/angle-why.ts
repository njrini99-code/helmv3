/**
 * ============================================================================
 * Root map: the insight-angle evidence the Why view draws
 * ----------------------------------------------------------------------------
 * The insight-angle generators (`v3/generators/insight-angles/*`, behind
 * `coachhelm_insight_angles_v1`) store their drill-down numbers in
 * `evidence.detail`, tagged by `detail.angle`, with receipts (window,
 * denominators, exclusions, example holes) in `detail.receipts`. This module
 * reads that JSON into small view shapes for `RootWhy`.
 *
 * CLIENT-SAFE and pure. It never imports the generators at runtime (they pull
 * in the server loaders) and it parses defensively: any shape it does not
 * recognise returns null, so the generic Why still renders. Older rows with
 * the same metric id but no `detail.angle` (the legacy three_putt_chain
 * generator) also return null.
 * ========================================================================== */

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number {
  const n = num(v);
  return n === null ? 0 : n;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Receipts
 * ──────────────────────────────────────────────────────────────────────── */

export interface AngleCount {
  key: string;
  label: string;
  n: number;
}

export interface AngleExample {
  roundId: string;
  holeNumber: number;
  date: string | null;
  note: string | null;
}

export interface AngleReceiptsView {
  windowStart: string | null;
  windowEnd: string | null;
  definition: string | null;
  samples: AngleCount[];
  exclusions: AngleCount[];
  examples: AngleExample[];
}

/** "rough_approaches_in_tested_bands" → "rough approaches in tested bands". */
export function countLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/(\d+) plus\b/g, '$1+').replace(/\bpar(\d)(?=\b| )/g, 'par $1').replace(/\bsg\b/g, 'SG').trim();
}

function counts(v: unknown): AngleCount[] {
  const o = obj(v);
  if (!o) return [];
  const out: AngleCount[] = [];
  for (const [key, raw] of Object.entries(o)) {
    const n = num(raw);
    if (n === null) continue;
    out.push({ key, label: countLabel(key), n });
  }
  return out;
}

function receiptsOf(v: unknown): AngleReceiptsView {
  const r = obj(v) ?? {};
  const w = obj(r.window) ?? {};
  const examples: AngleExample[] = [];
  for (const e of arr(r.examples)) {
    const o = obj(e);
    const roundId = str(o?.round_id);
    const hole = num(o?.hole_number);
    if (!o || !roundId || hole === null) continue;
    examples.push({ roundId, holeNumber: hole, date: str(o.date), note: str(o.note) });
  }
  return {
    windowStart: str(w.window_start),
    windowEnd: str(w.window_end),
    definition: str(r.definition),
    samples: counts(r.samples),
    exclusions: counts(r.exclusions),
    examples,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Views
 * ──────────────────────────────────────────────────────────────────────── */

export interface LieCellView {
  n: number;
  girPct: number | null;
  proximityFt: number | null;
}

export interface LieApproachView {
  kind: 'lie_approach';
  cause: 'rough_execution' | 'fairway_exposure' | null;
  bands: Array<{ band: string; label: string; qualifies: boolean; fairway: LieCellView; rough: LieCellView }>;
  fairwayPct: number | null;
  peerFairwayPct: number | null;
  peerN: number;
  fairwayHoles: number;
  roughAllPer18: number | null;
  receipts: AngleReceiptsView;
}

export type FloorPartKey = 'penalties' | 'double_or_worse' | 'everything_else';

export interface BadDayFloorView {
  kind: 'bad_day_floor';
  rounds: Array<{ id: string; date: string | null; toPar: number }>;
  median: number;
  p80: number;
  badMean: number;
  middleMean: number;
  badRounds: number;
  middleRounds: number;
  split: Record<FloorPartKey, number>;
  receipts: AngleReceiptsView;
}

export type LeaveBucketKey = 'lt3' | '3_6' | '6_10' | '10_plus';
export const LEAVE_BUCKET_KEYS: readonly LeaveBucketKey[] = ['lt3', '3_6', '6_10', '10_plus'];
export const LEAVE_BUCKET_TEXT: Record<LeaveBucketKey, string> = {
  lt3: '<3 ft',
  '3_6': '3–6',
  '6_10': '6–10',
  '10_plus': '10+',
};

export interface ThreePuttView {
  kind: 'three_putt';
  cause: string | null;
  pathways: Array<{ pathway: string; label: string; threePutts: number; sharePct: number | null }>;
  classified: number;
  suppressed: number;
  threePutts: number;
  exposure: Array<{ band: string; label: string; missed: number; recorded: number; missing: number; buckets: Record<LeaveBucketKey, number> }>;
  receipts: AngleReceiptsView;
}

export interface MissSideView {
  side: string;
  /** Tee: tee shots on that side; approach: missed greens on that side. */
  n: number;
  costed: number;
  /** Strokes vs the reference (tee: own fairway holes; approach: expected). */
  cost: number | null;
  /** Approach only: up-and-down in 2 or fewer, %. */
  upDownPct: number | null;
}

export interface TeeMissView {
  kind: 'tee_miss';
  sides: MissSideView[];
  worse: string | null;
  coverage: { recorded: number; missed: number; pct: number | null };
  clubChain: Array<{ par: number; club: 'driver' | 'non_driver'; teeShots: number; fairwayPct: number | null; toPar: number | null }>;
  biasNote: string | null;
  receipts: AngleReceiptsView;
}

export interface ApproachMissView {
  kind: 'approach_miss';
  axis: 'depth' | 'line' | null;
  worse: string | null;
  sides: Record<'short' | 'long' | 'left' | 'right', MissSideView>;
  coverage: { recorded: number; missed: number; pct: number | null };
  receipts: AngleReceiptsView;
}

export type AngleWhyView = LieApproachView | BadDayFloorView | ThreePuttView | TeeMissView | ApproachMissView;

/** The metric id each angle view is drawn for. */
export const ANGLE_METRICS: Record<string, AngleWhyView['kind']> = {
  approach_rough_lie_penalty: 'lie_approach',
  tee_fairway_rough_exposure: 'lie_approach',
  round_bad_day_floor: 'bad_day_floor',
  three_putt_chain: 'three_putt',
  tee_miss_next_shot_cost: 'tee_miss',
  approach_miss_recovery_cost: 'approach_miss',
};

const ANGLE_TAG: Record<AngleWhyView['kind'], string> = {
  lie_approach: 'lie_adjusted_approach',
  bad_day_floor: 'bad_day_floor',
  three_putt: 'three_putt_autopsy',
  tee_miss: 'miss_cost_compass',
  approach_miss: 'approach_miss_compass',
};

function lieCell(v: unknown): LieCellView | null {
  const o = obj(v);
  if (!o) return null;
  return { n: int(o.n), girPct: num(o.gir_pct), proximityFt: num(o.proximity_ft) };
}

function parseLie(d: Json): LieApproachView | null {
  const bands: LieApproachView['bands'] = [];
  for (const b of arr(d.bands)) {
    const o = obj(b);
    const fairway = lieCell(o?.fairway);
    const rough = lieCell(o?.rough);
    if (!o || !fairway || !rough) continue;
    bands.push({ band: str(o.band) ?? '', label: str(o.label) ?? str(o.band) ?? '', qualifies: o.qualifies === true, fairway, rough });
  }
  if (bands.length === 0) return null;
  const cause = d.cause === 'rough_execution' || d.cause === 'fairway_exposure' ? d.cause : null;
  return {
    kind: 'lie_approach',
    cause,
    bands,
    fairwayPct: num(d.fairway_pct),
    peerFairwayPct: num(d.peer_fairway_pct),
    peerN: int(d.peer_n),
    fairwayHoles: int(d.fairway_holes),
    roughAllPer18: num(d.rough_all_per_18),
    receipts: receiptsOf(d.receipts),
  };
}

function parseFloor(d: Json): BadDayFloorView | null {
  const median = num(d.median);
  const p80 = num(d.p80);
  const badMean = num(d.bad_mean);
  const middleMean = num(d.middle_mean);
  const split = obj(d.split);
  if (median === null || p80 === null || badMean === null || middleMean === null || !split) return null;
  const parts = { penalties: num(split.penalties), double_or_worse: num(split.double_or_worse), everything_else: num(split.everything_else) };
  if (parts.penalties === null || parts.double_or_worse === null || parts.everything_else === null) return null;
  const rounds: BadDayFloorView['rounds'] = [];
  for (const r of arr(d.rounds)) {
    const o = obj(r);
    const toPar = num(o?.to_par);
    if (!o || toPar === null) continue;
    rounds.push({ id: str(o.id) ?? String(rounds.length), date: str(o.date), toPar });
  }
  if (rounds.length === 0) return null;
  const receipts = receiptsOf(d.receipts);
  const sample = (k: string) => receipts.samples.find((s) => s.key === k)?.n ?? 0;
  return {
    kind: 'bad_day_floor',
    rounds,
    median,
    p80,
    badMean,
    middleMean,
    badRounds: sample('bad_rounds'),
    middleRounds: sample('middle_rounds'),
    split: parts as Record<FloorPartKey, number>,
    receipts,
  };
}

function parseThreePutt(d: Json): ThreePuttView | null {
  const pathways: ThreePuttView['pathways'] = [];
  for (const p of arr(d.pathways)) {
    const o = obj(p);
    if (!o || !str(o.pathway)) continue;
    pathways.push({ pathway: str(o.pathway)!, label: str(o.label) ?? str(o.pathway)!, threePutts: int(o.three_putts), sharePct: num(o.share_pct) });
  }
  if (pathways.length === 0) return null;
  const exposure: ThreePuttView['exposure'] = [];
  for (const e of arr(d.exposure)) {
    const o = obj(e);
    const b = obj(o?.buckets);
    if (!o || !b) continue;
    exposure.push({
      band: str(o.band) ?? '',
      label: str(o.label) ?? str(o.band) ?? '',
      missed: int(o.first_putt_missed),
      recorded: int(o.leave_recorded),
      missing: int(o.leave_missing),
      buckets: { lt3: int(b.lt3), '3_6': int(b['3_6']), '6_10': int(b['6_10']), '10_plus': int(b['10_plus']) },
    });
  }
  return {
    kind: 'three_putt',
    cause: str(d.cause),
    pathways,
    classified: int(d.classified),
    suppressed: int(d.pathway_suppressed),
    threePutts: int(d.three_putts),
    exposure,
    receipts: receiptsOf(d.receipts),
  };
}

function coverageOf(v: unknown): { recorded: number; missed: number; pct: number | null } {
  const o = obj(v) ?? {};
  return { recorded: int(o.side_recorded ?? o.recorded), missed: int(o.missed), pct: num(o.pct) };
}

function parseTeeMiss(d: Json): TeeMissView | null {
  const sides: MissSideView[] = [];
  for (const s of arr(d.compass)) {
    const o = obj(s);
    const side = str(o?.side);
    if (!o || !side) continue;
    sides.push({ side, n: int(o.shots), costed: int(o.costed), cost: num(o.cost_vs_fairway), upDownPct: null });
  }
  if (!sides.some((s) => s.side === 'left') || !sides.some((s) => s.side === 'right')) return null;
  const clubChain: TeeMissView['clubChain'] = [];
  for (const c of arr(d.club_chain)) {
    const o = obj(c);
    const par = num(o?.par);
    if (!o || par === null || (o.club !== 'driver' && o.club !== 'non_driver')) continue;
    clubChain.push({ par, club: o.club, teeShots: int(o.tee_shots), fairwayPct: num(o.fairway_pct), toPar: num(o.to_par) });
  }
  return {
    kind: 'tee_miss',
    sides,
    worse: str(d.worse_side),
    coverage: coverageOf(d.coverage),
    clubChain,
    biasNote: str(d.selection_bias_note),
    receipts: receiptsOf(d.receipts),
  };
}

function parseApproachMiss(d: Json): ApproachMissView | null {
  const s = obj(d.sides);
  if (!s) return null;
  const side = (k: 'short' | 'long' | 'left' | 'right'): MissSideView | null => {
    const o = obj(s[k]);
    if (!o) return null;
    return { side: k, n: int(o.misses), costed: int(o.costed), cost: num(o.recovery_cost), upDownPct: num(o.up_and_down_pct) };
  };
  const short = side('short');
  const long = side('long');
  const left = side('left');
  const right = side('right');
  if (!short || !long || !left || !right) return null;
  return {
    kind: 'approach_miss',
    axis: d.axis === 'depth' || d.axis === 'line' ? d.axis : null,
    worse: str(d.worse_side),
    sides: { short, long, left, right },
    coverage: coverageOf(d.coverage),
    receipts: receiptsOf(d.receipts),
  };
}

/**
 * The angle view for an insight's evidence, or null (unknown metric, a row
 * without the angle tag, or a shape this module does not recognise).
 */
export function angleWhyOf(evidence: unknown): AngleWhyView | null {
  const ev = obj(evidence);
  const metric = str(ev?.metric);
  if (!ev || !metric) return null;
  const kind = ANGLE_METRICS[metric];
  const d = obj(ev.detail);
  if (!kind || !d || d.angle !== ANGLE_TAG[kind]) return null;
  switch (kind) {
    case 'lie_approach':
      return parseLie(d);
    case 'bad_day_floor':
      return parseFloor(d);
    case 'three_putt':
      return parseThreePutt(d);
    case 'tee_miss':
      return parseTeeMiss(d);
    case 'approach_miss':
      return parseApproachMiss(d);
    default:
      return null;
  }
}

/** Round route for an example hole; null for an id that is not a UUID. */
export function exampleHref(roundId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roundId)
    ? `/golf/dashboard/rounds/${roundId}`
    : null;
}
