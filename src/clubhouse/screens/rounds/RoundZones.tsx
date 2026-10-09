import { useId, type ReactNode } from 'react';
import type { ChReviewHole } from '../../data/round-review-shape';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { costliest, flow, puttBands, puttSplit, trail, type HoleResult } from './round-insights';

/**
 * P011: the pictures of a round's review. A zone is a band under a gold rule: what the area is and one reading on the left,
 * the picture that fits it on the right. Every picture is drawn from the review's own holes and shots (round-insights.ts);
 * a round without the data says so in a line rather than drawing zeros.
 */

export function RzZone({ n, title, def, alt = false, read, children }: { n: number; title: string; def: ReactNode; alt?: boolean; read?: ReactNode; children: ReactNode }) {
  return (
    <section className={'ch-rz' + (alt ? ' ch-rz--alt' : '')} aria-labelledby={`ch-rz-${n}`}>
      <div className="ch-rz__id">
        <span className="ch-rz__n" aria-hidden="true">
          {n}
        </span>
        <h2 id={`ch-rz-${n}`}>{title}</h2>
        <p className="ch-rz__def">{def}</p>
        {read && <div className="ch-rz__read">{read}</div>}
      </div>
      <div className="ch-rz__vis">{children}</div>
    </section>
  );
}

export function RzBlock({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="ch-rzb">
      <h3>{title}</h3>
      {note && <p>{note}</p>}
      {children}
    </div>
  );
}

export function RzBig({ value, tone, unit }: { value: string; tone?: 'good' | 'bad'; unit?: string }) {
  return (
    <span className={'ch-rzbig ch-num' + (tone ? ` is-${tone}` : '')}>
      {value}
      {unit && <small>{unit}</small>}
    </span>
  );
}

const COLOR: Record<HoleResult, string> = {
  eagle: '#7f2a21',
  birdie: 'var(--ch-chart-flag)',
  par: 'var(--ch-ivory-400)',
  bogey: '#8f8b81',
  double: '#1c1b18',
};

const pos = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

/** The round as a running score to par: a line that rises when the player is gaining on par and falls when losing to it, the holes below as columns. */
export function ScoreFlow({ holes, outScore, outToPar, inScore, inToPar }: { holes: ChReviewHole[]; outScore: number | null; outToPar: number | null; inScore: number | null; inToPar: number | null }) {
  const id = useId();
  const pts = flow(holes);
  if (pts.length < 2) return <p className="ch-rzmiss">The running score needs two holes with scores.</p>;
  const n = Math.max(...holes.map((h) => h.n));
  const X0 = 52;
  const X1 = 690;
  const x = (hole: number) => X0 + ((hole - 1) / Math.max(1, n - 1)) * (X1 - X0);
  // The plot runs from just under the best the round got to just over its worst, always with par inside it; up is better.
  const lo = Math.min(0, ...pts.map((p) => p.cum)) - 1;
  const hi = Math.max(0, ...pts.map((p) => p.cum)) + 1;
  const TOP = 40;
  const H = 150;
  const y = (v: number) => TOP + ((v - lo) / (hi - lo)) * H;
  const Y0 = y(0);
  const line = pts.map((p) => `${x(p.n)},${y(p.cum)}`).join(' ');
  const area = `${x(pts[0]!.n)},${Y0} ${line} ${x(pts[pts.length - 1]!.n)},${Y0}`;
  const stepBy = hi - lo > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / stepBy) * stepBy; v <= hi; v += stepBy) ticks.push(v);
  const worst = costliest(holes, 1)[0];
  const colBase = TOP + H + 44;
  const label = (v: number) => (v === 0 ? 'E' : v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  const summary = pts.map((p) => `Hole ${p.n} ${formatToPar(p.cum)}`).join(', ');
  const split = n > 9 ? x(9) + (x(10) - x(9)) / 2 : null;
  return (
    <svg className="ch-rzsvg" viewBox={`0 0 720 ${colBase + 52}`} role="img" aria-label={`Running score to par: ${summary}`}>
      <defs>
        <clipPath id={`${id}-up`}>
          <rect x={0} y={0} width={720} height={Y0} />
        </clipPath>
        <clipPath id={`${id}-down`}>
          <rect x={0} y={Y0} width={720} height={400} />
        </clipPath>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ch-warning-600)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--ch-warning-600)" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={X0 - 8} y1={y(v)} x2={X1 + 10} y2={y(v)} stroke={v === 0 ? 'var(--ch-text-primary)' : 'var(--ch-ledger-rule)'} strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={X0 - 14} y={y(v) + 4} textAnchor="end" fontSize={12} fontWeight={v === 0 ? 700 : 500} fill="var(--ch-text-tertiary)">
            {label(v)}
          </text>
        </g>
      ))}
      <text className="ch-rzsvg__hint" x={X1 + 10} y={TOP - 12} textAnchor="end" fontSize={11} fill="var(--ch-text-tertiary)">Better than par</text>
      <text className="ch-rzsvg__hint" x={X1 + 10} y={TOP + H + 22} textAnchor="end" fontSize={11} fill="var(--ch-text-tertiary)">Worse than par</text>
      {split != null && (
        <g>
          <line x1={split} y1={26} x2={split} y2={colBase + 28} stroke="var(--ch-ledger-rule)" strokeDasharray="4 5" />
          <text x={(x(1) + x(9)) / 2} y={16} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ch-text-secondary)">
            Out {outScore ?? NO_DATA} · {formatToPar(outToPar)}
          </text>
          <text x={(x(10) + x(n)) / 2} y={16} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--ch-text-secondary)">
            In {inScore ?? NO_DATA} · {formatToPar(inToPar)}
          </text>
        </g>
      )}
      <polygon points={area} fill="var(--ch-green-500)" fillOpacity={0.22} clipPath={`url(#${id}-up)`} />
      <polygon points={area} fill={`url(#${id}-g)`} clipPath={`url(#${id}-down)`} />
      <polyline points={line} fill="none" stroke="var(--ch-green-800)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <circle key={p.n} cx={x(p.n)} cy={y(p.cum)} r={p.delta === 0 ? 4 : 6.5} fill={COLOR[p.result]} stroke="var(--ch-ivory-25)" strokeWidth={2.5} />
      ))}
      {worst && (
        <g>
          <text x={x(worst.n)} y={y(worst.cum) + 28} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ch-warning-600)">
            Hole {worst.n}: {formatSigned(worst.delta, 0)}
          </text>
        </g>
      )}
      <line x1={X0 - 8} y1={colBase} x2={X1 + 10} y2={colBase} stroke="var(--ch-ledger-rule)" />
      {pts.map((p) => (
        <rect
          key={p.n}
          x={x(p.n) - 9}
          y={p.delta > 0 ? colBase : colBase + p.delta * 11}
          width={18}
          height={Math.max(2, Math.abs(p.delta) * 11)}
          rx={3}
          fill={COLOR[p.result]}
          opacity={p.delta === 0 ? 0.55 : 1}
        />
      ))}
      <g fontSize={12} fill="var(--ch-text-secondary)" textAnchor="middle">
        {pts.map((p) => (
          <text key={p.n} x={x(p.n)} y={colBase + 36} fontWeight={worst?.n === p.n ? 700 : 500}>
            {p.n}
          </text>
        ))}
      </g>
    </svg>
  );
}

