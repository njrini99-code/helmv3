import type { HeatCell } from '@/components/fairway';
import {
  PUTT_BUCKETS,
  normalizePuttMiss,
  type PuttRecord,
} from '@/components/golf/coachhelm/v3/PuttHeatmap/types';

const DIRECTION_COLS = ['Short', 'Left', 'Center', 'Right', 'Long'] as const;

function bucketLabel(min: number, max: number): string {
  if (!Number.isFinite(max)) return `${min}+ ft`;
  return `${min}–${max} ft`;
}

function colForPutt(made: boolean, miss: ReturnType<typeof normalizePuttMiss>): (typeof DIRECTION_COLS)[number] {
  if (made) return 'Center';
  if (miss === 'left') return 'Left';
  if (miss === 'right') return 'Right';
  if (miss === 'short') return 'Short';
  if (miss === 'long') return 'Long';
  return 'Center';
}

/** Build Fairway PuttingHeatmap cells from raw putt rows. */
export function buildPuttingHeatCells(putts: PuttRecord[]): {
  rows: string[];
  cols: string[];
  cells: HeatCell[];
} {
  const rows = PUTT_BUCKETS.map((b) => bucketLabel(b.min, b.max === Infinity ? 25 : b.max));
  const cols = [...DIRECTION_COLS];

  type Acc = { made: number; total: number };
  const acc = new Map<string, Acc>();

  for (const putt of putts) {
    const bucket = PUTT_BUCKETS.find((b) => putt.distance_feet >= b.min && putt.distance_feet < b.max)
      ?? PUTT_BUCKETS[PUTT_BUCKETS.length - 1]!;
    const row = bucketLabel(bucket.min, bucket.max === Infinity ? 25 : bucket.max);
    const col = colForPutt(putt.made, normalizePuttMiss(putt.miss_direction));
    const key = `${row}|${col}`;
    const cur = acc.get(key) ?? { made: 0, total: 0 };
    cur.total += 1;
    if (putt.made) cur.made += 1;
    acc.set(key, cur);
  }

  const cells: HeatCell[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const data = acc.get(`${row}|${col}`);
      if (!data || data.total === 0) continue;
      const rate = data.made / data.total;
      cells.push({
        row,
        col,
        value: rate,
        n: data.total,
        display: `${Math.round(rate * 100)}%`,
      });
    }
  }

  return { rows, cols, cells };
}
