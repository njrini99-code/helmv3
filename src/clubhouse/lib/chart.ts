/**
 * Monotone cubic through the points: smooth, and never overshoots a real score. Only for a line with no gaps whose points are
 * all measured (Player Home's game line); a trend with empty weeks uses `gappedPath`, straight and broken (CH-15).
 */
export function monotonePath(pts: Array<[number, number]>): string {
  const n = pts.length;
  if (n < 2) return '';
  const dx: number[] = [];
  const m: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]![0] - pts[i]![0];
    m[i] = (pts[i + 1]![1] - pts[i]![1]) / dx[i]!;
  }
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1]!;
    const b = m[i]!;
    t[i] = a * b <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b);
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${pts[i]![0] + h},${pts[i]![1] + t[i]! * h} ${pts[i + 1]![0] - h},${pts[i + 1]![1] - t[i + 1]! * h} ${pts[i + 1]![0]},${pts[i + 1]![1]}`;
  }
  return d;
}


/** Runs of consecutive indices that have a value: `[1, null, 3, 4]` is `[[0], [2, 3]]`. */
export function valueRuns(values: ReadonlyArray<number | null>): number[][] {
  const runs: number[][] = [];
  let run: number[] | null = null;
  values.forEach((v, i) => {
    if (v == null) {
      run = null;
      return;
    }
    if (!run) runs.push((run = []));
    run.push(i);
  });
  return runs;
}

/**
 * Straight segments through the points that exist, and a new `M` after a gap (stats and charts audit 2026-11-15, CH-15): a week
 * with no rounds is a break in the line, never a curve bridged across it, the shared line chart's own rule (`ui/charts/Line`
 * `linePath`). A lone point between two gaps is a bare `M` that draws nothing: mark it with `lonePoints`. Empty with fewer than
 * two values.
 */
export function gappedPath(values: ReadonlyArray<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  const runs = valueRuns(values);
  if (runs.reduce((n, r) => n + r.length, 0) < 2) return '';
  const at = (i: number) => `${round2(x(i))},${round2(y(values[i]!))}`;
  return runs.map((r) => `M${r.map(at).join(' L')}`).join(' ');
}

/** The closed area under each run of two or more points, down (or up) to `base`: one `M…Z` a run, so a gap is a gap in the fill too. */
export function gappedArea(values: ReadonlyArray<number | null>, x: (i: number) => number, y: (v: number) => number, base: number): string {
  return valueRuns(values)
    .filter((r) => r.length > 1)
    .map((r) => `M${r.map((i) => `${round2(x(i))},${round2(y(values[i]!))}`).join(' L')} L${round2(x(r[r.length - 1]!))},${round2(base)} L${round2(x(r[0]!))},${round2(base)} Z`)
    .join(' ');
}

/** The points with no neighbour on either side: a straight, broken line draws nothing for them, so they take a dot. */
export function lonePoints(values: ReadonlyArray<number | null>): number[] {
  return valueRuns(values).flatMap((r) => (r.length === 1 ? r : []));
}

/**
 * Each week's share of a plot's width, first at 0 and last at 1: by date when every week has one, else evenly by index. Edge to
 * edge and with no floor on a gap, so three rounds on the first two days of October and one on the 30th draw a month apart
 * (CH-11).
 */
export function weekShares(n: number, starts: ReadonlyArray<string | null | undefined> | undefined): number[] {
  const even = Array.from({ length: n }, (_, i) => (n <= 1 ? 0.5 : i / (n - 1)));
  const at = starts?.length === n ? starts.map((d) => (d ? Date.parse(d) : NaN)) : null;
  if (!at || n < 2 || at.some((t) => !Number.isFinite(t))) return even;
  const t0 = at[0]!;
  const t1 = at[n - 1]!;
  return t1 > t0 ? at.map((t) => (t - t0) / (t1 - t0)) : even;
}

/**
 * Each round's share of a plot's width, first at 0 and last at 1, by its date (CH-11), with the shared line chart's floor on a gap
 * (`ui/charts/Line` `slotPositions`, `MIN_SLOT_GAP`): no two rounds come closer than half the even gap, so two rounds on one day
 * never sit on one spot. Rounds on the same day keep their given order. Evenly by index when any date is missing.
 */
export function dateShares(dates: ReadonlyArray<string | null | undefined>, minGap = 0.5): number[] {
  const n = dates.length;
  const even = Array.from({ length: n }, (_, i) => (n <= 1 ? 0.5 : i / (n - 1)));
  const at = dates.map((d) => (d ? Date.parse(d) : NaN));
  if (n < 2 || at.some((t) => !Number.isFinite(t))) return even;
  const t0 = Math.min(...at);
  const t1 = Math.max(...at);
  if (t1 === t0) return even;
  const order = at.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const floor = minGap / (n - 1);
  const gaps = order.slice(1).map(([t], k) => Math.max((t - order[k]![0]) / (t1 - t0), floor));
  const total = gaps.reduce((sum, g) => sum + g, 0);
  const out = new Array<number>(n);
  let run = 0;
  order.forEach(([, i], k) => {
    if (k > 0) run += gaps[k - 1]! / total;
    out[i] = run;
  });
  return out;
}

/**
 * Columns from a par (zero) line, better up (stats and charts audit 2026-11-15, CH-09, CH-14): a value under zero rises above the
 * line and one over it hangs below, every column on one range that holds zero and every value and is at least `minSpan` wide,
 * widened on the side the values lean. Shares of the height from the top, to a tenth of a percent.
 */
export function parColumns(values: readonly number[], minSpan: number): { zero: number; bars: Array<{ top: number; height: number; under: boolean }> } {
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (hi - lo < minSpan) {
    const room = minSpan - (hi - lo);
    const over = Math.max(0, ...values);
    const under = Math.max(0, ...values.map((v) => -v));
    const toOver = over + under > 0 ? over / (over + under) : 0.5;
    hi += room * toOver;
    lo -= room * (1 - toOver);
  }
  const at = (v: number) => Math.round(((v - lo) / (hi - lo)) * 1000) / 10;
  const zero = at(0);
  return { zero, bars: values.map((v) => ({ top: Math.min(zero, at(v)), height: Math.round(Math.abs(at(v) - zero) * 10) / 10, under: v < 0 })) };
}

/**
 * Bars across from a zero rule on one scale (CH-23): the track holds zero and every value with a little room past the longest, so
 * a negative value (strokes gained lost) draws to the left of the rule instead of no bar at all. All values at or over zero put
 * the rule at the left edge, plain bars from zero. Shares of the width, to a tenth of a percent.
 */
export function zeroBars(values: readonly number[], room = 1.08): { zero: number; bars: Array<{ left: number; width: number }> } {
  const lo = Math.min(0, ...values) * room;
  const hi = Math.max(0, ...values) * room;
  const span = hi - lo || 1;
  const at = (v: number) => Math.round(((v - lo) / span) * 1000) / 10;
  const zero = at(0);
  return { zero, bars: values.map((v) => ({ left: Math.min(zero, at(v)), width: Math.round(Math.abs(at(v) - zero) * 10) / 10 })) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function lastValue(values: Array<number | null>): { i: number; v: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) return { i, v };
  }
  return null;
}

export function firstValue(values: Array<number | null>): { i: number; v: number } | null {
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null) return { i, v };
  }
  return null;
}
