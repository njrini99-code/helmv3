'use client';

/**
 * ============================================================================
 * PuttingHeatmap — Canvas distance × direction grid (§5.2)
 * ----------------------------------------------------------------------------
 * Make-rate by distance band × direction, painted on the warm sequential
 * cream → green → amber ramp (`--fw-viz-seq-*`). Canvas for density; cells are
 * annotated with value + n so color is NEVER the only channel (CVD-safe and
 * the precise readout coaches want). The same data is exposed via ChartFrame's
 * "view as table" toggle.
 *
 * Sequential interpolation is computed in the resolved (sRGB) channel space at
 * runtime — Canvas can't read CSS `var()` ramps directly, so the helper reads
 * the resolved seq stops off the canvas element and lerps between them.
 * ========================================================================== */

import * as React from 'react';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { useCanvasLayer, resolveCssColor } from './useCanvasLayer';
import { VIZ_FONT } from './theme';

export interface HeatCell {
  /** row key (e.g. distance band "3-5 ft") */
  row: string;
  /** column key (e.g. "Left", "Center", "Right") */
  col: string;
  /** normalized intensity 0..1 (e.g. make rate) */
  value: number;
  /** sample size for the cell (drives the low-confidence dimming + annotation) */
  n: number;
  /** optional display value override (else value formatted as %) */
  display?: string;
}

export interface PuttingHeatmapProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  /** ordered row labels (top → bottom) */
  rows: string[];
  /** ordered column labels (left → right) */
  cols: string[];
  cells: HeatCell[];
  /** n below this dims the cell as low-confidence */
  minConfidentN?: number;
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

const ROW_LABEL_W = 72;
const COL_LABEL_H = 22;
const GAP = 4;

