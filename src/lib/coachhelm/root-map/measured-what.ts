/**
 * ============================================================================
 * Root map: the MEASURED What row (every lost stroke gets a spot)
 * ----------------------------------------------------------------------------
 * Owner decision 2026-09-25: the What row under each losing area is built
 * straight from recorded shots, not from whichever stored insights happen to
 * carry a counterfactual. Each area's strokes gained is split into sub-areas
 * by shot-level SG:
 *
 *   Off the tee        driver / other tee shots / penalties
 *   Approach           50–125 / 125–175 / 175+ yd (with a fairway / rough /
 *                      tee-box split inside a band when each part clears the
 *                      sample gate), inside 50 yd, penalties
 *   Around the green   from sand / rough / tight lies, penalties
 *   Putting            by first-putt distance: 0–3, 3–5, 5–10, 10–15,
 *                      15–25, 25+ ft (the stats writer's bands, half-open,
 *                      `putt_make_pct_by_distance_writer.sql`), so the
 *                      putts_made_* insights attach one-to-one
 *
 * Shot SG is {@link shotSgForRound}, the line-for-line port of the DB's
 * `calculate_round_strokes_gained` (see `approach-context.ts`). EVERY shot the
 * port keeps gets a key (thin keys merge into "Other"), so the sub-areas add
 * up exactly to the recomputed area SG. That total is then checked against
 * the stored area SG the Where row prints (countable rounds, per 18, the same
 * rounds), with the same {@link BAND_SG_RECONCILE_TOLERANCE}:
 *
 *   measured  |recomputed − stored| ≤ tolerance: values are printed as
 *             measured; the small residual is "Not tracked by shot".
 *   share     outside tolerance but the shot-level total covers between half
 *             and double the stored loss: each sub-area is its share of the
 *             STORED total (scaled by stored / recomputed) and the note says
 *             so.
 *   none      anything else (no shots, a thin shot total, a different round
 *             window): the area keeps the stored-insight What row.
 *
 * PURE: no Supabase, no React. Plain JSON out; client components import
 * types only.
 * ========================================================================== */

import {
  BAND_SG_RECONCILE_TOLERANCE,
  sgNormalizeLie,
  shotSgForRound,
  type RawHoleRow,
  type RawShotRow,
} from './approach-context';
import { ROOT_AREAS, formatStrokes, type RootArea } from './build-root-map';

/* ─────────────────────────────────────────────────────────────────────────
 * Keys
 * ──────────────────────────────────────────────────────────────────────── */

export const OTHER_KEY = 'other';

/** Sub-area keys per area, in display order. */
export const MEASURED_KEYS: Record<RootArea, readonly string[]> = {
  tee: ['driver', 'non_driver', 'penalty'],
  approach: ['50_125', '125_175', '175_plus', 'inside_50', 'penalty'],
  short_game: ['sand', 'rough', 'tight', 'penalty'],
  putting: ['0_3', '3_5', '5_10', '10_15', '15_25', '25_plus'],
};

const KEY_LABEL: Record<RootArea, Record<string, string>> = {
  tee: { driver: 'Driver', non_driver: 'Other tee clubs', penalty: 'Tee penalties' },
  approach: {
    '50_125': '50–125 yd',
    '125_175': '125–175 yd',
    '175_plus': '175+ yd',
    inside_50: 'Inside 50 yd',
    penalty: 'Approach penalties',
  },
  short_game: { sand: 'From sand', rough: 'From rough', tight: 'Tight lies', penalty: 'Greenside penalties' },
  putting: {
    '0_3': '0–3 ft putts',
    '3_5': '3–5 ft putts',
    '5_10': '5–10 ft putts',
    '10_15': '10–15 ft putts',
    '15_25': '15–25 ft putts',
    '25_plus': '25+ ft putts',
  },
};

const KEY_TITLE: Record<RootArea, (label: string, key: string) => string> = {
  tee: (_l, k) => (k === 'penalty' ? 'Penalty strokes off the tee' : k === 'driver' ? 'Tee shots with driver' : 'Tee shots with other clubs'),
  approach: (l, k) => (k === 'penalty' ? 'Penalty strokes on approach' : `Approach shots from ${l}`),
  short_game: (l, k) => (k === 'penalty' ? 'Penalty strokes around the green' : `Around the green, ${l.toLowerCase()}`),
  putting: (l) => `Holes where the first putt was ${l.replace(' putts', '')}`,
};

export function measuredLabel(area: RootArea, key: string): string {
  if (key === OTHER_KEY) return area === 'putting' ? 'Other putts' : 'Other';
  return KEY_LABEL[area][key] ?? key;
}

