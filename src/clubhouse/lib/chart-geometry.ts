/**
 * Geometry for marks sized from data (SYS-2). A value from a real team has no ceiling: 10 + |v| x 22 drew a halo of radius 96 in a
 * 330-wide hole because every fixture stayed under 0.74. Every data-driven size goes through one of these.
 */

/** A radius from a value: `min` at zero, `max` at `full` and past it. The square root keeps area in step with the value. */
export function clampRadius(value: number | null | undefined, { min, max, full }: { min: number; max: number; full: number }): number {
  const v = Math.abs(value ?? 0);
  if (!Number.isFinite(v) || full <= 0) return min;
  return min + (max - min) * Math.min(1, Math.sqrt(v / full));
}

/** Maps `value` from a domain onto a box's length, clamped to the box. A flat domain lands in the middle. */
export function scaleToBox(value: number, [lo, hi]: readonly [number, number], length: number): number {
  if (!Number.isFinite(value) || hi === lo) return length / 2;
  return Math.max(0, Math.min(length, ((value - lo) / (hi - lo)) * length));
}

export type LabelBox = { x: number; y: number; w: number; h: number };
export type LabelMark = { id: string; x: number; y: number; r: number; w: number; h: number };
export type PlacedLabel = LabelBox & { id: string; anchor: 'start' | 'middle' | 'end'; fits: boolean };

const overlap = (a: LabelBox, b: LabelBox) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Puts each mark's label beside the mark, inside `box`, clear of every mark, every obstacle (a coin, a flag) and every label placed so far. Tries right, left, below,
 * above; when none is clear it takes the one that covers least and says so (`fits: false`), so a caller can shorten or drop it.
 * Labels come back top-left; `anchor` is the side the text should hang from at that box.
 */
export function placeLabels(marks: readonly LabelMark[], box: LabelBox, gap = 6, obstacles: readonly LabelBox[] = []): PlacedLabel[] {
  const solid = [...obstacles, ...marks.map((m) => ({ x: m.x - m.r, y: m.y - m.r, w: m.r * 2, h: m.r * 2 }))];
  const placed: PlacedLabel[] = [];
  for (const m of marks) {
    const options: Array<LabelBox & { anchor: PlacedLabel['anchor'] }> = [
      { x: m.x + m.r + gap, y: m.y - m.h / 2, w: m.w, h: m.h, anchor: 'start' },
      { x: m.x - m.r - gap - m.w, y: m.y - m.h / 2, w: m.w, h: m.h, anchor: 'end' },
      { x: m.x - m.w / 2, y: m.y + m.r + gap, w: m.w, h: m.h, anchor: 'middle' },
      { x: m.x - m.w / 2, y: m.y - m.r - gap - m.h, w: m.w, h: m.h, anchor: 'middle' },
    ];
    let best: PlacedLabel | null = null;
    let bestCost = Infinity;
    for (const o of options) {
      const inside = o.x >= box.x && o.y >= box.y && o.x + o.w <= box.x + box.w && o.y + o.h <= box.y + box.h;
      const clamped = { ...o, x: Math.max(box.x, Math.min(box.x + box.w - o.w, o.x)), y: Math.max(box.y, Math.min(box.y + box.h - o.h, o.y)) };
      const hit = [...solid, ...placed].reduce((sum, other) => sum + overlap(clamped, other), 0);
      const cost = hit + (inside ? 0 : 1);
      if (cost < bestCost) {
        bestCost = cost;
        best = { ...clamped, id: m.id, fits: hit === 0 };
      }
      if (cost === 0) break;
    }
    placed.push(best as PlacedLabel);
  }
  return placed;
}
