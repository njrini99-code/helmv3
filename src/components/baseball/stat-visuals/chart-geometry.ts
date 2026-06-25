// =============================================================================
// src/components/baseball/stat-visuals/chart-geometry.ts
//
// Pure, dependency-free geometry + honesty helpers shared by the V10 baseball
// stat-visual charts. NO 'use client', NO React, NO I/O — so it is unit-testable
// and importable from anywhere. Owned by the stat-visuals packet.
//
// What lives here:
//  - linear scales (no d3 dependency — keeps the bundle thin for ~hundreds of pts)
//  - min-sample gating + honest confidence derivation (never a fake "high")
//  - hexbin aggregation for dense EV/LA + pitch-shape scatter (SVG <1k pts; we
//    aggregate to bins ABOVE the spec's scatter threshold so the SVG path stays
//    cheap without pulling in a canvas renderer)
//  - the canonical SVG-vs-aggregate render-mode decision (spec §"Chart
//    Implementation Rules": SVG below ~1,000 pts, aggregate dense scatter)
//
// GROUNDING (v10_baseball_stat_visual_contracts.md):
//   §"Minimum data" thresholds per chart, §"Use aggregation: hexbin for dense
//   scatter", §"No starved metric renders as real 0", §"Use SVG for small/medium
//   charts ... Use Canvas for dense charts".
// =============================================================================

import type { BaseballMetricConfidence } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Scales
// -----------------------------------------------------------------------------

export interface LinearScale {
  (value: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

/** A tiny clamped linear scale (d3.scaleLinear-shaped, no dependency). */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  clamp = false,
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => {
    let t = (value - d0) / span;
    if (clamp) t = Math.max(0, Math.min(1, t));
    return r0 + t * (r1 - r0);
  }) as LinearScale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** "Nice" rounded domain for an array of numbers, ignoring null/NaN. */
export function niceDomain(
  values: ReadonlyArray<number | null | undefined>,
  pad = 0.05,
  fallback: readonly [number, number] = [0, 1],
): readonly [number, number] {
  const nums = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (nums.length === 0) return fallback;
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    // Degenerate single-value domain — open it up so the point isn't on the edge.
    const bump = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= bump;
    max += bump;
  }
  const padding = (max - min) * pad;
  return [min - padding, max + padding];
}

// -----------------------------------------------------------------------------
// Honest sample gating + confidence
// -----------------------------------------------------------------------------

export interface SampleGate {
  /** does the sample clear the bar for a reliable READ (chart at all)? */
  canRead: boolean;
  /** does it clear the (higher) bar for a TREND claim? */
  canTrend: boolean;
  /** does it clear the (highest) bar for dense/aggregated mode? */
  canAggregate: boolean;
  confidence: BaseballMetricConfidence;
}

export interface SampleThresholds {
  /** minimum events to render anything beyond "show recent examples". */
  read: number;
  /** minimum events to make a trend claim. */
  trend?: number;
  /** minimum events before switching to density/hexbin aggregation. */
  aggregate?: number;
}

/**
 * The single honesty guard. Maps a raw sample size onto read/trend/aggregate
 * capability AND an honest confidence — a thin sample can NEVER return 'high'.
 * (zip non-negotiable: "Recalibrate thresholds ... never emit a false 'high'".)
 */
export function gateSample(size: number, t: SampleThresholds): SampleGate {
  const canRead = size >= t.read;
  const canTrend = t.trend === undefined ? canRead : size >= t.trend;
  const canAggregate =
    t.aggregate === undefined ? false : size >= t.aggregate;

  let confidence: BaseballMetricConfidence;
  if (!canRead) confidence = 'insufficient';
  else if (canAggregate) confidence = 'high';
  else if (canTrend) confidence = 'medium';
  else confidence = 'low';

  return { canRead, canTrend, canAggregate, confidence };
}

/** Canonical per-chart thresholds straight from the V10 §"Minimum data" spec. */
export const SAMPLE_THRESHOLDS = {
  /** EV/LA: scatter >=15, density/hexbin >=80. */
  evLaMatrix: { read: 15, trend: 40, aggregate: 80 },
  /** zone heatmap >=30 pitches; pitch-type split >=15. */
  zoneHeatmap: { read: 30, trend: 60 },
  zoneTypeSplit: { read: 15 },
  /** spray: 10 to display, 30 for trend. */
  spray: { read: 10, trend: 30, aggregate: 120 },
  /** pitch shape: 8 per type to display, 25 for shape trend. */
  pitchShapeType: { read: 8, trend: 25, aggregate: 80 },
  /** command heatmap: 25 pitcher-level, 15 by type. */
  commandHeatmap: { read: 25, trend: 60 },
  commandTypeSplit: { read: 15 },
  /** velo/command decay: 1 outing displays, 3 for trend. */
  decay: { read: 1, trend: 3 },
  /** release consistency reuses the pitch-shape-by-type bar. */
  release: { read: 8, trend: 25 },
} satisfies Record<string, SampleThresholds>;

