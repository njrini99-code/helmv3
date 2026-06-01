/**
 * ============================================================================
 * CoachHelm v3 · THEMES — shot-level ROOT DRIVERS (read-time, PURE)
 * ----------------------------------------------------------------------------
 * PLAY C. Turns generic standalone causes into specific, coachable drivers
 * ("your 150-175yd misses land short-right, 60% into rough") using shot-level
 * detail the stats pipeline already FETCHES (`putt_details`, `approach_miss_details`)
 * but drops unused.
 *
 * `buildShotDrivers(shots)` is a PURE, deterministic transform: raw shot rows →
 * compact, HONEST `RootDriver[]` per `InsightCategory` (source: 'shot_detail').
 * NO IO, NO Date.now / Math.random — unit-testable. The delivery layer fetches
 * the rows; this file only shapes them. The assembler attaches the result to the
 * most-relevant cause per category (see `assemble.ts`).
 *
 * Honesty rules:
 *   - A driver is emitted ONLY when its band/group clears a MIN-SAMPLE guard
 *     (≥ {@link MIN_BAND_SAMPLE} shots). A thin band yields NO driver — we omit
 *     rather than guess.
 *   - A tendency is reported ONLY when it actually dominates (a single
 *     lie/side/direction clears a share threshold). A balanced distribution
 *     yields no driver, never a coin-flip "tendency".
 *   - Percentages quoted in prose are the REAL observed shares for the cited n.
 *   - No fabricated stroke numbers — `drills: []`, this is a diagnostic shot
 *     pattern. The cause it attaches to already carries the stroke math.
 *
 * Reuses the bucketization vocabulary from
 * `src/lib/coachhelm/v2/mining/approach-analytics.ts` (distance bands, lie
 * normalization, horizontal axis) without taking a dependency on its IO path.
 * ========================================================================== */

import type { InsightCategory } from '@/lib/coachhelm/v2/insights/types';
import type { RootDriver } from '@/lib/coachhelm/v3/themes/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Raw shot input — the subset of `golf_shots` (+ joined detail) columns this
 * transform reads. Every field is optional/nullable: the source rows come
 * straight from Supabase and may be partial. We never assume a column exists.
 *
 * `putt_details` / `approach_miss_details` are 1:1 joins; PostgREST returns
 * them as either an object or a single-element array, so we accept both.
 * ────────────────────────────────────────────────────────────────────────── */

interface PuttDetailLike {
  miss_tags?: string[] | null;
  break_direction?: string | null;
}

interface ApproachMissDetailLike {
  miss_direction?: string | null;
  lie_type?: string | null;
  distance_from_green_yards?: number | null;
}

export interface ShotDriverInput {
  shot_type?: string | null;
  club_type?: string | null;
  /** approach starting distance to the pin (yards) — the band source. */
  distance_to_hole_before?: number | null;
  distance_unit_before?: string | null;
  /** tee-shot landing surface (fairway / rough / sand / other). */
  result?: string | null;
  /** tee-shot horizontal miss side (left / right / ...). */
  miss_direction?: string | null;
  putt_details?: PuttDetailLike | PuttDetailLike[] | null;
  approach_miss_details?: ApproachMissDetailLike | ApproachMissDetailLike[] | null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Tunables — honesty guards. Deliberately conservative.
 * ────────────────────────────────────────────────────────────────────────── */

/** Minimum shots in a band/group before ANY driver is emitted from it. */
const MIN_BAND_SAMPLE = 8;
/** A lie/side/break only "dominates" when its share clears this. */
const DOMINANT_SHARE = 0.5;
/** A directional (left/right) miss skew only reports past this share. */
const DIRECTION_SHARE = 0.6;

/* ───────────────────────────────────────────────────────────────────────────
 * Shared helpers (mirrors approach-analytics vocabulary, IO-free).
 * ────────────────────────────────────────────────────────────────────────── */

type DistanceBand = '<150' | '150_175' | '175_200' | '200+';
const APPROACH_BAND_ORDER: readonly DistanceBand[] = ['<150', '150_175', '175_200', '200+'];
const APPROACH_BAND_LABEL: Record<DistanceBand, string> = {
  '<150': 'under 150 yds',
  '150_175': '150-175 yds',
  '175_200': '175-200 yds',
  '200+': '200+ yds',
};

function approachBandFor(distance: number | null): DistanceBand | null {
  if (distance === null || !Number.isFinite(distance) || distance <= 0) return null;
  if (distance > 250) return null; // not an approach
  if (distance < 150) return '<150';
  if (distance < 175) return '150_175';
  if (distance < 200) return '175_200';
  return '200+';
}

type LieType = 'fairway' | 'rough' | 'bunker' | 'hazard';
const LIE_LABEL: Record<LieType, string> = {
  fairway: 'the fairway',
  rough: 'the rough',
  bunker: 'a bunker',
  hazard: 'a hazard',
};

/** Collapse sand→bunker, water→hazard; non-canonical → null (ignored). */
function normalizeLie(raw: string | null | undefined): LieType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'fairway') return 'fairway';
  if (v === 'rough') return 'rough';
  if (v === 'bunker' || v === 'sand') return 'bunker';
  if (v === 'hazard' || v === 'water') return 'hazard';
  return null;
}

