'use client';

import { CircleDot, Crosshair, FlagTriangleRight, MoveUpRight, PenLine, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import type { ChLegKey, ChPlayerHome, ChPlayerLeg, ChScoringPoint } from '../../data/player-home';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { Segmented } from '../../ui/Segmented';
import { changeTone, formatFixed, formatSigned, NO_DATA } from '../../lib/format';
import { sgBaseline, type ChSgTour } from '../../lib/sg';
import { formatHcp } from '../roster/format';
import { useChSessionState } from '../../lib/session-state';

type Span = 5 | 10 | 20;
const SPANS: Span[] = [5, 10, 20];

const LEG_ICON: Record<ChLegKey, LucideIcon> = { tee: MoveUpRight, approach: Crosshair, short: FlagTriangleRight, putting: CircleDot };

/**
 * The player's game on Home (Player - Home.html `DetailedStats`, and the phone's
 * Scoring and "By part of the game"): the scoring line for the last 5, 10 or 20
 * rounds against par and the player's own mean, four figures, one sentence,
 * then the four parts of the game against the Tour where a benchmark exists.
 */
export function PlayerGame({ data, phone = false }: { data: ChPlayerHome; phone?: boolean }) {
  return (
    <>
      <Scoring data={data} phone={phone} />
      <Legs legs={data.legs} tour={data.tour} phone={phone} />
    </>
  );
}

/** The par every round in the window was played to, or null when they differ (a par line would be wrong for some). */
function commonPar(points: ChScoringPoint[]): number | null {
  const pars = points.map((p) => p.par).filter((v): v is number => v != null);
  return pars.length > 0 && pars.length === points.length && pars.every((v) => v === pars[0]) ? pars[0]! : null;
}

function Scoring({ data, phone }: { data: ChPlayerHome; phone: boolean }) {
  // The span of rounds (Last 5, 10, 20) comes back when the player returns to Home (PAGE_PERFORMANCE.md rule 1).
  const [n, setN] = useChSessionState<Span>('home-span', 10);
  const all = data.scoring.points;
  const shown = all.slice(-n);
  const before = all.slice(-2 * n, -n);
  const mean = shown.length ? shown.reduce((a, p) => a + p.score, 0) / shown.length : null;
  const prevMean = before.length >= Math.min(n, 3) && before.length ? before.reduce((a, p) => a + p.score, 0) / before.length : null;
  const delta = mean != null && prevMean != null ? mean - prevMean : null;
  const withPar = shown.filter((p): p is ChScoringPoint & { par: number } => p.par != null);
  const under = withPar.filter((p) => p.score < p.par).length;
  const figs: Array<[string, string, string, string]> = [
    ['Scoring avg', formatFixed(mean), delta == null ? `Last ${shown.length}` : `${formatSigned(delta)} vs previous ${before.length}`, changeTone(delta, true)],
    ['Strokes gained', data.sgPerRound == null ? NO_DATA : formatSigned(data.sgPerRound), data.sgPerRound == null ? 'After three rounds' : `Season, per round ${sgBaseline(data.tour).vs}`, changeTone(data.sgPerRound, false)],
    ['Handicap', formatHcp(data.handicap), 'Index', ''],
    ['Under par', withPar.length ? `${under} of ${withPar.length}` : NO_DATA, withPar.length < shown.length ? 'Rounds with par recorded' : 'Rounds in this window', ''],
  ];
  const par = commonPar(shown);
  // The phone's card always offers all three windows, as the board's does; the desktop's only the ones with rounds to fill them.
  const options = (phone ? SPANS : SPANS.filter((k) => k === 5 || all.length > k / 2)).map((k) => ({ value: `${k}` as `${Span}`, label: `Last ${k}` }));
  const picker = (
    <Segmented<`${Span}`> size={phone ? 'md' : 'sm'} label="Rounds shown" value={`${n}`} onChange={(v) => setN(Number(v) as Span)} options={options} />
  );
  const body = data.scoring.error ? (
    <RefreshNotice code="CH-2215" title="Your rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." />
  ) : shown.length < 2 ? (
    <EmptyState
      compact
      code="CH-2310"
      title={shown.length ? 'One round so far.' : 'No rounds posted yet this season.'}
      body="Your scoring line starts with your second 18-hole round."
    />
  ) : (
    <div className="ch-ph-game__top">
      <ScoreChart points={shown} phone={phone} />
      <dl className="ch-ph-figs">
        {figs.map(([k, v, m, t]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={'ch-num ' + t}>{v}</dd>
            <dd className="ch-ph-figs__m ch-num">{m}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const note = !data.scoring.error && shown.length >= 5 && (
    <p className="ch-ph-note">
      <Icon icon={PenLine} size={14} />
      {scoringNote(shown)}
    </p>
  );

  // The phone (m-player-home.jsx `Scoring`): the title and its one-line meta sit above the card, which opens on the full-width window picker.
  if (phone) {
    return (
      <section className="ch-hm-sec" aria-labelledby="ch-ph-scoring">
        <div className="ch-hm-sec__h">
          <h2 id="ch-ph-scoring">Scoring</h2>
          <span className="ch-hm-meta">{par != null ? `Gross · par ${par} · countable rounds` : 'Gross · countable rounds'}</span>
        </div>
        <div className="ch-ph-game is-phone">
          {!data.scoring.error && all.length >= 2 && picker}
          {body}
          {note}
        </div>
      </section>
    );
  }
  return (
    <section className="ch-ph-game" aria-labelledby="ch-ph-scoring">
      <div className="ch-ph-game__h">
        <div>
          <h2 id="ch-ph-scoring">Scoring</h2>
          <span>
            Gross · countable 18-hole rounds
            {shown.length >= 2 && !data.scoring.error ? ` · dashed line, your mean ${formatFixed(shown.reduce((a, p) => a + p.score, 0) / shown.length)}` : ''}
          </span>
        </div>
        {all.length > 5 && picker}
      </div>
      {body}
      {note}
    </section>
  );
}

/** "Eight of your last ten are 72 or better." The score four in five rounds meet, from the rounds shown. */
export function scoringNote(points: ChScoringPoint[]): string {
  const sorted = points.map((p) => p.score).sort((a, b) => a - b);
  const k = Math.ceil(sorted.length * 0.8);
  const bar = sorted[k - 1]!;
  const met = sorted.filter((s) => s <= bar).length;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const say = (x: number) => words[x] ?? String(x);
  const first = say(met);
  return `${first[0]!.toUpperCase()}${first.slice(1)} of your last ${say(points.length)} are ${bar} or better.`;
}

/**
 * Which points carry a date under the chart: every `step`th, counted back from the newest, and never the same date
 * twice in a row (several rounds can share a day, and "Aug 2 Aug 2 Aug 2" says nothing). A run of one date is
 * labelled where it starts.
 */
export function axisLabelIndexes(labels: readonly string[], step: number): number[] {
  const every = Math.max(1, step);
  const out: number[] = [];
  if (!labels.length) return out;
  for (let i = (labels.length - 1) % every; i < labels.length; i += every) {
    const prev = out[out.length - 1];
    if (prev != null && labels[prev] === labels[i]) continue;
    out.push(i);
  }
  return out;
}

/** Whole-stroke ticks for the score axis, no more than `max` of them: every 1, 2, 5 or 10 strokes. */
export function scoreTicks(lo: number, hi: number, max: number): number[] {
  const from = Math.ceil(lo);
  const to = Math.floor(hi);
  const step = [1, 2, 5, 10].find((s) => Math.floor(to / s) - Math.ceil(from / s) + 1 <= max) ?? 10;
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
  return out;
}

/** Scores against par (hatched below it) and the player's own mean, the best round pinned. Lower scores sit higher. */
function ScoreChart({ points, phone }: { points: ChScoringPoint[]; phone: boolean }) {
  const uid = useId().replace(/:/g, '');
  const W = phone ? 340 : 760;
  // Desktop draws taller so the line fills the space beside the four figures.
  const H = phone ? 196 : 340;
  const L = phone ? 24 : 34;
  const R = phone ? 34 : 20;
  const T = phone ? 24 : 44;
  const B = phone ? 26 : 30;
  const scores = points.map((p) => p.score);
  // The par line requires a known, identical par for every round; each known round is still marked against its own par.
  const par = commonPar(points);
  const lo = Math.min(...scores, par ?? Infinity) - 1;
  const hi = Math.max(...scores, par ?? -Infinity) + 1;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v: number) => T + ((v - lo) / (hi - lo)) * (H - T - B);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const pts = scores.map((v, i) => [x(i), y(v)] as const);
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const best = Math.min(...scores);
  const bi = scores.lastIndexOf(best);
  const last = points.length - 1;
  const labelled = points.length <= 10;
  const step = points.length <= 5 ? 1 : points.length <= 10 ? (phone ? 3 : 1) : phone ? 5 : 2;
  const ticks = scoreTicks(lo, hi, phone ? 6 : 8);
  // Under par against that round's own par, so a dot is green and a label red even where the par line is not drawn.
  const under = (i: number) => points[i]!.par != null && scores[i]! < points[i]!.par!;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="ch-ph-chart"
      role="img"
      aria-label={`Your scores over the last ${points.length} rounds, from ${scores[0]} to ${scores[last]}; your mean is ${formatFixed(mean)} and your best is ${best}.`}
    >
      <defs>
        <linearGradient id={`${uid}f`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="ch-ph-chart__fill0" />
          <stop offset="1" className="ch-ph-chart__fill1" />
        </linearGradient>
        <pattern id={`${uid}g`} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,6 L6,0" className="ch-ph-chart__hatch" />
        </pattern>
      </defs>
      {par != null && <rect x={L} y={y(par)} width={W - L - R} height={Math.max(0, H - B - y(par))} fill={`url(#${uid}g)`} />}
      {ticks.map((v) => (
        <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end" className="ch-ph-chart__ax">
          {v}
        </text>
      ))}
      {par != null && (
        <>
          <line x1={L} x2={W - R} y1={y(par)} y2={y(par)} className="ch-ph-chart__par" />
          <text x={phone ? W - R + 6 : W - R} y={phone ? y(par) + 4 : y(par) + 14} textAnchor={phone ? 'start' : 'end'} className="ch-ph-chart__ax">
            {phone ? 'Par' : `Par ${par}`}
          </text>
        </>
      )}
      <line x1={L} x2={W - R} y1={y(mean)} y2={y(mean)} className="ch-ph-chart__mean" />
      {/* Desktop names the mean in the caption, where it can't sit on a point's label. */}
      {phone && (
        <text x={W - R + 6} y={y(mean) + 4} className="ch-ph-chart__ann">
          Avg
        </text>
      )}
      <path d={`${d} L${x(last).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`} fill={`url(#${uid}f)`} />
      <path d={d} className="ch-ph-chart__halo" />
      <path d={d} className="ch-ph-chart__line" />
      {pts.map(([px, py], i) => (
        <g key={points[i]!.id}>
          <circle cx={px} cy={py} r={i === last ? 5 : points.length > 10 ? 2.6 : 3.4} className={'ch-ph-chart__dot' + (under(i) ? ' is-under' : '')} />
          {labelled && (
            <text x={px} y={py - 10} textAnchor="middle" className={'ch-ph-chart__val' + (under(i) ? ' is-under' : '')}>
              {scores[i]}
            </text>
          )}
        </g>
      ))}
      {!phone && (
        <g transform={`translate(${x(bi).toFixed(1)},${(y(best) - (labelled ? 14 : 4)).toFixed(1)})`} className="ch-ph-pinflag">
          <line y1="-6" y2="-34" />
          <path d="M0,-34 L16,-29 L0,-24 Z" />
          {/* Near the right edge the label reads to the left of the pole, inside the chart. */}
          <text x={x(bi) > W - 160 ? -6 : 20} y="-26" textAnchor={x(bi) > W - 160 ? 'end' : 'start'} className="ch-ph-chart__ann">
            low · {best}
          </text>
        </g>
      )}
      {axisLabelIndexes(
        points.map((p) => p.label),
        step,
      ).map((i) => (
        <text key={points[i]!.id} x={x(i)} y={H - 6} textAnchor={phone ? (i === 0 ? 'start' : i === last ? 'end' : 'middle') : 'middle'} className="ch-ph-chart__ax">
          {points[i]!.label}
        </text>
      ))}
    </svg>
  );
}

function Legs({ legs, tour, phone }: { legs: ChPlayerHome['legs']; tour: ChSgTour; phone: boolean }) {
  if (!legs) return null;
  const any = legs.rows.some((l) => l.value != null);
  return (
    <section className={phone ? 'ch-hm-sec ch-ph-legs-sec is-phone' : 'ch-ph-legs-sec'} aria-labelledby="ch-ph-legs">
      {phone ? (
        // The board's one-line meta beside the title. The stats are the last 10 rounds and each part's strokes gained is the season's: each pill says so to a screen reader, and the desktop's caption in full.
        <div className="ch-hm-sec__h">
          <h2 id="ch-ph-legs">By part of the game</h2>
          <span className="ch-hm-meta">Strokes gained {sgBaseline(tour).vs}</span>
        </div>
      ) : (
        <div className="ch-ph-game__h">
          <div>
            <h2 id="ch-ph-legs">By part of the game</h2>
            {/* The stats are the last 10 rounds; each part's strokes gained is the season's, against the Tour; a stat with a Tour average draws it as a mark. */}
            <span>Last 10 rounds · strokes gained this season {sgBaseline(tour).vs}</span>
          </div>
        </div>
      )}
      {legs.cacheError && <RefreshNotice code="CH-2216" title="Some of your figures didn't load." body="Scores, greens and putts are right; scrambling is missing. The error has been reported." />}
      {/* Figures that did not load are not "nothing to break down": the notice above is the whole answer then (CH-2216). */}
      {!any ? (
        legs.cacheError ? null : (
          <EmptyState compact code="CH-2311" title="Nothing to break down yet." body="Fairways, greens, scrambling and putts fill in from rounds posted with those stats." />
        )
      ) : (
        <div className="ch-ph-legs">
          {legs.rows.map((g) => (
            <Leg key={g.key} g={g} />
          ))}
        </div>
      )}
    </section>
  );
}

function Leg({ g }: { g: ChPlayerLeg }) {
  const fmt = (v: number) => (g.unit === '%' ? `${Math.round(v)}%` : v.toFixed(g.digits));
  // The benchmark bar: a share of the scale for percentages, or a putts band (fewer is further right).
  const pos = (v: number) => (g.unit === '%' ? Math.max(0, Math.min(100, v)) : Math.max(0, Math.min(100, ((36 - v) / (36 - 26)) * 100)));
  const better = g.value != null && g.bench != null ? (g.lowerIsBetter ? g.value <= g.bench : g.value >= g.bench) : null;
  return (
    <article className="ch-ph-leg" aria-labelledby={`ch-ph-leg-${g.key}`}>
      <div className="ch-ph-leg__h">
        <span className="ch-ph-leg__ic" aria-hidden="true">
          <Icon icon={LEG_ICON[g.key]} size={15} />
        </span>
        <b id={`ch-ph-leg-${g.key}`}>{g.label}</b>
        {g.sg != null && (
          <span className={'ch-ph-leg__sg ch-num ' + (changeTone(g.sg, false) || 'is-flat')}>
            {formatSigned(g.sg)}
            <span className="ch-sr-only"> strokes gained a round this season</span>
          </span>
        )}
      </div>
      <div className="ch-ph-leg__v">
        <span className="ch-num">{g.value == null ? NO_DATA : fmt(g.value)}</span>
        <em>{g.stat}</em>
        <Spark data={g.trend} lowerIsBetter={g.lowerIsBetter} label={g.stat} />
      </div>
      {g.value != null && g.bench != null && (
        <div className="ch-ph-bench">
          <span className="ch-ph-bench__t" aria-hidden="true">
            <i className={better ? 'is-gain' : 'is-loss'} style={{ width: `${pos(g.value)}%` }} />
            <em style={{ left: `${pos(g.bench)}%` }} />
          </span>
          <span className="ch-ph-bench__k ch-num">
            <span>You {fmt(g.value)}</span>
            <span>Tour {fmt(g.bench)}</span>
          </span>
        </div>
      )}
      {g.note && <p className="ch-ph-leg__n ch-num">{g.note}</p>}
    </article>
  );
}

/** A leg's last rounds, green when it moved the good way and amber when not; a dashed mean. */
function Spark({ data, lowerIsBetter, label }: { data: number[]; lowerIsBetter: boolean; label: string }) {
  if (data.length < 2) return null;
  const w = 84;
  const h = 28;
  const p = 4;
  const lo = Math.min(...data) - 0.4;
  const hi = Math.max(...data) + 0.4;
  const x = (i: number) => p + (i * (w - p * 2)) / (data.length - 1);
  // The better direction is always up: fewer putts sit higher.
  const y = (v: number) => p + ((lowerIsBetter ? v - lo : hi - v) / (hi - lo)) * (h - p * 2);
  const ch = data[data.length - 1]! - data[0]!;
  const good = lowerIsBetter ? ch < -0.2 : ch > 0.2;
  const bad = lowerIsBetter ? ch > 0.2 : ch < -0.2;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const tone = good ? 'is-gain' : bad ? 'is-loss' : '';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={'ch-ph-spark ' + tone} role="img" aria-label={`${label}, your last ${data.length} rounds, ${good ? 'improving' : bad ? 'slipping' : 'steady'}`}>
      <line x1={p} x2={w - p} y1={y(mean)} y2={y(mean)} className="ch-ph-spark__mean" />
      <path d={data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} className="ch-ph-spark__line" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1]!)} r="2.6" className="ch-ph-spark__dot" />
    </svg>
  );
}
