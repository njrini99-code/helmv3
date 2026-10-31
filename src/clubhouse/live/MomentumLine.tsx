import { momentum, type LiveLane } from './model';

/**
 * The momentum line (4.1): cumulative to-par over the holes played, 56 by 20, under par up. A dashed zero line, a 1.5 px
 * stroke in ink-500, and a last point in the to-par colour. The newest segment is its own path so it can fade in
 * (opacity only, no stroke-dashoffset) when a point arrives after mount.
 */
const W = 56;
const H = 20;
const PAD = 3;

export function MomentumLine({ lane, freshN }: { lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes'>; freshN?: number }) {
  const pts = momentum(lane);
  if (pts.length < 2) return <span className="ch-lv-spark is-empty" aria-hidden="true" />;
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  const span = Math.max(1, hi - lo);
  // Under par (negative) is up: a low cumulative number sits high in the box.
  const y = (v: number) => PAD + ((v - lo) / span) * (H - 2 * PAD);
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const last = pts[pts.length - 1]!;
  const tone = last < 0 ? 'is-under' : '';
  return (
    <svg className={'ch-lv-spark ' + tone} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <line className="ch-lv-spark__zero" x1={0} x2={W} y1={y(0)} y2={y(0)} />
      {pts.slice(1).map((v, i) => (
        <path
          // The newest segment is keyed by the change, so it mounts and fades in; the others stay put.
          key={i === pts.length - 2 ? `new-${pts.length}-${freshN ?? 0}` : i}
          className="ch-lv-spark__seg"
          data-new={i === pts.length - 2 && freshN !== undefined ? '' : undefined}
          d={`M${x(i)} ${y(pts[i]!)}L${x(i + 1)} ${y(v)}`}
        />
      ))}
      <circle className="ch-lv-spark__dot" cx={x(pts.length - 1)} cy={y(last)} r={1.5} />
    </svg>
  );
}