/** left/right only — long/short alone carry no horizontal info. */
function horizontalAxis(raw: string | null | undefined): 'left' | 'right' | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.endsWith('left')) return 'left';
  if (v.endsWith('right')) return 'right';
  return null;
}

/** Full short/long ⊗ left/right read for the approach prose (8-value enum). */
function describeApproachMiss(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  const map: Record<string, string> = {
    short: 'short',
    long: 'long',
    left: 'left',
    right: 'right',
    short_left: 'short-left',
    short_right: 'short-right',
    long_left: 'long-left',
    long_right: 'long-right',
  };
  return map[v] ?? null;
}

function unwrapDetail<T>(d: T | T[] | null | undefined): T | null {
  if (d == null) return null;
  if (Array.isArray(d)) return d.length > 0 ? (d[0] ?? null) : null;
  return d;
}

/** approach distance normalized to yards (the join carries feet for putts only,
 *  but approaches may still arrive in feet on legacy rows). */
function approachDistanceYards(row: ShotDriverInput): number | null {
  const raw = row.distance_to_hole_before;
  if (raw == null || !Number.isFinite(raw)) return null;
  return row.distance_unit_before === 'feet' ? raw / 3 : raw;
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

/** Pick the single most-frequent key; ties broken by a stable key order so the
 *  output is deterministic. Returns null on an empty map. */
function dominantKey<K extends string>(
  counts: Record<K, number>,
  order: readonly K[],
): { key: K; count: number } | null {
  let best: { key: K; count: number } | null = null;
  for (const key of order) {
    const count = counts[key];
    if (count > 0 && (best === null || count > best.count)) {
      best = { key, count };
    }
  }
  return best;
}

/* ───────────────────────────────────────────────────────────────────────────
 * APPROACH — dominant miss tendency by distance band.
 * ────────────────────────────────────────────────────────────────────────── */

function buildApproachDriver(shots: readonly ShotDriverInput[]): RootDriver | null {
  // Bucket approach misses by starting distance band. We only see rows that
  // actually carry approach_miss_details (the join is null for non-misses), so
  // a present detail row already means a missed green.
  interface BandAgg {
    n: number;
    lieCounts: Record<LieType, number>;
    dirCounts: Record<string, number>;
  }
  const bands = new Map<DistanceBand, BandAgg>();

  for (const shot of shots) {
    const detail = unwrapDetail(shot.approach_miss_details);
    if (!detail) continue;
    const band = approachBandFor(approachDistanceYards(shot));
    if (!band) continue;

    const agg = bands.get(band) ?? {
      n: 0,
      lieCounts: { fairway: 0, rough: 0, bunker: 0, hazard: 0 },
      dirCounts: {},
    };
    agg.n += 1;

    const lie = normalizeLie(detail.lie_type);
    if (lie) agg.lieCounts[lie] += 1;

    const dir = describeApproachMiss(detail.miss_direction);
    if (dir) agg.dirCounts[dir] = (agg.dirCounts[dir] ?? 0) + 1;

    bands.set(band, agg);
  }

  // Choose the band with the most qualifying misses (deterministic order),
  // requiring the min sample. We surface ONE band — the dominant pattern.
  let chosen: { band: DistanceBand; agg: BandAgg } | null = null;
  for (const band of APPROACH_BAND_ORDER) {
    const agg = bands.get(band);
    if (!agg || agg.n < MIN_BAND_SAMPLE) continue;
    if (chosen === null || agg.n > chosen.agg.n) chosen = { band, agg };
  }
  if (!chosen) return null;

  const { band, agg } = chosen;

  // Dominant miss direction (full 8-value read) and dominant landing lie.
  const dirOrder = Object.keys(agg.dirCounts).sort(); // deterministic
  const domDir = dominantKey(agg.dirCounts, dirOrder);
  const domLie = dominantKey(agg.lieCounts, ['fairway', 'rough', 'bunker', 'hazard']);

  // Build prose from whichever signal actually dominates. Require at least one
  // dominant signal — otherwise the band is balanced and there's nothing honest
  // to say.
  const parts: string[] = [];
  const dirShare = domDir ? domDir.count / agg.n : 0;
  const lieShare = domLie ? domLie.count / agg.n : 0;

  if (domDir && dirShare >= DOMINANT_SHARE) {
    parts.push(`miss ${domDir.key} ${pct(domDir.count, agg.n)}% of the time`);
  }
  if (domLie && lieShare >= DOMINANT_SHARE) {
    parts.push(`land in ${LIE_LABEL[domLie.key]} ${pct(domLie.count, agg.n)}% of the time`);
  }
  if (parts.length === 0) return null;

  const prose =
    `From ${APPROACH_BAND_LABEL[band]}, your missed greens (${agg.n} shots) ` +
    `${parts.join(' and ')}. A balanced miss pattern would spread evenly — ` +
    `this is a repeatable shape worth working from that range.`;

  return {
    source: 'shot_detail',
    source_insight_ids: [],
    title: `${APPROACH_BAND_LABEL[band]}: dominant miss shape`,
    prose,
    drills: [],
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * PUTTING — dominant miss tendency, split by break direction.
 * ────────────────────────────────────────────────────────────────────────── */

type BreakDir = 'left_to_right' | 'right_to_left' | 'straight';
const BREAK_LABEL: Record<BreakDir, string> = {
  left_to_right: 'left-to-right',
  right_to_left: 'right-to-left',
  straight: 'straight',
};

function normalizeBreak(raw: string | null | undefined): BreakDir | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'left_to_right') return 'left_to_right';
  if (v === 'right_to_left') return 'right_to_left';
  if (v === 'straight') return 'straight';
  return null; // 'multiple' or unknown → ignored (no clean read)
}

type PuttMissTag = 'low' | 'high' | 'short' | 'long';
const PUTT_TAG_ORDER: readonly PuttMissTag[] = ['low', 'high', 'short', 'long'];
const PUTT_TAG_LABEL: Record<PuttMissTag, string> = {
  low: 'low (under-read the break)',
  high: 'high (over-read the break)',
  short: 'short',
  long: 'long',
};

function normalizePuttTag(raw: string): PuttMissTag | null {
  const v = raw.toLowerCase();
  if (v === 'low' || v === 'high' || v === 'short' || v === 'long') return v;
  return null;
}

function buildPuttingDriver(shots: readonly ShotDriverInput[]): RootDriver | null {
  // Group missed putts by break direction; count the miss tags within each.
  interface BreakAgg {
    n: number; // missed putts in this break group (with ≥1 usable tag)
    tagCounts: Record<PuttMissTag, number>;
  }
  const groups = new Map<BreakDir, BreakAgg>();

  for (const shot of shots) {
    const detail = unwrapDetail(shot.putt_details);
    if (!detail) continue;
    const tags = detail.miss_tags;
    if (!Array.isArray(tags) || tags.length === 0) continue; // made putt or untagged
    const brk = normalizeBreak(detail.break_direction);
    if (!brk) continue;

    const normTags = tags
      .map(normalizePuttTag)
      .filter((t): t is PuttMissTag => t !== null);
    if (normTags.length === 0) continue;

    const agg = groups.get(brk) ?? { n: 0, tagCounts: { low: 0, high: 0, short: 0, long: 0 } };
    agg.n += 1;
    for (const t of normTags) agg.tagCounts[t] += 1;
    groups.set(brk, agg);
  }

  // Surface the break group with the most qualifying misses, min-sample gated.
  const BREAK_ORDER: readonly BreakDir[] = ['left_to_right', 'right_to_left', 'straight'];
  let chosen: { brk: BreakDir; agg: BreakAgg } | null = null;
  for (const brk of BREAK_ORDER) {
    const agg = groups.get(brk);
    if (!agg || agg.n < MIN_BAND_SAMPLE) continue;
    if (chosen === null || agg.n > chosen.agg.n) chosen = { brk, agg };
  }
  if (!chosen) return null;

  const { brk, agg } = chosen;
  const domTag = dominantKey(agg.tagCounts, PUTT_TAG_ORDER);
  if (!domTag) return null;
  const share = domTag.count / agg.n;
  if (share < DOMINANT_SHARE) return null; // no dominant tag → balanced, omit

  const prose =
    `On ${BREAK_LABEL[brk]} putts you missed (${agg.n} putts), ` +
    `${pct(domTag.count, agg.n)}% missed ${PUTT_TAG_LABEL[domTag.key]}. ` +
    `A consistent miss in one direction on a known break points to a read or ` +
    `speed adjustment rather than stroke mechanics.`;

  return {
    source: 'shot_detail',
    source_insight_ids: [],
    title: `${BREAK_LABEL[brk]} putts: dominant miss`,
    drills: [],
    prose,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * TEE — driver dispersion: dominant miss side + off-fairway rate.
 * ────────────────────────────────────────────────────────────────────────── */

function buildTeeDriver(shots: readonly ShotDriverInput[]): RootDriver | null {
  // Only driver tee shots — the dispersion question is club-specific. We count
  // off-fairway results and the horizontal miss side among those misses.
  let n = 0;
  let offFairway = 0;
  let left = 0;
  let right = 0;

  for (const shot of shots) {
    if (shot.shot_type !== 'tee') continue;
    if (shot.club_type !== 'driver') continue;
    const result = (shot.result ?? '').toLowerCase();
    if (!result) continue;
    n += 1;
    // 'fairway' (and the rare holed/green) is in-play; everything else is a miss.
    const inPlay = result === 'fairway' || result === 'green' || result === 'hole';
    if (!inPlay) {
      offFairway += 1;
      const axis = horizontalAxis(shot.miss_direction);
      if (axis === 'left') left += 1;
      else if (axis === 'right') right += 1;
    }
  }

  if (n < MIN_BAND_SAMPLE) return null;
  // Need a meaningful number of actual misses to talk about a side bias.
  if (offFairway < MIN_BAND_SAMPLE) return null;

  const directional = left + right;
  const domSide: 'left' | 'right' | null =
    directional > 0 && left / directional >= DIRECTION_SHARE
      ? 'left'
      : directional > 0 && right / directional >= DIRECTION_SHARE
        ? 'right'
        : null;

  // The off-fairway rate is always honest to report once n clears the guard.
  const offRate = pct(offFairway, n);
  let prose =
    `Off the tee with driver (${n} drives), you miss the fairway ${offRate}% of the time`;
  if (domSide) {
    const sideCount = domSide === 'left' ? left : right;
    prose += `, and ${pct(sideCount, directional)}% of those misses leak ${domSide}`;
  }
  prose +=
    `. A one-sided driver miss is a tee-strategy and start-line lever — favor the ` +
    `side that takes the big miss out of play.`;

  return {
    source: 'shot_detail',
    source_insight_ids: [],
    title: domSide ? `Driver: misses leak ${domSide}` : 'Driver: off-fairway rate',
    drills: [],
    prose,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Public entry — PURE, deterministic.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Build shot-level root drivers per category from already-fetched raw shot rows.
 * Returns only the categories that cleared the honesty guards; a category with
 * insufficient or balanced data is OMITTED (no driver rather than a guess).
 *
 * PURE: no IO, no Date.now / Math.random. Never throws — a malformed/partial
 * row is skipped, an empty input yields `{}`.
 */
export function buildShotDrivers(
  shots: readonly ShotDriverInput[] | null | undefined,
): Partial<Record<InsightCategory, RootDriver[]>> {
  const out: Partial<Record<InsightCategory, RootDriver[]>> = {};
  if (!Array.isArray(shots) || shots.length === 0) return out;

  const approach = buildApproachDriver(shots);
  if (approach) out.approach = [approach];

  const putting = buildPuttingDriver(shots);
  if (putting) out.putting = [putting];

  const tee = buildTeeDriver(shots);
  if (tee) out.tee = [tee];

  return out;
}
