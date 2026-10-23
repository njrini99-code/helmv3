import { ArrowDownRight, ArrowUpRight, Flag, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChSgChange } from '../../data/stats-common';
import type { ChGauge } from '../../data/stats-team';
import { Icon } from '../../ui/Icon';
import { SerifText } from '../../ui/SerifText';
import { changeTone, formatSigned, NO_DATA } from '../../lib/format';
import { sgScale } from '../../lib/sg';
import { deltaTone, deltaWords, type DeltaTone } from '../../lib/stats-signal';

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
        {/* A page section, so an h2 under the page's h1 (P005-D7: the h3 skipped a level). */}
        <h2>
          <SerifText text={title} />
        </h2>
        {meta && <span className="ch-yb__meta">{meta}</span>}
      </header>
      {children}
      {note && <p className="ch-yb__note">{note}</p>}
    </section>
  );
}

/**
 * A figure drawn against the reference its data gives (owner, 2026-10-07: no bare numbers), on one 6px track so the row
 * reads as a set: strokes gained from the Tour's zero (to an end the value itself sets, `sgScale`: whole strokes, never
 * under one, so nothing clamps), the scoring average from par (six), a rate along 0 to 100 with the Tour's mark when there
 * is one (green at or above it, amber below, neutral ink with no mark to judge by), putts on a track to 40 marked at 36
 * (two on every green), birdies as holes out of 18. Decorative: the value and its words say it.
 */
export function FigureGauge({ gauge, n }: { gauge: ChGauge; n: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  if (gauge.kind === 'holes') {
    return (
      <span className="ch-fg__gauge ch-fg__gauge--holes" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={i < Math.floor(n) ? undefined : i === Math.floor(n) ? { ['--ch-fg-part' as string]: pct((n % 1) * 100) } : { ['--ch-fg-part' as string]: '0%' }} />
        ))}
        <em>of 18 holes</em>
      </span>
    );
  }
  if (gauge.kind === 'sg' || gauge.kind === 'par') {
    const v = gauge.kind === 'sg' ? n : gauge.toPar;
    if (v == null) return null;
    const end = gauge.kind === 'sg' ? sgScale([v]) : 6;
    const w = pct((Math.abs(v) / end) * 50);
    // Strokes gained above zero is good; a score above par is not; a value that shows as zero is neither.
    const tone = changeTone(v, gauge.kind !== 'sg', 1);
    const right = gauge.kind === 'sg' ? v >= 0 : v > 0;
    return (
      <span className="ch-fg__gauge" aria-hidden="true">
        <span className="ch-fg__track">
          <i className={tone} style={right ? { left: '50%', width: w } : { right: '50%', width: w }} />
          <b style={{ left: '50%' }} />
        </span>
        <em style={{ left: '50%' }}>{gauge.kind === 'sg' ? 'Tour' : 'Par'}</em>
      </span>
    );
  }
  if (gauge.kind === 'putts') {
    return (
      <span className="ch-fg__gauge" aria-hidden="true">
        <span className="ch-fg__track">
          <i className={n <= 36 ? 'is-gain' : 'is-loss'} style={{ left: 0, width: pct((n / 40) * 100) }} />
          <b style={{ left: '90%' }} />
        </span>
        <em style={{ left: '90%' }}>36</em>
      </span>
    );
  }
  return (
    <span className="ch-fg__gauge" aria-hidden="true">
      <span className="ch-fg__track">
        <i className={gauge.ref == null ? 'is-neutral' : n >= gauge.ref ? 'is-gain' : 'is-loss'} style={{ left: 0, width: pct(n) }} />
        {gauge.ref != null && <b style={{ left: pct(gauge.ref) }} />}
      </span>
      {gauge.ref != null && <em style={{ left: pct(gauge.ref) }}>{gauge.refLabel ?? 'Tour'}</em>}
    </span>
  );
}

/** The chip class for a change's tone (stats-signal `deltaTone`): green better, amber worse, neutral ink when it is no clear change. */
export function deltaClass(tone: DeltaTone): 'is-good' | 'is-bad' | 'is-flat' {
  return tone === 'is-gain' ? 'is-good' : tone === 'is-loss' ? 'is-bad' : 'is-flat';
}

/**
 * How strokes gained moved against the previous 10 rounds: the signed change and what it amounts to. Green or amber only when the
 * change clears its standard error ("Better than previous 10"); otherwise neutral ink and "No clear change vs previous 10", the number
 * still shown (decision Q4). Where there is nothing to compare, the reason in words ("No earlier rounds"). `subject` names the figure
 * when the chip sits away from it ("SG a round").
 */
