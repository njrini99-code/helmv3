import { monotonePath } from '../lib/chart';
/**
 * Last-rounds form line: smooth, coloured by outcome (green when scoring
 * falls, amber when it rises, ink when flat), drawn against a dashed mean.
 * Lower scores sit lower, like a scoreboard reads.
 */
export function FormLine({
  data,
  width = 148,
  height = 34,
  label,
  earlyBelow = 2,
}: {
  data: number[];
  width?: number;
  height?: number;
  label: string;
  /** Below this many points the line isn't drawn, and an "Early read" pill says why. */
  earlyBelow?: number;
}) {
  if (data.length < earlyBelow) {
    return (
      <span className={data.length ? 'ch-form-early' : 'ch-form-empty'} role="img" aria-label={label}>
        {data.length ? 'Early read' : '—'}
      </span>
    );
  }
  const pad = 4;
  const lo = Math.min(...data) - 0.6;
  const hi = Math.max(...data) + 0.6;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (data.length - 1);
  const y = (v: number) => pad + ((v - lo) / (hi - lo)) * (height - pad * 2);
  const pts = data.map((v, i) => [x(i), y(v)] as [number, number]);
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const change = data[data.length - 1]! - data[0]!;
  const tone = change < -0.5 ? 'gain' : change > 0.5 ? 'loss' : 'flat';
  const line = monotonePath(pts);
  const [ex, ey] = pts[pts.length - 1]!;
  return (
    <svg style={{ maxWidth: width }} viewBox={`0 0 ${width} ${height}`} className={`ch-form ch-form--${tone}`} role="img" aria-label={label}>
      <line x1={pad} x2={width - pad} y1={y(avg)} y2={y(avg)} className="ch-form__mean" />
      <path d={`${line} L${ex},${height} L${pad},${height} Z`} className="ch-form__fill" />
      <path d={line} className="ch-form__line" />
      <circle cx={ex} cy={ey} r="3" className="ch-form__end" />
    </svg>
  );
}