export function PuttingHeatmap({
  title = 'Putting Make Rate',
  overline,
  subtitle,
  takeaway,
  rows,
  cols,
  cells,
  minConfidentN = 5,
  height = 280,
  state,
  actions,
  className,
}: PuttingHeatmapProps) {
  const { canvasRef, size, draw } = useCanvasLayer();

  const lookup = React.useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of cells) m.set(`${c.row}|${c.col}`, c);
    return m;
  }, [cells]);

  React.useEffect(() => {
    if (size.width === 0 || size.height === 0 || rows.length === 0 || cols.length === 0) return;
    const el = canvasRef.current;

    const stops = [
      resolveCssColor(el, 'var(--fw-viz-seq-0)'),
      resolveCssColor(el, 'var(--fw-viz-seq-1)'),
      resolveCssColor(el, 'var(--fw-viz-seq-2)'),
      resolveCssColor(el, 'var(--fw-viz-seq-3)'),
      resolveCssColor(el, 'var(--fw-viz-seq-4)'),
      resolveCssColor(el, 'var(--fw-viz-seq-5)'),
    ].map(parseColor);
    const labelColor = resolveCssColor(el, 'var(--fw-color-text-secondary)');
    const cellTextDark = resolveCssColor(el, 'var(--fw-color-text-primary)');

    draw((ctx, s) => {
      const gridW = s.width - ROW_LABEL_W;
      const gridH = s.height - COL_LABEL_H;
      const cw = (gridW - GAP * (cols.length - 1)) / cols.length;
      const ch = (gridH - GAP * (rows.length - 1)) / rows.length;

      ctx.font = `600 ${VIZ_FONT.tickSize}px ${cssFontStack(el)}`;
      ctx.textBaseline = 'middle';

      // column headers
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      cols.forEach((col, ci) => {
        const x = ROW_LABEL_W + ci * (cw + GAP) + cw / 2;
        ctx.fillText(col, x, COL_LABEL_H / 2);
      });

      // row labels
      ctx.textAlign = 'right';
      rows.forEach((row, ri) => {
        const y = COL_LABEL_H + ri * (ch + GAP) + ch / 2;
        ctx.fillStyle = labelColor;
        ctx.fillText(row, ROW_LABEL_W - 8, y);
      });

      // cells
      rows.forEach((row, ri) => {
        cols.forEach((col, ci) => {
          const cell = lookup.get(`${row}|${col}`);
          const x = ROW_LABEL_W + ci * (cw + GAP);
          const y = COL_LABEL_H + ri * (ch + GAP);

          if (!cell || cell.n === 0) {
            // honest empty cell — faint dashed well, no fake zero
            ctx.fillStyle = resolveCssColor(el, 'var(--fw-color-surface-sunken)');
            roundRect(ctx, x, y, cw, ch, 6);
            ctx.fill();
            ctx.fillStyle = resolveCssColor(el, 'var(--fw-color-text-tertiary)');
            ctx.textAlign = 'center';
            ctx.fillText('—', x + cw / 2, y + ch / 2);
            return;
          }

          const lowConf = cell.n < minConfidentN;
          const fill = sampleRamp(stops, clamp01(cell.value));
          ctx.fillStyle = rgbString(fill);
          ctx.globalAlpha = lowConf ? 0.45 : 1;
          roundRect(ctx, x, y, cw, ch, 6);
          ctx.fill();
          ctx.globalAlpha = 1;

          // value + n annotation (color is never the only channel)
          const valText = cell.display ?? `${Math.round(cell.value * 100)}%`;
          ctx.fillStyle = textOn(fill, cellTextDark);
          ctx.textAlign = 'center';
          ctx.font = `600 ${VIZ_FONT.labelSize}px ${cssFontStack(el)}`;
          ctx.fillText(valText, x + cw / 2, y + ch / 2 - 6);
          ctx.font = `500 10px ${cssFontStack(el)}`;
          ctx.globalAlpha = 0.8;
          ctx.fillText(`n=${cell.n}`, x + cw / 2, y + ch / 2 + 9);
          ctx.globalAlpha = 1;
        });
      });
    });
  }, [rows, cols, lookup, size, minConfidentN, draw, canvasRef]);

  const resolvedState: ChartFrameState = state ?? (cells.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: 'Make rate by distance and direction',
    columns: [
      { key: 'row', label: 'Distance' },
      { key: 'col', label: 'Direction' },
      { key: 'value', label: 'Make rate', numeric: true },
      { key: 'n', label: 'Attempts', numeric: true },
    ],
    rows: cells.map((c) => ({
      row: c.row,
      col: c.col,
      value: c.display ?? `${Math.round(c.value * 100)}%`,
      n: c.n,
    })),
  };

  return (
    <ChartFrame
      title={title}
      overline={overline}
      subtitle={subtitle}
      takeaway={takeaway}
      state={resolvedState}
      height={height}
      tableData={tableData}
      actions={actions}
      className={className}
    >
      <div className="relative size-full">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Color + canvas helpers                                                     */
/* -------------------------------------------------------------------------- */

interface RGB {
  r: number;
  g: number;
  b: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Parse a resolved CSS color string into sRGB via an offscreen canvas. */
function parseColor(value: string): RGB {
  if (typeof document === 'undefined') return { r: 128, g: 160, b: 120 };
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  if (!ctx) return { r: 128, g: 160, b: 120 };
  ctx.fillStyle = '#000';
  ctx.fillStyle = value; // browser resolves oklch()/var-substituted strings
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 };
}

/** Sample a discrete ramp at t∈[0,1] with linear interpolation between stops. */
function sampleRamp(stops: RGB[], t: number): RGB {
  const first = stops[0];
  if (!first) return { r: 0, g: 0, b: 0 };
  if (stops.length === 1) return first;
  const scaled = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i] ?? first;
  const b = stops[i + 1] ?? a;
  return {
    r: Math.round(a.r + (b.r - a.r) * f),
    g: Math.round(a.g + (b.g - a.g) * f),
    b: Math.round(a.b + (b.b - a.b) * f),
  };
}

function rgbString({ r, g, b }: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

/** Pick legible text color for a cell fill (relative luminance threshold). */
function textOn(fill: RGB, darkText: string): string {
  const lum = (0.2126 * fill.r + 0.7152 * fill.g + 0.0722 * fill.b) / 255;
  return lum > 0.6 ? darkText : '#FFFEFA';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function cssFontStack(el: HTMLElement | null): string {
  if (!el || typeof window === 'undefined') return 'system-ui, sans-serif';
  return getComputedStyle(el).fontFamily || 'system-ui, sans-serif';
}
