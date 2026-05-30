'use client';

/**
 * ============================================================================
 * ShotDispersion — Canvas scatter + 1σ/2σ dispersion ellipse (§5.2)
 * ----------------------------------------------------------------------------
 * The premium differentiator: spray pattern + bias. Canvas (not SVG) because
 * SVG thrashes past ~1k nodes and this handles thousands at 60fps; retina via
 * devicePixelRatio. Points use `@visx/scale` linear scales (typed, no `any`).
 *
 * Renders a warm-amber→green density by side of target, the green target line
 * at x = 0, and 1σ + 2σ covariance ellipses showing the dispersion pattern.
 * Matte ChartFrame with a "view as table" summary fallback (mean bias + σ).
 * ========================================================================== */

import * as React from 'react';
import { scaleLinear } from '@visx/scale';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { useCanvasLayer, resolveCssColor } from './useCanvasLayer';
import { prefersReducedMotion } from './theme';

export interface ShotPoint {
  /** lateral offset from target line (− = left, + = right), e.g. yards */
  x: number;
  /** distance offset (− = short, + = long) */
  y: number;
}

export interface ShotDispersionProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: ShotPoint[];
  /** symmetric lateral domain bound; auto from data if omitted */
  lateralMax?: number;
  /** distance domain bound; auto from data if omitted */
  distanceMax?: number;
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

const PAD = 16;

export function ShotDispersion({
  title = 'Shot Dispersion',
  overline,
  subtitle,
  takeaway,
  data,
  lateralMax,
  distanceMax,
  height = 300,
  state,
  actions,
  className,
}: ShotDispersionProps) {
  const { canvasRef, size, draw } = useCanvasLayer();

  const stats = React.useMemo(() => computeStats(data), [data]);

  const bounds = React.useMemo(() => {
    const latPeak = data.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0) * 1.2;
    const distPeak = data.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0) * 1.2;
    const lat = lateralMax ?? (latPeak || 1);
    const dist = distanceMax ?? (distPeak || 1);
    return { lat, dist };
  }, [data, lateralMax, distanceMax]);

  React.useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const el = canvasRef.current;
    const reduce = prefersReducedMotion();

    const accent = resolveCssColor(el, 'var(--fw-color-accent-500)');
    const accentSoft = resolveCssColor(el, 'var(--fw-color-accent-300)');
    const warning = resolveCssColor(el, 'var(--fw-color-warning)');
    const benchmark = resolveCssColor(el, 'var(--fw-viz-benchmark)');
    const grid = resolveCssColor(el, 'var(--fw-viz-grid)');

    draw((ctx, s) => {
      const xScale = scaleLinear<number>({
        domain: [-bounds.lat, bounds.lat],
        range: [PAD, s.width - PAD],
      });
      const yScale = scaleLinear<number>({
        domain: [-bounds.dist, bounds.dist],
        range: [s.height - PAD, PAD],
      });
      const cx = xScale(0);
      const cy = yScale(0);

      // hairline crosshair axes (calm)
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, cy);
      ctx.lineTo(s.width - PAD, cy);
      ctx.stroke();

      // emphasized green target line at lateral 0
      ctx.strokeStyle = benchmark;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, PAD);
      ctx.lineTo(cx, s.height - PAD);
      ctx.stroke();
      ctx.setLineDash([]);

      // covariance ellipses (2σ then 1σ)
      if (data.length >= 3) {
        drawEllipse(ctx, stats, xScale, yScale, 2, accentSoft, 0.16);
        drawEllipse(ctx, stats, xScale, yScale, 1, accent, 0.0, accent);
      }

      // points — amber if biased to one side of the mean, green near center
      for (const p of data) {
        const px = xScale(p.x);
        const py = yScale(p.y);
        const offCenter = Math.abs(p.x - stats.meanX) > stats.sdX;
        ctx.fillStyle = offCenter ? warning : accent;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // mean marker
      if (data.length > 0) {
        ctx.fillStyle = accent;
        ctx.strokeStyle = resolveCssColor(el, 'var(--fw-color-surface)');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xScale(stats.meanX), yScale(stats.meanY), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      void reduce; // static render; nothing animated to suppress
    });
  }, [data, size, bounds, stats, draw, canvasRef]);

  const resolvedState: ChartFrameState = state ?? (data.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: 'Shot dispersion summary',
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value', numeric: true },
    ],
    rows: [
      { metric: 'Shots', value: data.length },
      { metric: 'Lateral bias (mean)', value: stats.meanX.toFixed(1) },
      { metric: 'Lateral σ', value: stats.sdX.toFixed(1) },
      { metric: 'Distance bias (mean)', value: stats.meanY.toFixed(1) },
      { metric: 'Distance σ', value: stats.sdY.toFixed(1) },
    ],
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
/* Stats + ellipse helpers                                                    */
/* -------------------------------------------------------------------------- */

interface DispersionStats {
  meanX: number;
  meanY: number;
  sdX: number;
  sdY: number;
  /** sample covariance between x and y */
  cov: number;
}

function computeStats(data: ShotPoint[]): DispersionStats {
  const n = data.length;
  if (n === 0) return { meanX: 0, meanY: 0, sdX: 0, sdY: 0, cov: 0 };
  const meanX = data.reduce((s, p) => s + p.x, 0) / n;
  const meanY = data.reduce((s, p) => s + p.y, 0) / n;
  let vx = 0;
  let vy = 0;
  let cov = 0;
  for (const p of data) {
    vx += (p.x - meanX) ** 2;
    vy += (p.y - meanY) ** 2;
    cov += (p.x - meanX) * (p.y - meanY);
  }
  const denom = Math.max(1, n - 1);
  return {
    meanX,
    meanY,
    sdX: Math.sqrt(vx / denom),
    sdY: Math.sqrt(vy / denom),
    cov: cov / denom,
  };
}

type LinearScale = ReturnType<typeof scaleLinear<number>>;

/** Draw a covariance ellipse at `nSigma`, oriented by the eigenvectors. */
function drawEllipse(
  ctx: CanvasRenderingContext2D,
  stats: DispersionStats,
  xScale: LinearScale,
  yScale: LinearScale,
  nSigma: number,
  color: string,
  fillAlpha: number,
  strokeColor?: string,
) {
  const { meanX, meanY, sdX, sdY, cov } = stats;
  const vX = sdX * sdX;
  const vY = sdY * sdY;
  // eigen-decomposition of the 2x2 covariance matrix [[vX, cov],[cov, vY]]
  const tr = vX + vY;
  const det = vX * vY - cov * cov;
  const disc = Math.max(0, (tr / 2) ** 2 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = tr / 2 - Math.sqrt(disc);
  const theta = Math.abs(cov) < 1e-9 && vX >= vY ? 0 : Math.atan2(l1 - vX, cov || 1e-9);

  const ax = nSigma * Math.sqrt(Math.max(0, l1));
  const ay = nSigma * Math.sqrt(Math.max(0, l2));

  // sample the ellipse in data space, project through the scales
  ctx.beginPath();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ex = ax * Math.cos(t);
    const ey = ay * Math.sin(t);
    const dx = ex * Math.cos(theta) - ey * Math.sin(theta);
    const dy = ex * Math.sin(theta) + ey * Math.cos(theta);
    const px = xScale(meanX + dx);
    const py = yScale(meanY + dy);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fillAlpha > 0) {
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = strokeColor ?? color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
