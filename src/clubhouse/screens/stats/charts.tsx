import { ArrowDownRight, ArrowUpRight, Flag, Minus } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { ChSgChange } from '../../data/stats-common';
import { Icon } from '../../ui/Icon';
import { monotonePath } from '../../lib/chart';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { sgScale, sgShare } from '../../lib/sg';

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
  items: Array<{
    label: string;
    value: string;
    unit?: string;
    delta?: number | null;
    deltaDigits?: number;
    lowerIsBetter?: boolean;
    context: string;
    /** A second line under the context: what the figure is measured against. */
    note?: string;
    /** Green for a gain and amber for a loss (strokes gained), on the value itself. */
    tone?: 'gain' | 'loss';
    /** The catalog state this card is in, when it is one (found by `data-ch-code`). */
    code?: string;
  }>;
}) {
  return (
    <div className="ch-fg" style={{ ['--ch-fg-n' as string]: items.length }}>
      {items.map((it) => {
        const d = it.delta;
        const flat = d != null && Math.abs(d) < (it.deltaDigits ? 0.05 : 0.5);
        const good = d != null && !flat && (it.lowerIsBetter ? d < 0 : d > 0);
        return (
          <div key={it.label} className="ch-fg__c" data-ch-code={it.code}>
            <span className="ch-fg__l">{it.label}</span>
            <span className={'ch-fg__v ch-num' + (it.tone ? ` ch-${it.tone}` : '')}>
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
            {it.note && <span className="ch-fg__n">{it.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * How strokes gained moved against the previous 10 rounds: a small chip (green up, amber down, grey flat)
 * and, where there is nothing to compare, the reason in words ("No earlier rounds").
 */
export function SgChangeChip({ change, code }: { change: ChSgChange; code?: string }) {
  const d = change.delta;
  const flat = d != null && Math.abs(d) < 0.05;
  return (
    <span className="ch-sgchg">
      {d != null && (
        <span className={`ch-delta ch-num ${flat ? 'is-flat' : d > 0 ? 'is-good' : 'is-bad'}`}>
          <Icon icon={flat ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight} size={12} />
          {formatSigned(d)}
        </span>
      )}
      {change.context && <span data-ch-code={d == null ? code : undefined}>{change.context}</span>}
    </span>
  );
}

/** Scoring trend on a scoreboard: a smooth line (lower scores sit higher) over to-par tiles. */
export function ScoreBoardTrend({ rounds }: { rounds: Array<{ label: string; score: number; toPar: number | null }> }) {
  if (rounds.length === 0) return <p className="ch-gm-p__empty">No rounds in this window.</p>;
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

/**
 * Strokes gained by leg, walked from tee to hole (design system:
 * StrokesGainedRoute). Each leg is a stop on a dotted line; its bar rises
 * for a gain (green) or hangs for a loss (amber). A leg with no data is a
 * stop with a dash.
 */
export function LegRoute({ rows }: { rows: Array<{ label: string; value: number | null }> }) {
  const W = 360;
  const H = 220;
  const mid = H / 2;
  const P = 38;
  const step = (W - P * 2) / Math.max(1, rows.length - 1);
  // The scale is the data's own (its largest leg rounded up, at least 1), so a bar's height is its value.
  const m = sgScale(rows.map((r) => r.value));
  const hh = mid - 46;
  const summary = rows.map((r) => `${r.label} ${r.value == null ? 'no data' : formatSigned(r.value)}`).join(', ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ch-route" role="img" aria-label={`Strokes gained per round by leg: ${summary}`}>
      <line x1={P - 24} x2={W - P + 24} y1={mid} y2={mid} stroke="var(--ch-ink-900)" strokeWidth="2" strokeDasharray="0.5 7" strokeLinecap="round" />
      {rows.map((r, i) => {
        const x = P + i * step;
        const v = r.value;
        const h = v == null ? 0 : sgShare(v, m) * hh;
        const pos = v == null || v >= 0;
        return (
          <g key={r.label}>
            {v != null && <rect x={x - 10} y={pos ? mid - h : mid} width="20" height={h} rx="4" className={pos ? 'is-pos' : 'is-neg'} />}
            <circle cx={x} cy={mid} r="6.5" fill="var(--ch-chart-paper)" stroke="var(--ch-ink-900)" strokeWidth="2" />
            <text x={x} y={pos ? mid - h - 9 : mid + h + 19} textAnchor="middle" className={`ch-route__v ${v == null ? '' : pos ? 'is-pos' : 'is-neg'}`}>
              {v == null ? NO_DATA : formatSigned(v)}
            </text>
            <text x={x} y={pos ? mid + 24 : mid - 16} textAnchor="middle" className="ch-route__k">
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Strokes gained by leg on the phone: a bar either side of zero on a scale the
 * data sets (the largest value shown, rounded up, at least 1), so a bar's length
 * is its value. The total sits under the legs on the same scale.
 */
export function SgBars({ rows }: { rows: Array<{ label: string; value: number | null; total?: boolean }> }) {
  const scale = sgScale(rows.map((r) => r.value));
  return (
    <div className="ch-stm-legs">
      {rows.map(({ label, value: v, total }) => (
        <div key={label} className={'ch-stm-leg' + (total ? ' is-total' : '')}>
          <span>{label}</span>
          <span className="ch-stm-leg__bar" aria-hidden="true">
            <i className="ch-stm-leg__z" />
            {v != null && (
              <i
                className={'ch-stm-leg__v ' + (v >= 0 ? 'is-gain' : 'is-loss')}
                style={{
                  [v >= 0 ? 'left' : 'right']: '50%',
                  width: `${sgShare(v, scale) * 50}%`,
                }}
              />
            )}
          </span>
          <b className={'ch-num ' + (v == null ? '' : v >= 0 ? 'ch-gain' : 'ch-loss')}>{v == null ? NO_DATA : formatSigned(v)}</b>
        </div>
      ))}
    </div>
  );
}

/**
 * You against the team and the Tour, as a scorecard table. Rows may be grouped under headings (the standing board:
 * strokes gained, scoring, putting ...); a row under its sample floor says what it needs (CH-5318).
 */
export function FieldTable({
  rows,
  showTeam,
}: {
  rows: Array<{
    label: string;
    group?: string;
    you: number | null;
    team: number | null;
    bench: number | null;
    unit: '' | '%' | ' ft';
    digits: number;
    lowerIsBetter: boolean;
    sg?: boolean;
    signed?: boolean;
    floor?: string;
  }>;
  showTeam: boolean;
}) {
  // Strokes gained reads with its sign and is green when gained, amber when lost (against the Tour); every other row is better or worse than its reference.
  const fmt = (v: number | null, r: (typeof rows)[number]) => (v == null ? NO_DATA : r.sg || r.signed ? `${formatSigned(v, r.digits)}${r.unit}` : `${v.toFixed(r.digits)}${r.unit}`);
  const signTone = (v: number | null, r: (typeof rows)[number]) => (r.sg && v != null ? (v >= 0 ? 'ch-gain' : 'ch-loss') : '');
  const hasBench = rows.some((r) => r.bench != null);
  const cols = 2 + (showTeam ? 1 : 0) + (hasBench ? 1 : 0);
  return (
    <table className="ch-ft">
      <thead>
        <tr>
          <th>Stat</th>
          <th>You</th>
          {showTeam && <th>Team</th>}
          {hasBench && <th>Tour</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          // Better or worse than the team where a coach has one, and than the Tour where the row has no team figure.
          const ref = showTeam ? (r.team ?? r.bench) : r.bench;
          const good = r.you != null && ref != null ? (r.lowerIsBetter ? r.you <= ref : r.you >= ref) : null;
          return (
            <Fragment key={r.label}>
              {r.group && r.group !== rows[i - 1]?.group && (
                <tr className="ch-ft__g">
                  <th colSpan={cols} scope="colgroup">
                    {r.group}
                  </th>
                </tr>
              )}
              <tr>
                <td>
                  {r.label}
                  {r.you == null && r.floor && (
                    <em className="ch-ft__floor" data-ch-code="CH-5318">
                      {r.floor}
                    </em>
                  )}
                </td>
                <td className="ch-ft__you">
                  <span className={`ch-num ${r.sg ? signTone(r.you, r) : good == null ? '' : good ? 'ch-gain' : 'ch-loss'}`}>{fmt(r.you, r)}</span>
                </td>
                {showTeam && <td className="ch-num">{fmt(r.team, r)}</td>}
                {hasBench && <td className="ch-num">{fmt(r.bench, r)}</td>}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Putting read off rings around the cup: make rate by distance band, with the Tour rate beside it. */
export function PuttingRings({ bands }: { bands: Array<{ label: string; made: number; attempts: number; bench: number | null }> }) {
  // Geometry from the design system's PuttingGreen (charts/geom.jsx `green`): rings by
  // distance, each shaded by its make rate, the pin at the centre, labels on leaders.
  const shown = bands.slice(0, 5);
  const W = 360;
  const cx = 124;
  const cy = 128;
  const radii = [18, 38, 62, 92, 120];
  const rate = (b: (typeof shown)[number]) => (b.attempts ? b.made / b.attempts : null);
  return (
    <svg viewBox={`0 0 ${W} 256`} className="ch-pg" role="img" aria-label={shown.map((b) => `${b.label}: ${b.attempts ? `${Math.round((b.made / b.attempts) * 100)}%` : 'no putts'}`).join(', ')}>
      {shown
        .map((b, i) => ({ b, r: radii[i]!, p: rate(b) }))
        .reverse()
        .map(({ b, r, p }) => (
          <g key={b.label}>
            <circle cx={cx} cy={cy} r={r} fill="var(--ch-chart-paper)" />
            {/* A band with no putts stays neutral, never a pale 0%. */}
            <circle cx={cx} cy={cy} r={r} fill={p == null ? 'var(--ch-ivory-200)' : 'var(--ch-green-500)'} fillOpacity={p == null ? 1 : 0.1 + p * 0.85} className="ch-pg-ring" />
          </g>
        ))}
      <circle cx={cx} cy={cy} r={4} fill="var(--ch-ink-900)" />
      <line x1={cx} x2={cx} y1={cy} y2={cy - 30} stroke="var(--ch-ink-900)" strokeWidth={1.5} />
      <path d={`M${cx} ${cy - 30} l14 5 -14 5z`} className="ch-pg-flag" />
      {shown.map((b, i) => {
        const pct = b.attempts ? Math.round((b.made / b.attempts) * 100) : null;
        const rm = i ? (radii[i]! + radii[i - 1]!) / 2 : radii[0]! / 2 + 3;
        const px = cx + rm * Math.cos(-0.6);
        const py = cy + rm * Math.sin(-0.6) - (4 - i) * 4;
        const ly = 26 + i * 24;
        const below = pct != null && b.bench != null && b.attempts >= 10 && pct < b.bench;
        return (
          <g key={b.label}>
            <circle cx={px} cy={py} r={2.5} fill="var(--ch-ink-900)" />
            <polyline points={`${px},${py} ${W - 96},${ly} ${W - 90},${ly}`} className="ch-pg-leader" />
            <text x={W - 86} y={ly} dy=".34em" className="ch-pg-lbl">
              <tspan className="ch-pg-band">{b.label}</tspan>{' '}
              <tspan className={`ch-pg-pct${below ? ' is-below' : ''}`}>{pct == null ? NO_DATA : `${pct}%`}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Mix = { eagle: number; birdie: number; par: number; bogey: number; double: number };

/** The mix of holes: per round, and with `totals` the holes behind it and each result's share ("46 of 180 holes"). */
export function ScoreMix({ d, totals }: { d: Mix; totals?: Mix }) {
  const segs: Array<[string, number, string, number | null]> = [
    ['Eagle+', d.eagle, 'is-eagle', totals?.eagle ?? null],
    ['Birdie', d.birdie, 'is-birdie', totals?.birdie ?? null],
    ['Par', d.par, 'is-par', totals?.par ?? null],
    ['Bogey', d.bogey, 'is-bogey', totals?.bogey ?? null],
    ['Double+', d.double, 'is-double', totals?.double ?? null],
  ];
  const tot = segs.reduce((a, s) => a + s[1], 0) || 1;
  const holes = totals ? totals.eagle + totals.birdie + totals.par + totals.bogey + totals.double : 0;
  return (
    <div className="ch-mix">
      <div className="ch-mix__bar" role="img" aria-label={segs.map(([l, v]) => `${l} ${v.toFixed(1)}`).join(', ')}>
        {segs.map(([l, v, c]) => (v > 0 ? <span key={l} className={`ch-mix__s ${c}`} style={{ flex: v / tot }} /> : null))}
      </div>
      <div className="ch-mix__k">
        {segs.map(([l, v, c, n]) => (
          <span key={l}>
            <i className={c} />
            <b className="ch-num">{v < 0.1 && v > 0 ? v.toFixed(2) : v.toFixed(1)}</b>
            {l}
            {n != null && holes > 0 && (
              <small className="ch-num">
                {n} of {holes} holes · {Math.round((n / holes) * 100)}%
              </small>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ParTiles({ rows }: { rows: Array<{ par: number; avg: number | null; bench: number | null }> }) {
  return (
    <div className="ch-par3">
      {rows.map((r) => (
        <div key={r.par} className="ch-par3__t">
          <span className="ch-par3__l">Par {r.par}s</span>
          <span className="ch-par3__v ch-num">{r.avg == null ? NO_DATA : r.avg.toFixed(2)}</span>
          {/* Against the Tour's average for the par when there is one (lower is better), so the colour says how it compares (F-54). */}
          <span className={'ch-par3__to ch-num' + (r.avg == null || r.bench == null || Math.abs(r.avg - r.bench) < 0.005 ? '' : r.avg < r.bench ? ' ch-gain' : ' ch-loss')}>
            {r.avg == null ? 'No holes' : `${formatSigned(r.avg - r.par, 2)} to par`}
          </span>
          {r.bench != null && <span className="ch-par3__d ch-num">Tour {r.bench.toFixed(2)}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * Where drives finish, every zone a share of the same tee shots (the fairway opportunities, par 4s and 5s with a known result):
 * left, fairway and right from their counts, and the misses with no side logged as "Other", so the zones add up to the whole.
 */
export function FairwayStrip({ opportunities, hit, left: leftN, right: rightN }: { opportunities: number; hit: number; left: number; right: number }) {
  const share = (n: number) => (n / opportunities) * 100;
  const fw = share(hit);
  const left = share(leftN);
  const right = share(rightN);
  const other = share(Math.max(0, opportunities - hit - leftN - rightN));
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
        {other > 0 && (
          <span className="ch-fws__z is-rough" style={{ flex: Math.max(other, 1) }}>
            <b className="ch-num">{Math.round(other)}%</b>
            <em>Other</em>
          </span>
        )}
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
          {/* Percentages are whole numbers everywhere else in Stats ("55.6%" beside "50%" read as noise, F-54). */}
          <b className="ch-num">{r.value == null ? NO_DATA : `${unit === '%' ? Math.round(r.value) : Math.round(r.value * 10) / 10}${unit}`}</b>
        </div>
      ))}
    </div>
  );
}

/** Bars by distance band with a dashed benchmark tick; bars are the player, ticks are the Tour. */
export function Ladder({
  rows,
  unit,
  label,
  invert = false,
}: {
  rows: Array<{ band: string; value: number | null; bench: number | null }>;
  unit: string;
  label: string;
  invert?: boolean;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.bench ?? 0])) * 1.1;
  return (
    <div className="ch-lad" style={{ ['--ch-n' as string]: rows.length }}>
      {rows.map((r) => {
        const tone = r.value == null || r.bench == null ? 'is-neutral' : (invert ? r.value <= r.bench : r.value >= r.bench) ? 'is-gain' : 'is-loss';
        return (
          <div key={r.band} className="ch-lad__c">
            <span className={`ch-lad__v ch-num ${tone === 'is-gain' ? 'ch-gain' : tone === 'is-loss' ? 'ch-loss' : ''}`}>
              {r.value == null ? NO_DATA : `${Math.round(r.value)}${unit}`}
            </span>
            <span className="ch-lad__col">
              {r.value != null && <span className={`ch-lad__fill ${tone}`} style={{ height: `${(r.value / max) * 100}%` }} />}
              {r.bench != null && <span className="ch-lad__bench" style={{ bottom: `${(r.bench / max) * 100}%` }} />}
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

/** Make rate by distance: the player's line against the Tour's dashed line. Bands under 10 putts aren't graded. */
/**
 * Make rate by distance on the phone, as the board draws it (m-stats.jsx Putting, m.css .m-putt): a row per band, the
 * bar in green or amber under the Tour's tick, the rate on the right. The desktop curve's labels are unreadable at
 * phone width (F-54). A band grades only with 10 or more putts, as on desktop.
 */
export function MakeRows({ bands }: { bands: Array<{ band: string; value: number | null; bench: number | null; n: number }> }) {
  return (
    <div className="ch-stm-putt">
      {bands.map((b) => {
        const low = b.value != null && b.bench != null && b.n >= 10 && b.value < b.bench;
        return (
          <div key={b.band} className="ch-stm-putt__r">
            <span className="ch-num">{b.band} ft</span>
            <span className="ch-stm-putt__bar" aria-hidden="true">
              {b.value != null && <i className={low ? 'is-low' : ''} style={{ width: `${Math.min(100, b.value)}%` }} />}
              {b.bench != null && <em style={{ left: `${b.bench}%` }} />}
            </span>
            <b className={'ch-num' + (low ? ' ch-loss' : '')}>{b.value == null ? NO_DATA : `${Math.round(b.value)}%`}</b>
          </div>
        );
      })}
    </div>
  );
}

export function MakeCurve({ bands }: { bands: Array<{ band: string; value: number | null; bench: number | null; n: number }> }) {
  const w = 760;
  const h = 210;
  const pl = 64;
  const pr = 44;
  const pt = 26;
  const pb = 36;
  const x = (i: number) => pl + (i * (w - pl - pr)) / Math.max(1, bands.length - 1);
  const y = (v: number) => pt + ((100 - v) / 100) * (h - pt - pb);
  const you = bands.map((b, i) => (b.value == null ? null : ([x(i), y(b.value)] as [number, number]))).filter((p): p is [number, number] => !!p);
  const tourPts = bands.map((b, i) => (b.bench == null ? null : ([x(i), y(b.bench)] as [number, number]))).filter((p): p is [number, number] => !!p);
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
      {tourPts.length > 1 && <path d={line(tourPts)} fill="none" stroke="var(--ch-champagne-500)" strokeDasharray="4 4" strokeWidth={1.5} />}
      {you.length > 1 && (
        <>
          <path d={`${line(you)} L${you[you.length - 1]![0]},${y(0)} L${you[0]![0]},${y(0)} Z`} fill="var(--ch-chart-gain)" opacity={0.07} />
          <path d={line(you)} fill="none" stroke="var(--ch-green-700)" strokeWidth={2.25} strokeLinejoin="round" />
        </>
      )}
      {bands.map((b, i) => {
        const graded = b.value != null && b.bench != null && b.n >= 10;
        const good = graded && b.value! >= b.bench!;
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