export function SgChangeChip({ change, code, subject }: { change: ChSgChange; code?: string; subject?: string }) {
  const d = change.delta;
  const tone = deltaTone(d, change.se, false);
  const words = d != null ? deltaWords(d, tone, change.context || 'vs previous 10') : change.context;
  const said = subject ? (words ? `${subject} · ${words}` : subject) : words;
  return (
    <span className="ch-sgchg">
      {d != null && (
        <span className={`ch-delta ch-num ${deltaClass(tone)}`}>
          <Icon icon={tone === '' ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight} size={12} />
          {formatSigned(d)}
        </span>
      )}
      {said && <span data-ch-code={d == null ? code : undefined}>{said}</span>}
    </span>
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
        // Every dot sits on one ray to the right of the cup, nearest ring first, and the labels step down in the same order, so no two
        // leaders cross and none runs through another label.
        const rm = i ? (radii[i]! + radii[i - 1]!) / 2 : radii[0]! / 2 + 3;
        const px = cx + rm;
        const py = cy;
        const ly = 26 + i * 24;
        const below = pct != null && b.bench != null && b.attempts >= 10 && pct < b.bench;
        return (
          <g key={b.label}>
            <circle cx={px} cy={py} r={2.5} fill="var(--ch-ink-900)" />
            <polyline points={`${px},${py} ${W - 96},${ly} ${W - 90},${ly}`} className="ch-pg-leader" />
            <text x={W - 86} y={ly} dy=".34em" className="ch-pg-band">
              {b.label}
            </text>
            <text x={W} y={ly} dy=".34em" textAnchor="end" className={`ch-pg-pct${below ? ' is-below' : ''}`}>
              {pct == null ? NO_DATA : `${pct}%`}
            </text>
          </g>
        );
      })}
    </svg>
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

export interface LadderRow {
  band: string;
  value: number | null;
  bench: number | null;
  /** The shots behind the band, when the source keeps a count per band (the calculator's GIR and finish bands keep only the averages). */
  n?: number | null;
  /** The sample a band needs before it is graded: a band with shots under it reads "Needs 10", not "No shots". */
  floor?: number | null;
}

/**
 * One row per distance band, for a phone (a seven-band column chart is cramped there and its labels wrap): the band, a bar on a track,
 * the exact value, and the shots behind it when they are known. A band with no shots says "No shots", which is not 0%. A percentage
 * bar is on the 0 to 100 scale, so a 100% bar fills its track; a distance in feet is on the largest value and tick, and shorter is better.
 */
export function BandRows({ rows, unit, label, invert = false, none = 'No shots', code }: { rows: LadderRow[]; unit: string; label: string; invert?: boolean; none?: string; code?: string }) {
  const max = unit === '%' ? 100 : Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.bench ?? 0])) * 1.1;
  return (
    <div className="ch-brows" data-ch-code={code && rows.some((r) => r.value == null) ? code : undefined}>
      <p className="ch-brows__axis">{label}</p>
      <ul aria-label={label}>
        {rows.map((r) => {
          const tone = r.value == null || r.bench == null ? '' : (invert ? r.value <= r.bench : r.value >= r.bench) ? ' is-gain' : ' is-loss';
          return (
            <li key={r.band} className="ch-brow">
              <span className="ch-brow__b ch-num">{r.band}</span>
              <span className="ch-brow__bar" aria-hidden="true">
                {r.value != null && <i className={tone.trim()} style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }} />}
                {r.bench != null && <em style={{ left: `${Math.min(100, (r.bench / max) * 100)}%` }} />}
              </span>
              <span className={'ch-brow__v' + (r.value == null ? ' is-none' : '')}>
                {r.value == null ? (
                  r.n && r.floor ? `Needs ${r.floor}` : none
                ) : (
                  <b className={'ch-num' + (tone === ' is-loss' ? ' ch-loss' : tone === ' is-gain' ? ' ch-gain' : '')}>{`${Math.round(r.value)}${unit}`}</b>
                )}
                {r.n != null && r.n > 0 && <small className="ch-num">{`${r.n} ${r.n === 1 ? 'shot' : 'shots'}`}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Bars by distance band with a dashed benchmark tick; bars are the player, ticks are the Tour. On a phone the bands are rows (BandRows). */
export function Ladder({
  rows,
  unit,
  label,
  invert = false,
  phone = false,
  none,
  code,
}: {
  rows: LadderRow[];
  unit: string;
  label: string;
  invert?: boolean;
  phone?: boolean;
  /** What an empty band reads on a phone ("No shots"). */
  none?: string;
  /** The catalog code a phone's rows carry when a band has no value (the screen's line under the chart says so on desktop). */
  code?: string;
}) {
  if (phone) return <BandRows rows={rows} unit={unit} label={label} invert={invert} none={none} code={code} />;
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
          <span key={l} className="ch-gmiss__c" style={{ background: `color-mix(in srgb, var(--ch-st-miss-heat) ${(5 + ((v ?? 0) / max) * 32).toFixed(1)}%, transparent)` }}>
            <b className="ch-num">{v == null ? NO_DATA : `${Math.round(v)}%`}</b>
            <em>{l}</em>
          </span>
        ),
      )}
    </div>
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
