/**
 * The welcome's ball: it flies in along a curve from the foreground, hops once
 * on the green and rolls to the cup. One function of elapsed time, so the
 * scene can drive it from a motion value with no re-render, and a test can
 * check where it ends. Source: design/handoff/auth/src/scene.jsx (GolfScene's
 * `tick`), same path and timings.
 */
const START: readonly [number, number] = [540, 1010];
const CONTROL: readonly [number, number] = [760, 150];
const LAND: readonly [number, number] = [1002, 648];
/** Where the cup is, in the scene's own coordinates. */
export const CUP: readonly [number, number] = [1052, 651];

/** Milliseconds of each leg, and the wait before the ball appears. */
export const BALL_MS = { delay: 350, flight: 1650, hop: 380, roll: 900 } as const;
export const BALL_TOTAL_MS = BALL_MS.delay + BALL_MS.flight + BALL_MS.hop + BALL_MS.roll;

export interface BallFrame {
  visible: boolean;
  x: number;
  y: number;
  r: number;
  shadowX: number;
  shadowY: number;
  shadowOpacity: number;
}

const at = (x: number, y: number, r: number, shadowX: number, shadowY: number, shadowOpacity: number): BallFrame => ({ visible: true, x, y, r, shadowX, shadowY, shadowOpacity });

/** The ball at rest on the green, in the cup's line: reduced motion, and where the roll ends. */
export const BALL_AT_REST: BallFrame = at(CUP[0], CUP[1] - 3, 3.2, CUP[0], CUP[1] + 1, 0.5);

/** The ball `ms` milliseconds after the welcome starts. */
export function ballAt(ms: number): BallFrame {
  const t = ms - BALL_MS.delay;
  if (t < 0) return { ...BALL_AT_REST, visible: false };
  if (t < BALL_MS.flight) {
    const e = t / BALL_MS.flight;
    const x = (1 - e) ** 2 * START[0] + 2 * (1 - e) * e * CONTROL[0] + e * e * LAND[0];
    const y = (1 - e) ** 2 * START[1] + 2 * (1 - e) * e * CONTROL[1] + e * e * LAND[1];
    const gx = START[0] + (LAND[0] - START[0]) * e;
    const gy = START[1] + (LAND[1] - START[1]) * e;
    return at(x, y, 10 - 6.8 * e, gx, gy + 2, 0.15 + 0.35 * e);
  }
  if (t < BALL_MS.flight + BALL_MS.hop) {
    const u = (t - BALL_MS.flight) / BALL_MS.hop;
    const x = LAND[0] + 22 * u;
    const gy = LAND[1] + 0.8 * u;
    return at(x, gy - 3 - Math.sin(u * Math.PI) * 11, 3.2, x, gy + 1, 0.5);
  }
  if (t < BALL_MS.flight + BALL_MS.hop + BALL_MS.roll) {
    const u = (t - BALL_MS.flight - BALL_MS.hop) / BALL_MS.roll;
    const e = 1 - (1 - u) ** 3;
    const x = LAND[0] + 22 + (CUP[0] - LAND[0] - 22) * e;
    const y = LAND[1] + 0.8 + (CUP[1] - LAND[1] - 0.8) * e;
    return at(x, y - 3, 3.2, x, y + 1, 0.5);
  }
  return BALL_AT_REST;
}
