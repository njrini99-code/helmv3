import { STATIONS, type ChStation } from '../../../data/coachhelm-team-shape';
import type { HoleGeometry } from './hole-geometry';

/**
 * The ball's flight down the hole (M-TEAM-01 to 04), worked out from the hole's own path with no DOM: a test can read every
 * number, and the browser never measures an SVG path while the page is settling.
 *
 * What moves is a layer the size of the drawing, so a keyframe is a percentage of that layer and holds through a resize.
 * Transform and opacity only: WebKit runs all of it on the compositor.
 */
export const FLIGHT_MS = 1900;
/** The ball rests on the flag, then fades (M-TEAM-04). */
export const LAND_HOLD_MS = 300;
export const LAND_FADE_MS = 500;
/** A station answers the ball with one ring, the selected station's own pulse played once and shorter (M-TEAM-03). */
export const RIPPLE_MS = 620;
/** The trail: the same flight a few frames behind, fainter each time. */
export const TRAIL = [
  { lagMs: 34, opacity: 0.42, scale: 0.84 },
  { lagMs: 68, opacity: 0.26, scale: 0.68 },
  { lagMs: 102, opacity: 0.14, scale: 0.54 },
] as const;

export interface Point {
  x: number;
  y: number;
}

/** The page's own curve: slow off the tee, quick through the air, slow onto the green. */
export const flightEase = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** When the ball has covered a fraction of the path: the inverse of `flightEase`. */
export const flightTime = (fraction: number): number => {
  const e = Math.min(1, Math.max(0, fraction));
  return e < 0.5 ? Math.sqrt(e / 2) : 1 - Math.sqrt((1 - e) / 2);
};

/** "M x y C … C …": the hole's centre line as cubic segments. */
function segmentsOf(path: string): Point[][] {
  const n = (path.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const out: Point[][] = [];
  let from: Point = { x: n[0] ?? 0, y: n[1] ?? 0 };
  for (let i = 2; i + 5 < n.length; i += 6) {
    const seg = [from, { x: n[i]!, y: n[i + 1]! }, { x: n[i + 2]!, y: n[i + 3]! }, { x: n[i + 4]!, y: n[i + 5]! }];
    out.push(seg);
    from = seg[3]!;
  }
  return out;
}

function cubic(seg: Point[], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * seg[0]!.x + b * seg[1]!.x + c * seg[2]!.x + d * seg[3]!.x, y: a * seg[0]!.y + b * seg[1]!.y + c * seg[2]!.y + d * seg[3]!.y };
}

const STEPS = 120;

/** The path as points with the length run so far, fine enough that a straight line between two is the curve to a tenth of a point. */
export function flightTable(path: string): { points: Point[]; run: number[]; length: number } {
  const points: Point[] = [];
  const run: number[] = [];
  let length = 0;
  for (const seg of segmentsOf(path)) {
    for (let i = points.length ? 1 : 0; i <= STEPS; i += 1) {
      const p = cubic(seg, i / STEPS);
      const last = points[points.length - 1];
      if (last) length += Math.hypot(p.x - last.x, p.y - last.y);
      points.push(p);
      run.push(length);
    }
  }
  return { points, run, length };
}

/** The point a fraction of the way along, by length. */
export function pointAt(table: ReturnType<typeof flightTable>, fraction: number): Point {
  const { points, run, length } = table;
  if (!points.length) return { x: 0, y: 0 };
  const want = Math.min(1, Math.max(0, fraction)) * length;
  let lo = 0;
  let hi = run.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (run[mid]! < want) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return points[0]!;
  const a = points[lo - 1]!;
  const b = points[lo]!;
  const span = run[lo]! - run[lo - 1]!;
  const k = span > 0 ? (want - run[lo - 1]!) / span : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** How far along the path the ball is when it is nearest a station. */
export function stationFraction(table: ReturnType<typeof flightTable>, at: Point): number {
  let best = 0;
  let near = Infinity;
  table.points.forEach((p, i) => {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < near) {
      near = d;
      best = i;
    }
  });
  return table.length > 0 ? table.run[best]! / table.length : 0;
}

const FRAMES = 38;

export interface HoleFlight {
  /** The ball, tee to flag: where it is as a fraction of the drawing's width and height, linear between frames (the ease is in the spacing). */
  frames: Array<{ offset: number; x: number; y: number }>;
  /** When the ball passes each station, in ms from its start. Tee is 0; putting is the landing. */
  passMs: Record<ChStation, number>;
}

export function holeFlight(hole: HoleGeometry): HoleFlight {
  const table = flightTable(hole.path);
  const frames = Array.from({ length: FRAMES + 1 }, (_, i) => {
    const offset = i / FRAMES;
    const p = pointAt(table, flightEase(offset));
    return { offset, x: p.x / hole.w, y: p.y / hole.h };
  });
  const passMs = Object.fromEntries(
    STATIONS.map((s) => {
      // A ring starts as the ball arrives, a touch early so it reads as the ball's doing (the page's "minus .02").
      const f = Math.max(0, stationFraction(table, hole.st[s]) - 0.02);
      return [s, Math.round(flightTime(f) * FLIGHT_MS)];
    }),
  ) as Record<ChStation, number>;
  return { frames, passMs };
}
