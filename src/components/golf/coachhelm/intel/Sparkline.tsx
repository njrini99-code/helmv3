/**
 * A small SG line: dashed zero line, soft area, 2px line. Scales to its box
 * (`preserveAspectRatio="none"` + non-scaling strokes), so the parent sets
 * the size. Values are drawn as given; nothing is smoothed or invented.
 */
import { cn } from '@/lib/utils';

export interface SparklineProps {
  values: readonly number[];
  /** Stroke colour (a CSS colour or var()). */
  color: string;
  /** Colour of the dashed zero line. */
  zeroColor?: string;
  /** An optional second reference line (e.g. the team's figure). */
  reference?: number | null;
  referenceColor?: string;
  /** Fixed domain; defaults to the values' range padded, always including 0. */
  domain?: [number, number];
  area?: boolean;
  className?: string;
  label?: string;
}

const W = 200;
const H = 48;

export function Sparkline({
  values,
  color,
  zeroColor = 'var(--fw-color-border-strong)',
  reference = null,
  referenceColor = 'var(--fw-color-warm-400)',
  domain,
  area = true,
  className,
  label,
}: SparklineProps) {
  if (values.length === 0) return null;
  const extra = reference != null && Number.isFinite(reference) ? [reference] : [];
  const lo0 = Math.min(0, ...values, ...extra);
  const hi0 = Math.max(0, ...values, ...extra);
  const pad = Math.max(0.1, (hi0 - lo0) * 0.15);
  const [lo, hi] = domain ?? [lo0 - pad, hi0 + pad];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const y = (v: number) => r1(H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * H);
  const x = (i: number) => r1(values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-full w-full overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke={zeroColor} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {extra.length ? (
        <line x1="0" x2={W} y1={y(extra[0]!)} y2={y(extra[0]!)} stroke={referenceColor} vectorEffect="non-scaling-stroke" />
      ) : null}
      {area && values.length > 1 ? <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity={0.12} /> : null}
      {values.length > 1 ? (
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <circle cx={x(0)} cy={y(values[0]!)} r={3} fill={color} />
      )}
    </svg>
  );
}
