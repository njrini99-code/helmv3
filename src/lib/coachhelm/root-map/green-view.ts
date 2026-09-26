/**
 * ============================================================================
 * Root map Why view: the top-down green of a player's short putts
 * ----------------------------------------------------------------------------
 * Pure: no Supabase, no React. The loader hands in recorded putts
 * (`golf_shots.putt_distance_feet`, `putt_slope`, `putt_made`); this module
 * counts them by slope and lays each one out around the hole.
 *
 * What is recorded and what is not: distance and slope are recorded on each
 * putt; the direction the putt came from is NOT. So the slope picks the
 * REGION (downhill above the hole, uphill below, level to the sides) and the
 * distance picks the radius, but the angle inside the region is a
 * deterministic pseudo-random spread seeded by the shot id. The caption says
 * so.
 *
 * Only 4-6 ft putts are counted (the same 4-6 ft band as
 * `PuttSlopeBiasGenerator`). 3 ft and closer is almost all tap-ins on level
 * ground, so mixing them in would sell a distance difference as a slope one.
 * Distances are recorded in whole feet, and 49ffe06d… has 69 level putts at
 * exactly 3 ft (63 made) against 1 downhill and 2 uphill: counting 3 ft puts
 * level at 71/81 instead of 8/12. Those putts are drawn faint inside the 3-ft
 * ring and left out of every percentage. `severe` and unrecorded slopes are
 * left out entirely.
 * ========================================================================== */

export type GreenSlope = 'downhill' | 'level' | 'uphill';

/** One recorded putt, as the loader reads it. */
export interface GreenPuttInput {
  id: string;
  feet: number;
  slope: string | null;
  made: boolean;
}

export interface GreenRegionStat {
  slope: GreenSlope;
  made: number;
  n: number;
  /** Rounded make %, null when n = 0. */
  pct: number | null;
  /** n below {@link GREEN_THIN_READ_N}: labelled a thin read, never compared. */
  thin: boolean;
}

export interface GreenPoint {
  x: number;
  y: number;
  made: boolean;
  /** Closer than GREEN_MIN_FT: drawn, not counted. */
  faint: boolean;
}

export interface GreenView {
  rounds: number;
  regions: Record<GreenSlope, GreenRegionStat>;
  points: GreenPoint[];
}

/** Counted band, feet (inclusive both ends). Closer putts are drawn faint. */
export const GREEN_MIN_FT = 4;
export const GREEN_MAX_FT = 6;
/** The inner ring: everything inside it is faint (not counted). */
export const GREEN_INNER_RING_FT = 3;
/** Show the green only with this many counted putts downhill AND level. */
export const GREEN_MIN_PER_SLOPE = 10;
/** A region with fewer counted putts is a thin read. */
export const GREEN_THIN_READ_N = 15;

/** SVG geometry: a 330 × 330 plot, hole at the centre, 25 px per foot. */
export const GREEN_SIZE = 330;
export const GREEN_CENTER = GREEN_SIZE / 2;
export const GREEN_PX_PER_FT = 25;

const SLOPES: readonly GreenSlope[] = ['downhill', 'level', 'uphill'];

function isSlope(v: string | null): v is GreenSlope {
  return v === 'downhill' || v === 'level' || v === 'uphill';
}

/** FNV-1a 32-bit hash of the shot id: the seed for its position. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG, so the same putt always lands in
 *  the same spot on the server and the client. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;
/** Keeps dots off the region boundaries (degrees each side). */
const EDGE_PAD = 8;

/**
 * Angle in degrees, counter-clockwise from "right", for a putt in `slope`'s
 * region. Downhill = the wedge above the hole (45°-135°), uphill = below
 * (225°-315°), level = either side (315°-45° or 135°-225°).
 */
function angleFor(slope: GreenSlope, rand: () => number): number {
  const within = (lo: number) => lo + EDGE_PAD + rand() * (90 - 2 * EDGE_PAD);
  if (slope === 'downhill') return within(45);
  if (slope === 'uphill') return within(225);
  return rand() < 0.5 ? within(-45) : within(135);
}

/** SVG position for one putt. Deterministic in `id`. */
export function placePutt(id: string, feet: number, slope: GreenSlope): { x: number; y: number } {
  const rand = prng(seedOf(id));
  const a = angleFor(slope, rand) * DEG;
  // Clamp so a recorded 0-ft putt never sits on the hole marker.
  const r = Math.max(0.6, Math.min(GREEN_MAX_FT, feet)) * GREEN_PX_PER_FT;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return { x: round1(GREEN_CENTER + r * Math.cos(a)), y: round1(GREEN_CENTER - r * Math.sin(a)) };
}

/**
 * Counts and lays out the putts, or returns null when the green would not be
 * a fair read (fewer than {@link GREEN_MIN_PER_SLOPE} counted downhill or
 * level putts): the Why view then omits it.
 */
export function buildGreenView(putts: GreenPuttInput[], rounds: number): GreenView | null {
  const tally: Record<GreenSlope, { made: number; n: number }> = {
    downhill: { made: 0, n: 0 },
    level: { made: 0, n: 0 },
    uphill: { made: 0, n: 0 },
  };
  const points: GreenPoint[] = [];
  for (const p of putts) {
    if (!isSlope(p.slope)) continue;
    if (!Number.isFinite(p.feet) || p.feet <= 0 || p.feet > GREEN_MAX_FT) continue;
    const faint = p.feet < GREEN_MIN_FT;
    if (!faint) {
      tally[p.slope].n += 1;
      if (p.made) tally[p.slope].made += 1;
    }
    points.push({ ...placePutt(p.id, p.feet, p.slope), made: p.made, faint });
  }
  if (tally.downhill.n < GREEN_MIN_PER_SLOPE || tally.level.n < GREEN_MIN_PER_SLOPE) return null;

  const regions = {} as Record<GreenSlope, GreenRegionStat>;
  for (const slope of SLOPES) {
    const { made, n } = tally[slope];
    regions[slope] = { slope, made, n, pct: n > 0 ? Math.round((made / n) * 100) : null, thin: n < GREEN_THIN_READ_N };
  }
  // Faint dots first so counted ones draw on top.
  points.sort((a, b) => Number(b.faint) - Number(a.faint));
  return { rounds, regions, points };
}

export const GREEN_REGION_LABEL: Record<GreenSlope, { place: string; slope: string }> = {
  downhill: { place: 'Above the hole', slope: 'Downhill' },
  level: { place: 'Sides', slope: 'Level' },
  uphill: { place: 'Below the hole', slope: 'Uphill' },
};

function regionPhrase(r: GreenRegionStat): string {
  const label = GREEN_REGION_LABEL[r.slope];
  const rate = r.pct === null ? 'no putts' : `${r.made} of ${r.n} made (${r.pct}%)`;
  return `${label.place}, ${label.slope.toLowerCase()}: ${rate}${r.thin ? ', thin read' : ''}`;
}

/** The SVG's accessible summary: every region's make rate, no comparison. */
export function greenAriaLabel(view: GreenView): string {
  return (
    `Your putts from ${GREEN_MIN_FT} to ${GREEN_MAX_FT} feet around the hole. ` +
    SLOPES.map((s) => regionPhrase(view.regions[s])).join('. ') +
    `. Putts of ${GREEN_INNER_RING_FT} feet or less are shown faint and not counted.`
  );
}
