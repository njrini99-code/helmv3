/** Monotone cubic through the points: smooth, and never overshoots a real score. */
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


/** A path through only the points that exist; gaps are bridged, not drawn as zero. */
export function gappedPath(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as [number, number]]));
  return pts.length > 1 ? monotonePath(pts) : '';
}

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
