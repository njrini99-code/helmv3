import { ArrowDownRight, ArrowUpRight, Flag, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import { monotonePath } from '../../lib/chart';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';

/**
 * The yardage book: charts drawn the way a caddie's book reads, numbers where
 * they happen. Server-safe (no hooks). Honesty rules: every chart states its
 * window and sample, null is drawn as absent (never zero), benchmarks are
 * lines or ticks rather than bar heights, and nothing counts up.
 */

export function YardagePage({ title, meta, note, children }: { title: string; meta?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="ch-yb">
      <header className="ch-yb__head">
        <h3>{title}</h3>
        {meta && <span className="ch-yb__meta">{meta}</span>}
      </header>
      {children}
      {note && <p className="ch-yb__note">{note}</p>}
    </section>
  );
}

/** Figure cards with a change chip; the chip colour follows direction and whether lower is better. */
export function FigureCards({
  items,
}: {
  items: Array<{ label: string; value: string; unit?: string; delta?: number | null; deltaDigits?: number; lowerIsBetter?: boolean; context: string }>;
}) {
  return (
    <div className="ch-fg">
      {items.map((it) => {
        const d = it.delta;
        const flat = d != null && Math.abs(d) < (it.deltaDigits ? 0.05 : 0.5);
        const good = d != null && !flat && (it.lowerIsBetter ? d < 0 : d > 0);
        return (
          <div key={it.label} className="ch-fg__c">
            <span className="ch-fg__l">{it.label}</span>
            <span className="ch-fg__v ch-num">
              {it.value}
              {it.unit && it.value !== NO_DATA && <small>{it.unit}</small>}
            </span>
            <span className="ch-fg__d">
              {d != null && (
                <span className={`ch-delta ch-num ${flat ? 'is-flat' : good ? 'is-good' : 'is-bad'}`}>
                  <Icon icon={flat ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight} size={12} />
                  {formatSigned(d, it.deltaDigits ?? 0)}
                </span>
              )}
              <span>{it.context}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Scoring trend on a scoreboard: a smooth line (lower scores sit higher) over to-par tiles. */
export function ScoreBoardTrend({ rounds }: { rounds: Array<{ label: string; score: number; toPar: number | null }> }) {
  if (rounds.length === 0) return <p className="ch-gm-p__empty">No 18-hole rounds in this window.</p>;
  const w = 690;
  const h = 176;
  const padX = w / (rounds.length * 2);
  const lo = Math.min(...rounds.map((r) => r.score)) - 1;
  const hi = Math.max(...rounds.map((r) => r.score)) + 1;
  const x = (i: number) => (rounds.length === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (rounds.length - 1));
  const y = (v: number) => 28 + ((v - lo) / (hi - lo)) * (h - 36);
  const pts = rounds.map((r, i) => [x(i), y(r.score)] as [number, number]);
  const avg = rounds.reduce((a, r) => a + r.score, 0) / rounds.length;
  const ticks = [Math.ceil(lo), Math.round((lo + hi) / 2), Math.floor(hi)];
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Scores: ${rounds.map((r) => r.score).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="rgb(28 25 18 / .1)" />
            <text x={4} y={y(t) - 4} className="ch-ax">
              {t}
            </text>
          </g>
        ))}
        <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke="rgb(28 25 18 / .35)" strokeDasharray="2 3" />
        <text x={padX} y={y(avg) + 14} className="ch-ax">
          avg {avg.toFixed(1)}
        </text>
        {pts.length > 1 && <path d={monotonePath(pts)} fill="none" stroke="#1c1b18" strokeWidth={1.5} strokeLinecap="round" />}
        {pts.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 4.5 : 3.5} fill={i === pts.length - 1 ? '#1c1b18' : '#fbf8ef'} stroke="#1c1b18" strokeWidth={1.5} />
        ))}
      </svg>
      <div className="ch-board" style={{ ['--ch-n' as string]: rounds.length }}>
        {rounds.map((r, i) => {
          const tp = r.toPar;
          return (
            <div key={i} className="ch-board__c">
              <span className="ch-board__d">{r.label}</span>
              <span className={`ch-board__n ch-num ${tp == null ? '' : tp < 0 ? 'is-under' : tp === 0 ? 'is-even' : ''}`}>{formatToPar(tp)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Strokes gained by leg: diverging bars from a dashed zero (the baseline). */
export function LegBars({ rows, max }: { rows: Array<{ label: string; value: number | null }>; max?: number }) {
  const m = max ?? Math.max(0.5, ...rows.map((r) => Math.abs(r.value ?? 0))) * 1.1;
  return (
    <div className="ch-legbar">
      {rows.map((r) => (
        <div key={r.label} className="ch-legbar__r">
          <span className="ch-legbar__l">{r.label}</span>
          <span className="ch-legbar__track" aria-hidden="true">
            {r.value != null && (
              <span
                className={`ch-legbar__fill ${r.value >= 0 ? 'is-gain' : 'is-loss'}`}
                style={{ width: `${(Math.abs(r.value) / m) * 50}%` }}
              />
            )}
          </span>
          <span className={`ch-legbar__v ch-num ${r.value == null ? '' : r.value >= 0 ? 'ch-gain' : 'ch-loss'}`}>
            {r.value == null ? NO_DATA : formatSigned(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** You against the team and D1, as a scorecard table. */
export function FieldTable({
  rows,
  showTeam,
}: {
  rows: Array<{ label: string; you: number | null; team: number | null; d1: number | null; unit: '' | '%'; digits: number; lowerIsBetter: boolean }>;
  showTeam: boolean;
}) {
  const fmt = (v: number | null, r: (typeof rows)[number]) => (v == null ? NO_DATA : `${v.toFixed(r.digits)}${r.unit}`);
  const hasD1 = rows.some((r) => r.d1 != null);
  return (
    <table className="ch-ft">
      <thead>
        <tr>
          <th>Stat</th>
          <th>You</th>
          {showTeam && <th>Team</th>}
          {hasD1 && <th>D1</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const ref = showTeam ? r.team : r.d1;
          const good = r.you != null && ref != null ? (r.lowerIsBetter ? r.you <= ref : r.you >= ref) : null;
          return (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="ch-ft__you">
                <span className={`ch-num ${good == null ? '' : good ? 'ch-gain' : 'ch-loss'}`}>{fmt(r.you, r)}</span>
              </td>
              {showTeam && <td className="ch-num">{fmt(r.team, r)}</td>}
              {hasD1 && <td className="ch-num">{fmt(r.d1, r)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Putting read off rings around the cup: make rate by distance band, with the D1 rate beside it. */
export function PuttingRings({ bands }: { bands: Array<{ label: string; made: number; attempts: number; d1: number | null }> }) {
  const shown = bands.slice(0, 5);
  const cx = 130;
  const cy = 128;
  const radii = [26, 52, 76, 98, 118];
  const fills = ['#5d8f6d', '#7ea68a', '#9dbca6', '#bcd3c1', '#d6e5d9'];
  return (
    <svg viewBox="0 0 360 256" className="ch-pg" role="img" aria-label={shown.map((b) => `${b.label}: ${b.attempts ? Math.round((b.made / b.attempts) * 100) : 0}%`).join(', ')}>
      {[...radii].reverse().map((r, i) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill={fills[fills.length - 1 - i]} className="ch-pg-ring" />
      ))}
      <circle cx={cx} cy={cy} r={6} fill="#1c1b18" />
      <line x1={cx} x2={cx} y1={cy} y2={cy - 24} stroke="#1c1b18" strokeWidth={1.5} />
      <path d={`M${cx},${cy - 24} l12,4 l-12,4 z`} className="ch-pg-flag" />
      {shown.map((b, i) => {
        const pct = b.attempts ? Math.round((b.made / b.attempts) * 100) : null;
        const ang = (-50 + i * 14) * (Math.PI / 180);
        const rr = (radii[i] ?? 0) - 8;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr;
        const ly = 32 + i * 24;
        const below = pct != null && b.d1 != null && b.attempts >= 10 && pct < b.d1;
        return (
          <g key={b.label}>
            <line x1={px} y1={py} x2={252} y2={ly - 4} className="ch-pg-leader" />
            <circle cx={px} cy={py} r={2.5} fill="#1c1b18" />
            <text x={258} y={ly} className="ch-pg-lbl">
              {b.label}{' '}
              <tspan className={`ch-pg-pct${below ? ' is-below' : ''}`}>{pct == null ? NO_DATA : `${pct}%`}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ScoreMix({ d }: { d: { eagle: number; birdie: number; par: number; bogey: number; double: number } }) {
  const segs: Array<[string, number, string]> = [
    ['Eagle+', d.eagle, 'is-eagle'],
    ['Birdie', d.birdie, 'is-birdie'],
    ['Par', d.par, 'is-par'],
    ['Bogey', d.bogey, 'is-bogey'],
    ['Double+', d.double, 'is-double'],
  ];
  const tot = segs.reduce((a, s) => a + s[1], 0) || 1;
  return (
    <div className="ch-mix">
      <div className="ch-mix__bar" role="img" aria-label={segs.map(([l, v]) => `${l} ${v.toFixed(1)}`).join(', ')}>
        {segs.map(([l, v, c]) => (v > 0 ? <span key={l} className={`ch-mix__s ${c}`} style={{ flex: v / tot }} /> : null))}
      </div>
      <div className="ch-mix__k">
        {segs.map(([l, v, c]) => (
          <span key={l}>
            <i className={c} />
            <b className="ch-num">{v < 0.1 && v > 0 ? v.toFixed(2) : v.toFixed(1)}</b>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ParTiles({ rows }: { rows: Array<{ par: number; avg: number | null; d1: number | null }> }) {
  return (
    <div className="ch-par3">
      {rows.map((r) => (
        <div key={r.par} className="ch-par3__t">
          <span className="ch-par3__l">Par {r.par}s</span>
          <span className="ch-par3__v ch-num">{r.avg == null ? NO_DATA : r.avg.toFixed(2)}</span>
          <span className="ch-par3__to ch-num">{r.avg == null ? 'No holes' : `${formatSigned(r.avg - r.par, 2)} to par`}</span>
          {r.d1 != null && <span className="ch-par3__d ch-num">D1 {r.d1.toFixed(2)}</span>}
        </div>
      ))}
    </div>
  );
}

export function FairwayStrip({ left, fw, right }: { left: number; fw: number; right: number }) {
  const bias = left - right;
  return (
    <div className="ch-fws">
      <div className="ch-fws__strip">
        <span className="ch-fws__z is-rough" style={{ flex: Math.max(left, 1) }}>
          <b className="ch-num">{Math.round(left)}%</b>
          <em>Left</em>
        </span>
        <span className="ch-fws__z is-fw" style={{ flex: Math.max(fw, 1) }}>
          <b className="ch-num">{Math.round(fw)}%</b>
          <em>Fairway</em>
        </span>
        <span className="ch-fws__z is-rough" style={{ flex: Math.max(right, 1) }}>
          <b className="ch-num">{Math.round(right)}%</b>
          <em>Right</em>
        </span>
      </div>
      <div className="ch-fws__cap">
        <span>Miss bias</span>
        <b>{Math.abs(bias) < 1 ? 'Even' : `${bias > 0 ? 'Left' : 'Right'} by ${Math.round(Math.abs(bias))} ${Math.round(Math.abs(bias)) === 1 ? 'pt' : 'pts'}`}</b>
      </div>
    </div>
  );
}

export function Compare({ rows, unit = '', max }: { rows: Array<{ label: string; value: number | null; sub?: string }>; unit?: string; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="ch-cmp">
      {rows.map((r) => (
        <div key={r.label} className="ch-cmp__r">
          <span className="ch-cmp__l">
            {r.label}
            {r.sub && <em>{r.sub}</em>}
          </span>
          <span className="ch-cmp__bar" aria-hidden="true">
            {r.value != null && <span style={{ width: `${Math.min(100, (r.value / m) * 100)}%` }} />}
          </span>
          <b className="ch-num">{r.value == null ? NO_DATA : `${Math.round(r.value * 10) / 10}${unit}`}</b>
        </div>
      ))}
    </div>
  );
}

/** Bars by distance band with a dashed benchmark tick; bars are the player, ticks are D1. */
export function Ladder({
  rows,
  unit,
  label,
  invert = false,
}: {
  rows: Array<{ band: string; value: number | null; d1: number | null }>;
  unit: string;
  label: string;
  invert?: boolean;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.d1 ?? 0])) * 1.1;
  return (
    <div className="ch-lad" style={{ ['--ch-n' as string]: rows.length }}>
      {rows.map((r) => {
        const tone = r.value == null || r.d1 == null ? 'is-neutral' : (invert ? r.value <= r.d1 : r.value >= r.d1) ? 'is-gain' : 'is-loss';
        return (
          <div key={r.band} className="ch-lad__c">
            <span className={`ch-lad__v ch-num ${tone === 'is-gain' ? 'ch-gain' : tone === 'is-loss' ? 'ch-loss' : ''}`}>
              {r.value == null ? NO_DATA : `${Math.round(r.value)}${unit}`}
            </span>
            <span className="ch-lad__col">
              {r.value != null && <span className={`ch-lad__fill ${tone}`} style={{ height: `${(r.value / max) * 100}%` }} />}
              {r.d1 != null && <span className="ch-lad__d1" style={{ bottom: `${(r.d1 / max) * 100}%` }} />}
            </span>
            <span className="ch-lad__b ch-num">{r.band}</span>
          </div>
        );
      })}
      <span className="ch-lad__axis">{label}</span>
    </div>
  );
}

export function GreenMiss({ m }: { m: Record<'ll' | 'lg' | 'lr' | 'l' | 'r' | 'sl' | 's' | 'sr', number | null> }) {
  const cells: Array<[string, number | null | 'green']> = [
    ['Long left', m.ll],
    ['Long', m.lg],
    ['Long right', m.lr],
    ['Left', m.l],
    ['Green', 'green'],
    ['Right', m.r],
    ['Short left', m.sl],
    ['Short', m.s],
    ['Short right', m.sr],
  ];
  const max = Math.max(1, ...Object.values(m).map((v) => v ?? 0));
  return (
    <div className="ch-gmiss">
      {cells.map(([l, v]) =>
        v === 'green' ? (
          <span key={l} className="ch-gmiss__g">
            <Icon icon={Flag} size={16} />
            <em>Green</em>
          </span>
        ) : (
          <span key={l} className="ch-gmiss__c" style={{ background: `rgb(154 101 18 / ${0.05 + ((v ?? 0) / max) * 0.32})` }}>
            <b className="ch-num">{v == null ? NO_DATA : `${Math.round(v)}%`}</b>
            <em>{l}</em>
          </span>
        ),
      )}
    </div>
  );
}

/** Make rate by distance: the player's line against D1's dashed line. Bands under 10 putts aren't graded. */
export function MakeCurve({ bands }: { bands: Array<{ band: string; value: number | null; d1: number | null; n: number }> }) {
  const w = 760;
  const h = 210;
  const pl = 64;
  const pr = 44;
  const pt = 26;
  const pb = 36;
  const x = (i: number) => pl + (i * (w - pl - pr)) / Math.max(1, bands.length - 1);
  const y = (v: number) => pt + ((100 - v) / 100) * (h - pt - pb);
  const you = bands.map((b, i) => (b.value == null ? null : ([x(i), y(b.value)] as [number, number]))).filter((p): p is [number, number] => !!p);
  const d1 = bands.map((b, i) => (b.d1 == null ? null : ([x(i), y(b.d1)] as [number, number]))).filter((p): p is [number, number] => !!p);
  const line = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ch-mk" role="img" aria-label={bands.map((b) => `${b.band} feet ${b.value == null ? 'no data' : `${Math.round(b.value)}%`}`).join(', ')}>
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke="var(--ch-ivory-200)" />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end" className="ch-tick">
            {t}%
          </text>
        </g>
      ))}
      {d1.length > 1 && <path d={line(d1)} fill="none" stroke="var(--ch-champagne-500)" strokeDasharray="4 4" strokeWidth={1.5} />}
      {you.length > 1 && (
        <>
          <path d={`${line(you)} L${you[you.length - 1]![0]},${y(0)} L${you[0]![0]},${y(0)} Z`} fill="var(--ch-chart-gain)" opacity={0.07} />
          <path d={line(you)} fill="none" stroke="var(--ch-green-700)" strokeWidth={2.25} strokeLinejoin="round" />
        </>
      )}
      {bands.map((b, i) => {
        const graded = b.value != null && b.d1 != null && b.n >= 10;
        const good = graded && b.value! >= b.d1!;
        return (
          <g key={b.band}>
            {b.value != null && (
              <>
                <circle cx={x(i)} cy={y(b.value)} r={4.5} fill="var(--ch-ivory-25)" stroke={!graded ? 'var(--ch-ink-400)' : good ? 'var(--ch-chart-gain)' : 'var(--ch-chart-loss)'} strokeWidth={2} />
                <text x={i === 0 ? x(i) + 9 : x(i)} y={y(b.value) - 10} textAnchor={i === 0 ? 'start' : 'middle'} className={`ch-mk__v ${!graded ? '' : good ? 'is-gain' : 'is-loss'}`}>
                  {Math.round(b.value)}%
                </text>
              </>
            )}
            <text x={x(i)} y={h - 16} textAnchor="middle" className="ch-mk__b">
              {b.band} ft
            </text>
            <text x={x(i)} y={h - 3} textAnchor="middle" className="ch-mk__n">
              {b.n} putts
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CupMiss({ m }: { m: { left: number | null; right: number | null; short: number | null; long: number | null; low: number | null; high: number | null } }) {
  const p = (v: number | null) => (v == null ? NO_DATA : `${Math.round(v)}%`);
  const lowHeavy = m.low != null && m.high != null && m.low > 55;
  return (
    <div className="ch-cup">
      <div className="ch-cup__ring" role="img" aria-label={`Misses: long ${p(m.long)}, short ${p(m.short)}, left ${p(m.left)}, right ${p(m.right)}`}>
        <span className="ch-cup__hole" />
        <span className="ch-cup__lbl is-long">
          <b className="ch-num">{p(m.long)}</b>Long
        </span>
        <span className="ch-cup__lbl is-short">
          <b className="ch-num">{p(m.short)}</b>Short
        </span>
        <span className="ch-cup__lbl is-left">
          <b className="ch-num">{p(m.left)}</b>Left
        </span>
        <span className="ch-cup__lbl is-right">
          <b className="ch-num">{p(m.right)}</b>Right
        </span>
      </div>
      {m.low != null && m.high != null && (
        <div className="ch-cup__side">
          <span className="ch-cup__st">Missed side</span>
          <div className="ch-cup__split">
            <span className="is-low" style={{ flex: Math.max(m.low, 1) }}>
              <b className="ch-num">{p(m.low)}</b>Low side
            </span>
            <span className="is-high" style={{ flex: Math.max(m.high, 1) }}>
              <b className="ch-num">{p(m.high)}</b>High side
            </span>
          </div>
          <p>
            {lowHeavy
              ? 'Most misses finish below the hole, which usually means not enough break was played.'
              : 'Misses are split between the low and high side.'}
          </p>
        </div>
      )}
    </div>
  );
}
