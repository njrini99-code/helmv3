/**
 * Mini previews for the player detail entry rows: a tiny strokes-gained
 * waterfall (Fingerprint) and a tiny genome strand (Genome). Pure SVG, no
 * hooks, no animation. Decorative inside their rows: each row's text carries
 * the same reading for assistive tech.
 */

import { cn } from '@/lib/utils';
import type { StrandPreview, WaterfallPreview } from './types';

const W = 104;
const H = 44;

/**
 * Tee → approach → around green → putting as steps from zero, then the total.
 * Gains step up in green, losses step down in amber; a missing category is a
 * gap (a dot on the running line), never a zero-height bar pretending to be 0.
 */
export function MiniWaterfall({ data, className }: { data: WaterfallPreview; className?: string }) {
  const ghost = data.state !== 'ready';
  const cols = data.steps.length + 1;
  const colW = W / cols;
  const barW = Math.min(12, colW - 6);

  let run = 0;
  const bars = data.steps.map((s) => {
    const from = run;
    if (s.value != null) run += s.value;
    return { key: s.key, from, to: run, value: s.value };
  });
  const total = data.total ?? run;
  const extent = Math.max(0.5, ...bars.flatMap((b) => [Math.abs(b.from), Math.abs(b.to)]), Math.abs(total));
  const mid = H / 2;
  const scale = (H / 2 - 3) / extent;
  const yOf = (v: number) => mid - v * scale;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={cn('flex-shrink-0 overflow-visible', ghost && 'opacity-35', className)}
    >
      <line x1={0} x2={W} y1={mid} y2={mid} className="stroke-border-strong" strokeWidth={1} />
      {ghost
        ? data.steps.map((s, i) => (
            <rect
              key={s.key}
              x={i * colW + (colW - barW) / 2}
              y={mid - 6 + (i % 2 === 0 ? -4 : 4)}
              width={barW}
              height={8}
              rx={1.5}
              className="fill-none stroke-text-tertiary"
              strokeWidth={1}
            />
          ))
        : bars.map((b, i) => {
            const x = i * colW + (colW - barW) / 2;
            if (b.value == null) {
              return <circle key={b.key} cx={x + barW / 2} cy={yOf(b.from)} r={1.5} className="fill-text-tertiary" />;
            }
            const top = Math.min(yOf(b.from), yOf(b.to));
            const h = Math.max(1.5, Math.abs(yOf(b.to) - yOf(b.from)));
            return (
              <rect
                key={b.key}
                x={x}
                y={top}
                width={barW}
                height={h}
                rx={1.5}
                className={b.value >= 0 ? 'fill-accent-500' : 'fill-fw-warning'}
              />
            );
          })}
      {!ghost ? (
        <rect
          x={(cols - 1) * colW + (colW - barW) / 2}
          y={Math.min(mid, yOf(total))}
          width={barW}
          height={Math.max(1.5, Math.abs(yOf(total) - mid))}
          rx={1.5}
          className={total >= 0 ? 'fill-accent-700' : 'fill-fw-warning-ink'}
        />
      ) : null}
    </svg>
  );
}

/**
 * The genome as a strand: one signed tick per dimension from the midline
 * (0.5). Above the line in green, below in amber. A locked dimension is a
 * hollow bead on the line, so the gaps read as "not measured", not "average".
 */
export function MiniStrand({ data, className }: { data: StrandPreview; className?: string }) {
  const ghost = data.state !== 'ready';
  const n = Math.max(1, data.dims.length);
  const step = W / n;
  const mid = H / 2;
  const amp = H / 2 - 3;

  // A faint double helix behind the ticks: two phase-shifted sine hairlines.
  const helix = (phase: number) => {
    const pts: string[] = [];
    for (let x = 0; x <= W; x += 4) {
      pts.push(`${x},${(mid + Math.sin((x / W) * Math.PI * 3 + phase) * (amp * 0.55)).toFixed(2)}`);
    }
    return pts.join(' ');
  };

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={cn('flex-shrink-0 overflow-visible', ghost && 'opacity-35', className)}
    >
      <polyline points={helix(0)} fill="none" className="stroke-border-subtle" strokeWidth={1} />
      <polyline points={helix(Math.PI)} fill="none" className="stroke-border-subtle" strokeWidth={1} />
      <line x1={0} x2={W} y1={mid} y2={mid} className="stroke-border-strong" strokeWidth={1} />
      {data.dims.map((d, i) => {
        const cx = i * step + step / 2;
        if (ghost || d.norm == null) {
          return (
            <circle key={d.id} cx={cx} cy={mid} r={2.25} className="fill-canvas stroke-text-tertiary" strokeWidth={1} />
          );
        }
        const delta = (d.norm - 0.5) * 2; // -1..1
        const y2 = mid - delta * amp;
        return (
          <g key={d.id}>
            <line
              x1={cx}
              x2={cx}
              y1={mid}
              y2={Math.abs(y2 - mid) < 1.5 ? mid - 1.5 : y2}
              strokeWidth={3}
              strokeLinecap="round"
              className={delta >= 0 ? 'stroke-accent-500' : 'stroke-fw-warning'}
            />
          </g>
        );
      })}
    </svg>
  );
}