export function measuredTitle(area: RootArea, key: string): string {
  if (key === OTHER_KEY) return 'Smaller or thinly sampled spots, together';
  return KEY_TITLE[area](measuredLabel(area, key), key);
}

/** Stable node id for a sub-area. */
export function measuredId(area: RootArea, key: string): string {
  return `measured:${area}:${key}`;
}

/** Which sub-area a stored insight metric reads, or null (→ Other reads). */
export function subKeyForMetric(area: RootArea, metric: unknown): string | null {
  if (typeof metric !== 'string') return null;
  if (area === 'approach') {
    const m = /^approach_proximity_(50_125|125_175|175_plus)_?ft$/.exec(metric);
    return m?.[1] ?? null;
  }
  if (area === 'putting') {
    const m = /^putts_made_(\d+_\d+|25_plus)_?ft_pct$/.exec(metric);
    return m?.[1] && MEASURED_KEYS.putting.includes(m[1]) ? m[1] : null;
  }
  if (area === 'short_game') {
    if (metric === 'scrambling_pct_sand') return 'sand';
    if (metric === 'scrambling_pct_rough') return 'rough';
    if (metric === 'scrambling_pct_fairway') return 'tight';
    return null;
  }
  if (area === 'tee') {
    if (/driver/.test(metric)) return 'driver';
    if (/penalt/.test(metric)) return 'penalty';
    return null;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Shot → key
 * ──────────────────────────────────────────────────────────────────────── */

const AREA_OF_CATEGORY = {
  off_tee: 'tee',
  approach: 'approach',
  around_green: 'short_game',
  putting: 'putting',
} as const satisfies Record<string, RootArea>;

function feetOf(d: number | null, unit: string | null): number | null {
  if (d === null || !Number.isFinite(Number(d))) return null;
  return unit === 'feet' ? Number(d) : Number(d) * 3;
}

/** Half-open [lo, hi) like the stats writer. */
export function puttKey(feet: number): string {
  if (feet < 3) return '0_3';
  if (feet < 5) return '3_5';
  if (feet < 10) return '5_10';
  if (feet < 15) return '10_15';
  if (feet < 25) return '15_25';
  return '25_plus';
}

type ApproachLie = 'fairway' | 'rough' | 'tee' | 'other';

function approachLie(lie: string | null): ApproachLie {
  const n = sgNormalizeLie(lie);
  if (n === 'fairway' && (lie ?? '').toLowerCase() !== 'fairway') return 'other';
  return n === 'fairway' || n === 'rough' || n === 'tee' ? n : 'other';
}

/* ─────────────────────────────────────────────────────────────────────────
 * Per-player split
 * ──────────────────────────────────────────────────────────────────────── */

export interface MeasuredRoundInput {
  id: string;
  holesPlayed: number;
}

/** One sub-area key's raw measurement, mean per round (per 18). */
export interface MeasuredKeyValue {
  key: string;
  /** Mean SG per round (per 18) from this key; negative = strokes lost.
   *  In `share` mode already scaled to the stored total. */
  sg: number;
  /** Events: shots (tee, approach, around the green, penalty strokes) or
   *  holes (putting: one first putt per hole). */
  n: number;
  /** Rounds with at least one event. */
  rounds: number;
  /** Approach bands only: the same split by the lie the shot was hit from. */
  lies?: Partial<Record<ApproachLie, { sg: number; n: number; rounds: number }>>;
}

export type MeasuredMode = 'measured' | 'share' | 'none';

export interface MeasuredArea {
  area: RootArea;
  mode: MeasuredMode;
  rounds: number;
  /** The Where row's stored area SG per round. */
  stored: number;
  /** Σ shot-level SG per round (before any scaling). */
  recomputed: number;
  /** stored / recomputed in `share` mode, else 1. */
  scale: number;
  keys: MeasuredKeyValue[];
  /** Why the area is `none`, when it is. */
  reason: string | null;
}

export type MeasuredWhat = Partial<Record<RootArea, MeasuredArea>>;

/** Smallest sample a sub-area needs to stand on its own (else → Other). */
export const MEASURED_MIN_EVENTS = 10;
export const MEASURED_MIN_ROUNDS = 3;
/** A losing spot smaller than this prints as 0.00: it folds into Other. */
export const MEASURED_MIN_LOSS = 0.005;
/** `share` mode: the shot-level total must cover this much of the stored
 *  total, and at most its inverse, to be spread over it. */
export const MEASURED_SHARE_MIN_COVERAGE = 0.5;

interface Acc {
  sg: number;
  n: number;
  roundIds: Set<string>;
  lies: Map<ApproachLie, { sg: number; n: number; roundIds: Set<string> }>;
}

function acc(): Acc {
  return { sg: 0, n: 0, roundIds: new Set(), lies: new Map() };
}

/**
 * The measured split for one player.
 *
 * `whereSg` / `whereRounds`: the Where row's per-area SG and its round count
 * (`loadPlayersAreaSg`). The split is only trusted when it read exactly that
 * many rounds; otherwise every area is `none` (a different window must not
 * be reconciled against the Where row).
 */
export function measureWhat(input: {
  rounds: readonly MeasuredRoundInput[];
  shots: readonly RawShotRow[];
  holes: readonly RawHoleRow[];
  scale: number;
  whereSg: Partial<Record<RootArea, number | null>>;
  whereRounds: number | null;
}): MeasuredWhat {
  const rounds = input.rounds.filter((r) => r.holesPlayed > 0);
  const out: MeasuredWhat = {};
  const windowOk = rounds.length > 0 && input.whereRounds === rounds.length;

  const parByHoleId = new Map<string, number>();
  for (const h of input.holes) if (typeof h.par === 'number') parByHoleId.set(h.id, h.par);
  const shotsByRound = new Map<string, RawShotRow[]>();
  const shotById = new Map<string, RawShotRow>();
  for (const s of input.shots) {
    shotById.set(s.id, s);
    const arr = shotsByRound.get(s.round_id) ?? [];
    arr.push(s);
    shotsByRound.set(s.round_id, arr);
  }

  const sums: Record<RootArea, Map<string, Acc>> = {
    tee: new Map(),
    approach: new Map(),
    short_game: new Map(),
    putting: new Map(),
  };
  const bump = (area: RootArea, key: string, sg: number, roundId: string, events: number, lie?: ApproachLie) => {
    const m = sums[area];
    const a = m.get(key) ?? acc();
    a.sg += sg;
    a.n += events;
    if (events > 0) a.roundIds.add(roundId);
    if (lie) {
      const l = a.lies.get(lie) ?? { sg: 0, n: 0, roundIds: new Set<string>() };
      l.sg += sg;
      l.n += events;
      if (events > 0) l.roundIds.add(roundId);
      a.lies.set(lie, l);
    }
    m.set(key, a);
  };

  if (windowOk) {
    for (const r of rounds) {
      const k18 = 18 / r.holesPlayed;
      const list = shotsByRound.get(r.id) ?? [];
      const sgs = shotSgForRound(list, parByHoleId, input.scale);
      // Putting: every putt on a hole files under that hole's FIRST putt.
      const firstPutt = new Map<string, RawShotRow>();
      for (const s of list) {
        if (s.shot_type !== 'putting' || !s.hole_id) continue;
        const held = firstPutt.get(s.hole_id);
        if (!held || s.shot_number < held.shot_number) firstPutt.set(s.hole_id, s);
      }
      const puttHolesCounted = new Set<string>();
      for (const x of sgs) {
        const s = shotById.get(x.shotId);
        if (!s) continue;
        const area = AREA_OF_CATEGORY[x.category];
        const sg = x.sg * k18;
        const pen = s.is_penalty === true;
        if (area === 'putting') {
          const fp = s.hole_id ? firstPutt.get(s.hole_id) : undefined;
          const feet = fp ? fp.putt_distance_feet ?? feetOf(fp.distance_to_hole_before, fp.distance_unit_before) : null;
          const key = feet !== null && feet !== undefined && Number.isFinite(feet) ? puttKey(Number(feet)) : OTHER_KEY;
          const holeKey = s.hole_id ?? s.id;
          const first = !puttHolesCounted.has(holeKey);
          puttHolesCounted.add(holeKey);
          bump('putting', key, sg, r.id, first ? 1 : 0);
        } else if (area === 'tee') {
          bump('tee', pen ? 'penalty' : s.club_type === 'driver' ? 'driver' : 'non_driver', sg, r.id, 1);
        } else if (area === 'approach') {
          const key =
            x.key === 'penalty'
              ? 'penalty'
              : x.key === 'inside_50'
                ? 'inside_50'
                : x.key === '50_125ft'
                  ? '50_125'
                  : x.key === '125_175ft'
                    ? '125_175'
                    : x.key === '175_plus_ft'
                      ? '175_plus'
                      : OTHER_KEY;
          const withLie = key === '50_125' || key === '125_175' || key === '175_plus';
          bump('approach', key, sg, r.id, 1, withLie ? approachLie(s.lie_before) : undefined);
        } else {
          const lie = sgNormalizeLie(s.lie_before);
          bump('short_game', pen ? 'penalty' : lie === 'sand' ? 'sand' : lie === 'rough' ? 'rough' : 'tight', sg, r.id, 1);
        }
      }
    }
  }

  for (const area of ROOT_AREAS) {
    const where = input.whereSg[area];
    if (typeof where !== 'number' || !Number.isFinite(where)) continue;
    const n = rounds.length;
    const m = sums[area];
    const recomputed = n > 0 ? [...m.values()].reduce((t, a) => t + a.sg, 0) / n : 0;
    const totalEvents = [...m.values()].reduce((t, a) => t + a.n, 0);
    let mode: MeasuredMode = 'none';
    let reason: string | null = null;
    if (!windowOk) reason = 'The shot read did not cover the same rounds as the strokes-gained total.';
    else if (totalEvents === 0) reason = 'No recorded shots in this area.';
    else if (Math.abs(recomputed - where) <= BAND_SG_RECONCILE_TOLERANCE) mode = 'measured';
    else {
      const ratio = where !== 0 ? recomputed / where : 0;
      if (ratio >= MEASURED_SHARE_MIN_COVERAGE && ratio <= 1 / MEASURED_SHARE_MIN_COVERAGE) mode = 'share';
      else reason = `The shot-level split (${formatStrokes(recomputed, { signed: true })}) does not match the stored ${formatStrokes(where, { signed: true })} a round.`;
    }
    const k = mode === 'share' && recomputed !== 0 ? where / recomputed : 1;
    const order = [...MEASURED_KEYS[area], OTHER_KEY];
    const keys: MeasuredKeyValue[] = [];
    for (const key of order) {
      const a = m.get(key);
      if (!a) continue;
      const v: MeasuredKeyValue = { key, sg: n > 0 ? (a.sg / n) * k : 0, n: a.n, rounds: a.roundIds.size };
      if (a.lies.size > 0) {
        v.lies = {};
        for (const [lie, l] of a.lies) v.lies[lie] = { sg: n > 0 ? (l.sg / n) * k : 0, n: l.n, rounds: l.roundIds.size };
      }
      keys.push(v);
    }
    out[area] = { area, mode, rounds: n, stored: where, recomputed, scale: k, keys, reason };
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Grouping: gate, merge, cap
 * ──────────────────────────────────────────────────────────────────────── */

export interface LieShare {
  lie: ApproachLie;
  label: string;
  sg: number;
  n: number;
}

export interface MeasuredSub {
  id: string;
  area: RootArea;
  key: string;
  label: string;
  title: string;
  /** SG per round (negative = lost). */
  sg: number;
  n: number;
  rounds: number;
  /** Keys folded into this node (Other only). */
  merged: string[];
  /** Approach band split by lie, when at least two lies clear the gate. */
  lies: LieShare[] | null;
  /** Team only: players who lose strokes here. */
  players?: number;
}

export interface MeasuredGroups {
  /** Losing sub-areas, largest loss first, at most MAX_NODES + Other. */
  losing: MeasuredSub[];
  /** Sub-areas that gain inside the losing area (offsets), largest first. */
  gaining: MeasuredSub[];
}

const LIE_LABEL: Record<ApproachLie, string> = {
  fairway: 'from the fairway',
  rough: 'from the rough',
  tee: 'from the tee (par 3s)',
  other: 'from other lies',
};

function passes(v: { n: number; rounds: number }): boolean {
  return v.n >= MEASURED_MIN_EVENTS && v.rounds >= MEASURED_MIN_ROUNDS;
}

/**
 * Gate every key on its sample, fold thin keys (and, when `maxNodes` is
 * given, losing keys past it) into Other, and split into losing nodes and gaining offsets.
 * Σ over `losing` + `gaining` equals Σ over the input keys exactly.
 */
export function groupMeasured(
  area: RootArea,
  keys: readonly MeasuredKeyValue[],
  opts: { maxNodes?: number; playersByKey?: Record<string, number> } = {},
): MeasuredGroups {
  // No cap by default: only the sample gate (and a spot too small to print)
  // folds a key into Other. Narrow nodes carry their label under the row.
  const maxNodes = opts.maxNodes ?? Number.POSITIVE_INFINITY;
  const other = { sg: 0, n: 0, rounds: 0, merged: [] as string[] };
  const fold = (v: MeasuredKeyValue) => {
    other.sg += v.sg;
    other.n += v.n;
    other.rounds = Math.max(other.rounds, v.rounds);
    if (v.key !== OTHER_KEY) other.merged.push(v.key);
  };
  const standing: MeasuredKeyValue[] = [];
  for (const v of keys) {
    if (v.key === OTHER_KEY || !passes(v) || (v.sg < 0 && v.sg > -MEASURED_MIN_LOSS)) fold(v);
    else standing.push(v);
  }
  const losingKeys = standing.filter((v) => v.sg < 0).sort((a, b) => a.sg - b.sg);
  for (const v of losingKeys.slice(maxNodes)) fold(v);
  const toSub = (v: MeasuredKeyValue): MeasuredSub => {
    let lies: LieShare[] | null = null;
    if (v.lies) {
      const ok = (Object.entries(v.lies) as Array<[ApproachLie, { sg: number; n: number; rounds: number }]>)
        .filter(([, l]) => passes(l))
        .map(([lie, l]) => ({ lie, label: LIE_LABEL[lie], sg: l.sg, n: l.n }))
        .sort((a, b) => a.sg - b.sg);
      if (ok.length >= 2) lies = ok;
    }
    return {
      id: measuredId(area, v.key),
      area,
      key: v.key,
      label: measuredLabel(area, v.key),
      title: measuredTitle(area, v.key),
      sg: v.sg,
      n: v.n,
      rounds: v.rounds,
      merged: [],
      lies,
      ...(opts.playersByKey ? { players: opts.playersByKey[v.key] ?? 0 } : {}),
    };
  };
  const losing = losingKeys.slice(0, maxNodes).map(toSub);
  const gaining = standing.filter((v) => v.sg >= 0).map(toSub);
  if (other.n > 0 || other.sg !== 0 || other.merged.length > 0) {
    const sub: MeasuredSub = {
      id: measuredId(area, OTHER_KEY),
      area,
      key: OTHER_KEY,
      label: measuredLabel(area, OTHER_KEY),
      title: measuredTitle(area, OTHER_KEY),
      sg: other.sg,
      n: other.n,
      rounds: other.rounds,
      merged: other.merged,
      lies: null,
      ...(opts.playersByKey ? { players: opts.playersByKey[OTHER_KEY] ?? 0 } : {}),
    };
    if (sub.sg < 0) losing.push(sub);
    else if (sub.sg > 0) gaining.push(sub);
  }
  gaining.sort((a, b) => b.sg - a.sg);
  return { losing, gaining };
}

/** Where a key ended up after grouping: its own node, Other, or nowhere
 *  drawn (a gaining key). */
export function nodeIdForKey(groups: MeasuredGroups, key: string): string | null {
  const own = groups.losing.find((s) => s.key === key);
  if (own) return own.id;
  const other = groups.losing.find((s) => s.key === OTHER_KEY);
  if (other && other.merged.includes(key)) return other.id;
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Team: sum the players' measured keys
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Team sub-areas for one area: Σ over players whose area is measured (or
 * share) of each key's per-round SG, divided by `denominator` (the number of
 * players the team-average area SG is taken over, so the two compare).
 * `players` counts the players LOSING strokes on that key. Players whose area
 * is `none` contribute nothing here: their part of the team loss stays "Not
 * tracked by shot".
 */
export function teamMeasuredKeys(
  area: RootArea,
  perPlayer: ReadonlyArray<MeasuredArea | undefined>,
  denominator: number,
): { keys: MeasuredKeyValue[]; playersByKey: Record<string, number>; measuredPlayers: number } {
  const acc = new Map<string, { sg: number; n: number; rounds: number; players: number }>();
  let measuredPlayers = 0;
  for (const m of perPlayer) {
    if (!m || m.mode === 'none' || m.area !== area) continue;
    measuredPlayers += 1;
    for (const v of m.keys) {
      const a = acc.get(v.key) ?? { sg: 0, n: 0, rounds: 0, players: 0 };
      a.sg += v.sg;
      a.n += v.n;
      a.rounds += v.rounds;
      if (v.sg < 0) a.players += 1;
      acc.set(v.key, a);
    }
  }
  const keys: MeasuredKeyValue[] = [];
  const playersByKey: Record<string, number> = {};
  for (const key of [...MEASURED_KEYS[area], OTHER_KEY]) {
    const a = acc.get(key);
    if (!a) continue;
    keys.push({ key, sg: denominator > 0 ? a.sg / denominator : 0, n: a.n, rounds: a.rounds });
    playersByKey[key] = a.players;
  }
  return { keys, playersByKey, measuredPlayers };
}