// -----------------------------------------------------------------------------
// Hexbin aggregation (for dense scatter — EV/LA, pitch shape, spray)
// -----------------------------------------------------------------------------

export interface HexBin {
  /** bin center in DATA space. */
  cx: number;
  cy: number;
  count: number;
  /** ids of the underlying points (for the source drawer on a bin click). */
  ids: string[];
}

export interface XYPoint {
  id: string;
  x: number | null;
  y: number | null;
}

/**
 * Aggregate XY points into a hex grid in DATA space. Null coords are dropped
 * (never coerced to 0). `binsX` controls resolution; rows offset by half a bin
 * to approximate hex packing without trig overhead. Returns bins sorted by count
 * descending so the heaviest cells paint last (on top).
 */
export function hexbin(
  points: ReadonlyArray<XYPoint>,
  domainX: readonly [number, number],
  domainY: readonly [number, number],
  binsX = 18,
): HexBin[] {
  const [x0, x1] = domainX;
  const [y0, y1] = domainY;
  const wx = (x1 - x0) / binsX || 1;
  const wy = wx * ((y1 - y0) / (x1 - x0 || 1)); // keep bins roughly square in range
  const map = new Map<string, HexBin>();

  for (const p of points) {
    if (
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    ) {
      continue;
    }
    const row = Math.floor((p.y - y0) / (wy || 1));
    // offset alternating rows by half a bin (hex-ish packing)
    const offset = row % 2 === 0 ? 0 : wx / 2;
    const col = Math.floor((p.x - x0 - offset) / wx);
    const key = `${col}:${row}`;
    const cx = x0 + offset + (col + 0.5) * wx;
    const cy = y0 + (row + 0.5) * (wy || 1);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.ids.push(p.id);
    } else {
      map.set(key, { cx, cy, count: 1, ids: [p.id] });
    }
  }

  return [...map.values()].sort((a, b) => a.count - b.count);
}

// -----------------------------------------------------------------------------
// Render-mode decision
// -----------------------------------------------------------------------------

export type ScatterRenderMode = 'scatter' | 'aggregate';

/**
 * Decide whether to plot individual points or aggregate to bins. We aggregate
 * once the sample clears the aggregate threshold (keeps the SVG node count low —
 * spec §"hexbin for dense scatter"). Below the read threshold the caller should
 * have already shown the insufficient-data surface (we still return 'scatter').
 */
export function scatterRenderMode(
  size: number,
  thresholds: SampleThresholds,
): ScatterRenderMode {
  if (thresholds.aggregate !== undefined && size >= thresholds.aggregate) {
    return 'aggregate';
  }
  return 'scatter';
}

// -----------------------------------------------------------------------------
// Color helpers (not color-only — always paired with a labeled legend/table)
// -----------------------------------------------------------------------------

/** Sequential cream->green ramp for heat cells. t in [0,1]. */
export function greenHeat(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  // cream-100 (#FFFEFA-ish warm) -> primary-600 (#16A34A)
  const r = Math.round(245 - (245 - 22) * c);
  const g = Math.round(241 - (241 - 163) * c);
  const b = Math.round(230 - (230 - 74) * c);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Diverging warm(amber)->green ramp for damage/decay where mid is neutral. */
export function divergingHeat(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) {
    // amber-ish low end
    const k = c / 0.5;
    const r = Math.round(245 - (245 - 234) * k);
    const g = Math.round(241 - (241 - 179) * k);
    const b = Math.round(230 - (230 - 8) * k);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const k = (c - 0.5) / 0.5;
  const r = Math.round(234 - (234 - 22) * k);
  const g = Math.round(179 - (179 - 163) * k);
  const b = Math.round(8 + (74 - 8) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

// -----------------------------------------------------------------------------
// Small formatting helpers shared across charts (keep formatting honest)
// -----------------------------------------------------------------------------

/** Percent display for a rate in [0,1]; null -> em dash (never "0%" for missing). */
export function pct(rate: number | null | undefined, decimals = 0): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(decimals)}%`;
}

/** Fixed-decimal number; null -> em dash. */
export function num(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}

/** Signed delta with tone, honest about missing operands. */
export function delta(
  a: number | null | undefined,
  b: number | null | undefined,
): { text: string; tone: 'up' | 'down' | 'flat' | 'none' } {
  if (
    a === null ||
    a === undefined ||
    b === null ||
    b === undefined ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return { text: '—', tone: 'none' };
  }
  const d = a - b;
  if (Math.abs(d) < 1e-9) return { text: '0', tone: 'flat' };
  const sign = d > 0 ? '+' : '';
  return { text: `${sign}${d.toFixed(1)}`, tone: d > 0 ? 'up' : 'down' };
}
