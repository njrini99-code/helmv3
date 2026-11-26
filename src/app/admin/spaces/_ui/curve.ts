/**
 * Smooth chart paths for the Bridge spaces. Pure: the same numbers give the same path on server and client.
 * A Catmull-Rom curve through the points, converted to cubic Béziers, with every control point clamped to the
 * plot box, so a curve between two zeros never dips under the axis (the overshoot the design canvas showed).
 */

export interface Plot {
  width: number;
  height: number;
  /** Space above the highest point and below the axis, in the same units. */
  padTop?: number;
  padBottom?: number;
}

export interface CurvePaths {
  line: string;
  area: string;
  points: ReadonlyArray<readonly [number, number]>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function curve(values: readonly number[], plot: Plot, max?: number): CurvePaths {
  const { width, height } = plot;
  const top = plot.padTop ?? 6;
  const bottom = height - (plot.padBottom ?? 4);
  if (values.length === 0) return { line: '', area: '', points: [] };
  const hi = Math.max(max ?? 0, ...values.map((v) => (Number.isFinite(v) ? v : 0)), 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (v: number) => bottom - (Math.max(0, Number.isFinite(v) ? v : 0) / hi) * (bottom - top);
  const pts = values.map((v, i) => [r1(i * step), r1(y(v))] as const);
  const clampY = (v: number) => Math.min(bottom, Math.max(top, v));
  if (pts.length === 1) {
    const [x0, y0] = pts[0]!;
    const line = `M${x0},${y0} L${width},${y0}`;
    return { line, area: `${line} L${width},${height} L0,${height} Z`, points: pts };
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = r1(p1[0] + (p2[0] - p0[0]) / 6);
    const c1y = r1(clampY(p1[1] + (p2[1] - p0[1]) / 6));
    const c2x = r1(p2[0] - (p3[0] - p1[0]) / 6);
    const c2y = r1(clampY(p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  const last = pts[pts.length - 1]!;
  return { line: d, area: `${d} L${last[0]},${height} L0,${height} Z`, points: pts };
}