/** A row of one mark per hole: hit, missed or not applicable, the hole's number under it. */
function HitRow({ label, holes, pick, hitWord }: { label: string; holes: ChReviewHole[]; pick: (h: ChReviewHole) => boolean | null; hitWord: string }) {
  return (
    <div className="ch-rzhit" role="img" aria-label={`${label} by hole: ${holes.map((h) => `${h.n} ${pick(h) == null ? 'not applicable' : pick(h) ? hitWord : 'missed'}`).join(', ')}`}>
      <b>{label}</b>
      <div>
        {holes.map((h) => {
          const v = pick(h);
          return (
            <span key={h.n} className={'ch-rzhit__c ' + (v == null ? 'is-na' : v ? 'is-hit' : 'is-miss')}>
              <i />
              <em>{h.n}</em>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function TeeToGreen({ holes }: { holes: ChReviewHole[] }) {
  return (
    <div className="ch-rzth">
      <HitRow label="Fairway" holes={holes} pick={(h) => h.fairway} hitWord="hit" />
      <HitRow label="Green in regulation" holes={holes} pick={(h) => h.gir} hitWord="hit" />
    </div>
  );
}

/** Putts a hole as columns (one putt green, two neutral, three or more amber), with the split and the first putts by length. */
export function PuttingViz({ holes }: { holes: ChReviewHole[] }) {
  const split = puttSplit(holes);
  if (!split) return <p className="ch-rzmiss">No putts were recorded for this round.</p>;
  const max = Math.max(3, ...holes.map((h) => h.putts ?? 0));
  const bands = puttBands(holes);
  const withData = bands.filter((b) => b.attempts > 0);
  return (
    <>
      <RzBlock title="Putts on each hole" note="One putt is green, two is neutral, three or more is gold.">
        <div className="ch-rzpt" role="img" aria-label={`Putts by hole: ${holes.map((h) => `${h.n} ${h.putts ?? 'none'}`).join(', ')}`}>
          {holes.map((h) => (
            <span key={h.n} className="ch-rzpt__c">
              <b className="ch-num">{h.putts ?? NO_DATA}</b>
              <i className={h.putts == null ? '' : h.putts <= 1 ? 'is-one' : h.putts === 2 ? 'is-two' : 'is-three'} style={{ height: `${h.putts == null ? 0 : (h.putts / max) * 100}%` }} />
              <em>{h.n}</em>
            </span>
          ))}
        </div>
        <div className="ch-rzsplit">
          <span>
            <b className="ch-num">{split.one}</b>one-putt holes
          </span>
          <span>
            <b className="ch-num">{split.two}</b>two-putt holes
          </span>
          <span className={split.three ? 'is-warn' : undefined}>
            <b className="ch-num">{split.three}</b>three-putt {split.three === 1 ? 'hole' : 'holes'}
          </span>
        </div>
      </RzBlock>
      {withData.length > 0 && (
        <RzBlock title="First putts by length" note="Putts holed out of the putts hit first on each green.">
          <div className="ch-rzrows">
            {bands.map((b) => (
              <div key={b.label} className="ch-rzrow">
                <span>{b.label}</span>
                <div className="ch-rzrow__t" aria-hidden="true">
                  {b.attempts > 0 && <i style={{ width: `${(b.made / b.attempts) * 100}%` }} />}
                </div>
                <b className="ch-num">{b.attempts > 0 ? `${b.made} of ${b.attempts}` : NO_DATA}</b>
              </div>
            ))}
          </div>
        </RzBlock>
      )}
    </>
  );
}

const LIE_COLOR: Record<string, string> = {
  fairway: 'var(--ch-green-400)',
  green: 'var(--ch-green-600)',
  hole: 'var(--ch-green-800)',
  rough: 'var(--ch-champagne-500)',
  sand: 'var(--ch-champagne-500)',
  other: 'var(--ch-champagne-500)',
  penalty: 'var(--ch-warning-600)',
  tee: 'var(--ch-green-400)',
};

/** The selected hole's full shots as arcs along its length, tee to pin, each coloured by where it finished; putts counted at the pin. */
export function ShotTrail({ hole }: { hole: ChReviewHole }) {
  const t = trail(hole);
  if (!t) return null;
  const X0 = 24;
  const X1 = 590;
  const base = 96;
  const x = (p: number) => X0 + pos(p, 0, 1) * (X1 - X0);
  const label = `Hole ${hole.n} shots along the hole: ${t.steps.map((s) => `${s.kind}${s.penalty ? ' penalty' : ''}${s.left ? ` to ${s.left}` : ''}`).join(', ')}${t.putts ? `, then ${t.putts} ${t.putts === 1 ? 'putt' : 'putts'}` : ''}`;
  return (
    <svg className="ch-rzsvg ch-rztrail" viewBox="0 0 740 150" role="img" aria-label={label}>
      <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-ledger-rule)" strokeWidth={6} strokeLinecap="round" />
      <line x1={X0} y1={base} x2={X1} y2={base} stroke="var(--ch-green-200)" strokeWidth={2} strokeLinecap="round" />
      {t.steps.map((s) => {
        const a = x(s.from);
        const b = x(s.to);
        if (s.penalty) {
          return (
            <g key={s.n}>
              <circle cx={a} cy={base - 18} r={9} fill="var(--ch-warning-600)" />
              <text x={a} y={base - 14} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">+1</text>
            </g>
          );
        }
        const rise = Math.min(64, 14 + Math.abs(b - a) * 0.16);
        const mid = (a + b) / 2;
        const color = LIE_COLOR[s.lie] ?? LIE_COLOR.other;
        return (
          <g key={s.n}>
            <path d={`M ${a} ${base} Q ${mid} ${base - rise * 2} ${b} ${base}`} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
            <circle cx={b} cy={base} r={7} fill={color} stroke="var(--ch-ivory-25)" strokeWidth={2.5} />
            <text x={b} y={base + 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff">{s.n}</text>
            {s.left && (
              <text x={b} y={base + 26} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ch-text-secondary)">{s.left} out</text>
            )}
          </g>
        );
      })}
      <circle cx={X0} cy={base} r={6} fill="var(--ch-ink-900)" />
      <text x={X0} y={base + 26} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ch-text-secondary)">
        {hole.yards ? `Tee · ${hole.yards} yds` : 'Tee'}
      </text>
      <line x1={X1 + 14} y1={base} x2={X1 + 14} y2={base - 34} stroke="var(--ch-ink-900)" strokeWidth={2} />
      <path d={`M ${X1 + 14} ${base - 34} l 20 7 l -20 7 z`} fill="var(--ch-chart-flag)" />
      {t.putts > 0 && (
        <g>
          {Array.from({ length: Math.min(t.putts, 5) }, (_, i) => (
            <circle key={i} cx={X1 + 52 + i * 14} cy={base} r={4.5} fill={t.putts >= 3 ? 'var(--ch-warning-600)' : 'var(--ch-green-600)'} />
          ))}
          <text x={X1 + 52} y={base + 26} fontSize={11.5} fontWeight={600} fill="var(--ch-text-secondary)">
            {t.putts} {t.putts === 1 ? 'putt' : 'putts'}
            {t.firstPutt != null ? ` · from ${t.firstPutt} ft` : ''}
          </text>
        </g>
      )}
    </svg>
  );
}
