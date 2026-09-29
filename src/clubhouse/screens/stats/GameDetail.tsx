'use client';

import { CircleDot, Crosshair, Flag, FlagTriangleRight, MoveUpRight, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { NO_DATA } from '../../lib/format';
import { Compare, CupMiss, FairwayStrip, GreenMiss, Ladder, MakeCurve, ParTiles, ScoreMix } from './charts';

type Tone = 'gain' | 'loss' | undefined;
const pct = (v: number | null | undefined, d = 0) => (v == null ? NO_DATA : `${v.toFixed(d)}%`);
const num = (v: number | null | undefined, d = 1) => (v == null ? NO_DATA : v.toFixed(d));
/** Green when on the right side of the benchmark, amber when not, no colour without one. */
const tone = (v: number | null | undefined, ref: number | null | undefined, lowerIsBetter = false): Tone =>
  v == null || ref == null ? undefined : (lowerIsBetter ? v <= ref : v >= ref) ? 'gain' : 'loss';

const SECTIONS = [
  ['scoring', 'Scoring'],
  ['tee', 'Off the tee'],
  ['approach', 'Approach'],
  ['short', 'Short game'],
  ['putting', 'Putting'],
] as const;

function Sec({
  id,
  icon,
  title,
  lead,
  sub,
  figs,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  lead: string;
  sub: string;
  figs: Array<[string, string, string | null, Tone]>;
  children: ReactNode;
}) {
  return (
    <section className="ch-gm" id={`gm-${id}`} aria-labelledby={`gm-${id}-t`}>
      <header className="ch-gm__head">
        <span className="ch-gm__ic">
          <Icon icon={icon} size={16} />
        </span>
        <div className="ch-gm__t">
          <h2 id={`gm-${id}-t`}>{title}</h2>
          <p>{lead}</p>
        </div>
        <span className="ch-gm__sub">{sub}</span>
      </header>
      <dl className="ch-gm__figs">
        {figs.map(([l, v, n, t]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd className={`ch-num${t ? ` ch-${t}` : ''}`}>{v}</dd>
            {n && <span>{n}</span>}
          </div>
        ))}
      </dl>
      <div className="ch-gm__body">{children}</div>
    </section>
  );
}

function Panel({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={'ch-gm-p' + (wide ? ' is-wide' : '')}>
      <div className="ch-gm-p__t">{title}</div>
      {children}
      {note && <p className="ch-gm-p__n">{note}</p>}
    </div>
  );
}

/**
 * Game detail: every section leads with one head-pro sentence built from the
 * numbers below it, then four figures against D1 where golf_pga_standards has
 * a D1 average, then the matched visuals. Missing shot data reads as a dash
 * and a plain sentence, never a zero.
 */
export function GameDetail({ s, d1, first, rounds }: { s: GolfStats; d1: Record<string, number>; first: string; rounds: number }) {
  const [on, setOn] = useState<string>('scoring');

  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(`gm-${id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setOn(top.target.id.replace('gm-', ''));
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    haptic('select');
    setOn(id);
    document.getElementById(`gm-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const dist = {
    eagle: s.eaglesPerRound ?? 0,
    birdie: s.birdiesPerRound ?? 0,
    par: s.parsPerRound ?? 0,
    bogey: s.bogeysPerRound ?? 0,
    double: s.doublePlusPerRound ?? 0,
  };
  const par = (p: 3 | 4 | 5) => {
    const d = s.scoringByPar[`par${p}` as const];
    return { par: p, avg: d.avgToPar == null ? null : p + d.avgToPar, d1: d1[`scoring_par_${p}`] ?? null };
  };
  const pars = [par(3), par(4), par(5)];
  const p5 = pars[2]!;

  // Off the tee
  const fw = s.fairwayPercentage;
  const left = s.missLeftPct;
  const right = s.missRightPct;
  const d1Pen = d1.penalty_rate_per_round ?? null;

  // Approach
  const girBands: Array<[string, number | null]> = [
    ['50–75', s.girPct50_75],
    ['75–100', s.girPct75_100],
    ['100–125', s.girPct100_125],
    ['125–150', s.girPct125_150],
    ['150–175', s.girPct150_175],
    ['175–200', s.girPct175_200],
    ['200+', s.girPct200_225 ?? s.girPct225Plus],
  ];
  const proxBands: Array<[string, number | null, number | null]> = [
    ['50–75', s.approachProx30_75, d1.approach_proximity_50_125ft ?? null],
    ['75–100', s.approachProx75_100, d1.approach_proximity_50_125ft ?? null],
    ['100–125', s.approachProx100_125, d1.approach_proximity_50_125ft ?? null],
    ['125–150', s.approachProx125_150, d1.approach_proximity_125_175ft ?? null],
    ['150–175', s.approachProx150_175, d1.approach_proximity_125_175ft ?? null],
    ['175–200', s.approachProx175_200, d1.approach_proximity_175_plus_ft ?? null],
    ['200+', s.approachProx200_225 ?? s.approachProx225Plus, d1.approach_proximity_175_plus_ft ?? null],
  ];
  const worstProx = proxBands
    .filter(([, v, b]) => v != null && b != null)
    .sort((a, b) => (b[1]! - b[2]!) - (a[1]! - a[2]!))[0];
  const missShort = (s.approachMissShortPct ?? 0) + (s.approachMissShortLeftPct ?? 0) + (s.approachMissShortRightPct ?? 0);
  const missLong = (s.approachMissLongPct ?? 0) + (s.approachMissLongLeftPct ?? 0) + (s.approachMissLongRightPct ?? 0);
  const hasMiss = s.approachMissTotal > 0;

  // Short game
  const d1ScrFw = d1.scrambling_pct_fairway ?? null;
  const d1ScrRough = d1.scrambling_pct_rough ?? null;
  const d1Sand = d1.scrambling_pct_sand ?? null;

  // Putting
  const puttBands = [
    { band: '0–3', value: s.puttMakePct0_3, d1: null, n: s.puttMakeCount0_3 },
    { band: '3–5', value: s.puttMakePct3_5, d1: d1.putts_made_3_5ft_pct ?? null, n: s.puttMakeCount3_5 },
    { band: '5–10', value: s.puttMakePct5_10, d1: d1.putts_made_5_10ft_pct ?? null, n: s.puttMakeCount5_10 },
    { band: '10–15', value: s.puttMakePct10_15, d1: d1.putts_made_10_15ft_pct ?? null, n: s.puttMakeCount10_15 },
    { band: '15–20', value: s.puttMakePct15_20, d1: d1.putts_made_15_25ft_pct ?? null, n: s.puttMakeCount15_20 },
  ];
  const worstPutt = puttBands
    .filter((b) => b.value != null && b.d1 != null && b.n >= 10)
    .sort((a, b) => (a.value! - a.d1!) - (b.value! - b.d1!))[0];
  const onePuttRate = s.holesPlayed ? (s.onePuttsTotal / s.holesPlayed) * 100 : null;
  const lag = Object.entries(s.approachPuttAvgLeaveByBand ?? {}).filter(([, v]) => v != null);
  const brk = (['straight', 'left_to_right', 'right_to_left'] as const).map((k) => ({
    label: k === 'straight' ? 'Straight' : k === 'left_to_right' ? 'Left to right' : 'Right to left',
    value: avgMake(s.puttingByBreak[k]),
    sub: `${s.puttingByBreak[k].count0_3 + s.puttingByBreak[k].count3_5 + s.puttingByBreak[k].count5_10} putts inside 10 ft`,
  }));

  const sample = `${rounds} ${rounds === 1 ? 'round' : 'rounds'} · ${s.totalPutts} putts · ${s.girOpportunities} approaches`;

  return (
    <div className="ch-gd">
      <nav className="ch-gd__nav" aria-label="Game sections">
        {SECTIONS.map(([id, l]) => (
          <button key={id} type="button" className="ch-pill" aria-pressed={on === id} onClick={() => jump(id)}>
            {l}
          </button>
        ))}
        <span className="ch-gd__src">{sample} logged</span>
      </nav>

      <Sec
        id="scoring"
        icon={Flag}
        title="Scoring"
        sub={`${s.roundsPlayed} rounds`}
        lead={
          s.roundsPlayed
            ? `${first} makes ${dist.birdie.toFixed(1)} birdies and ${dist.double.toFixed(1)} doubles a round.${
                p5.avg != null ? ` Par 5s ${p5.avg < 5 ? 'are a scoring chance' : 'are giving shots back'}, playing ${p5.avg.toFixed(2)} on average.` : ''
              }`
            : `No hole-by-hole scores in this window yet.`
        }
        figs={[
          ['Scoring average', num(s.scoringAverage18 ?? s.scoringAverage), 'Per 18 holes', undefined],
          ['Birdies / round', num(s.birdiesPerRound), null, undefined],
          ['Bogeys / round', num(s.bogeysPerRound), null, undefined],
          ['Doubles or worse', num(s.doublePlusPerRound), d1.big_number_rate != null ? `D1 ${d1.big_number_rate}% of holes` : null, undefined],
        ]}
      >
        <Panel title="What an average round looks like" wide note="Holes per round by result. Doubles or worse are the quickest place to save strokes.">
          <ScoreMix d={dist} />
        </Panel>
        <Panel title="Scoring by par" wide>
          <ParTiles rows={pars} />
        </Panel>
      </Sec>

      <Sec
        id="tee"
        icon={MoveUpRight}
        title="Off the tee"
        sub={`${s.fairwayOpportunities} drives`}
        lead={
          fw == null
            ? 'No tee shots are logged in this window, so fairways and distance can’t be read yet.'
            : `${first} finds ${Math.round(fw)}% of fairways.${
                left != null && right != null && Math.abs(left - right) >= 1 ? ` When the drive misses it goes ${left > right ? 'left' : 'right'} more often` : ''
              }${s.penaltiesPerRound ? `, and ${s.penaltiesPerRound.toFixed(1)} penalty strokes a round come from the tee` : ''}.`
        }
        figs={[
          ['Fairways hit', pct(fw), null, undefined],
          ['Driver distance', s.drivingDistanceDriverOnly == null ? NO_DATA : `${Math.round(s.drivingDistanceDriverOnly)} yds`, 'Average drive', undefined],
          ['Penalties / round', num(s.penaltiesPerRound), d1Pen != null ? `D1 ${d1Pen}` : null, tone(s.penaltiesPerRound, d1Pen, true)],
          ['Fairways par 5', pct(s.fairwayPctPar5), s.fairwayPctPar4 != null ? `Par 4 ${Math.round(s.fairwayPctPar4)}%` : null, undefined],
        ]}
      >
        <Panel title="Where drives finish" note="Share of tee shots on par 4s and 5s.">
          {fw != null && left != null && right != null ? <FairwayStrip left={left} fw={fw} right={right} /> : <p className="ch-gm-p__empty">No drive results logged.</p>}
        </Panel>
        <Panel title="Distance by club">
          <Compare
            unit=" yds"
            max={320}
            rows={[
              { label: 'Driver', value: s.drivingDistanceDriverOnly, sub: 'Carry and roll' },
              { label: 'Other clubs', value: s.drivingDistanceNonDriverOnly, sub: 'When driver stays in the bag' },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="approach"
        icon={Crosshair}
        title="Approach"
        sub={`${s.girOpportunities} approach shots`}
        lead={
          s.girPercentage == null
            ? 'No approach shots are logged in this window.'
            : worstProx
              ? `${first} hits ${Math.round(s.girPercentage)}% of greens. The biggest gap to D1 is from ${worstProx[0]} yards, finishing ${Math.round(worstProx[1]!)} feet away against ${Math.round(worstProx[2]!)}.`
              : `${first} hits ${Math.round(s.girPercentage)}% of greens in regulation.`
        }
        figs={[
          ['Greens in regulation', pct(s.girPercentage), d1.gir_pct != null ? `D1 ${d1.gir_pct}%` : null, tone(s.girPercentage, d1.gir_pct)],
          ['Proximity · all', s.approachProximityAvg == null ? NO_DATA : `${Math.round(s.approachProximityAvg)} ft`, 'Every approach', undefined],
          ['Missed short', hasMiss ? pct(missShort) : NO_DATA, 'Of missed greens', hasMiss && missShort > missLong ? 'loss' : undefined],
          ['From the rough', pct(s.girPctFromRough), s.girPctFromFairway != null ? `GIR · fairway ${Math.round(s.girPctFromFairway)}%` : null, undefined],
        ]}
      >
        <Panel title="Greens hit by distance" wide note="Bars are the GIR rate from each band.">
          <Ladder rows={girBands.map(([band, value]) => ({ band, value, d1: null }))} unit="%" label="Yards to the pin" />
        </Panel>
        <Panel title="Proximity to the hole" wide note="Average finish in feet; shorter is better. The dashed tick is the D1 average for that range.">
          <Ladder rows={proxBands.map(([band, value, b]) => ({ band, value, d1: b }))} unit={'′'} label="Yards to the pin" invert />
        </Panel>
        <Panel title="Where missed greens finish" note={hasMiss ? `Most misses finish ${missShort >= missLong ? 'short' : 'long'}. ${missShort >= missLong ? 'Taking one more club is the simplest change.' : 'Clubbing down is worth a look.'}` : undefined}>
          {hasMiss ? (
            <GreenMiss
              m={{
                ll: s.approachMissLongLeftPct,
                lg: s.approachMissLongPct,
                lr: s.approachMissLongRightPct,
                l: s.approachMissLeftPct,
                r: s.approachMissRightPct,
                sl: s.approachMissShortLeftPct,
                s: s.approachMissShortPct,
                sr: s.approachMissShortRightPct,
              }}
            />
          ) : (
            <p className="ch-gm-p__empty">No missed-green directions logged.</p>
          )}
        </Panel>
        <Panel title="Greens hit by lie">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: 'Fairway', value: s.girPctFromFairway },
              { label: 'Rough', value: s.girPctFromRough },
              { label: 'Sand', value: s.girPctFromSand },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="short"
        icon={FlagTriangleRight}
        title="Short game"
        sub={`${s.scrambleAttempts} chances`}
        lead={
          s.scramblingPercentage == null
            ? 'No up-and-down chances are logged in this window.'
            : `${first} gets up and down ${Math.round(s.scramblingPercentage)}% of the time.${
                s.scramblingPctRough != null ? ` From the rough it's ${Math.round(s.scramblingPctRough)}%` : ''
              }${s.sandSavePercentage != null ? `, and sand saves are ${Math.round(s.sandSavePercentage)}%` : ''}.`
        }
        figs={[
          ['Scrambling', pct(s.scramblingPercentage), null, undefined],
          ['Sand saves', pct(s.sandSavePercentage), d1Sand != null ? `D1 ${d1Sand}%` : null, tone(s.sandSavePercentage, d1Sand)],
          ['Inside 10 yds', pct(s.scramblingPct0_10), 'Up and down', undefined],
          ['From the rough', pct(s.scramblingPctRough), d1ScrRough != null ? `D1 ${d1ScrRough}%` : `${s.scrambleRoughAttempts} attempts`, tone(s.scramblingPctRough, d1ScrRough)],
        ]}
      >
        <Panel title="Up and down by lie" note="Counts are attempts in the window.">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: 'Fringe', value: s.scramblingPctFringe, sub: `${s.scrambleFringeAttempts} attempts` },
              { label: 'Fairway', value: s.scramblingPctFairway, sub: `${s.scrambleFairwayAttempts} attempts${d1ScrFw != null ? ` · D1 ${d1ScrFw}%` : ''}` },
              { label: 'Rough', value: s.scramblingPctRough, sub: `${s.scrambleRoughAttempts} attempts${d1ScrRough != null ? ` · D1 ${d1ScrRough}%` : ''}` },
              { label: 'Sand', value: s.scramblingPctSand, sub: `${s.scrambleSandAttempts} attempts${d1Sand != null ? ` · D1 ${d1Sand}%` : ''}` },
            ]}
          />
        </Panel>
        <Panel title="Up and down by distance">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: '0–10 yds', value: s.scramblingPct0_10 },
              { label: '10–20 yds', value: s.scramblingPct10_20 },
              { label: '20–30 yds', value: s.scramblingPct20_30 },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="putting"
        icon={CircleDot}
        title="Putting"
        sub={`${s.totalPutts} putts`}
        lead={
          s.totalPutts === 0
            ? 'No putts are logged in this window.'
            : worstPutt && worstPutt.value! < worstPutt.d1!
              ? `From ${worstPutt.band} feet ${first} makes ${Math.round(worstPutt.value!)}%. The D1 rate is ${Math.round(worstPutt.d1!)}%, so that range costs the most.`
              : `${first} averages ${num(s.puttsPerGir, 2)} putts per green hit and ${num(s.threePuttsPerRound)} three-putts a round.`
        }
        figs={[
          ['Putts / GIR', num(s.puttsPerGir, 2), null, undefined],
          ['3-putts / round', num(s.threePuttsPerRound), null, undefined],
          ['One-putt rate', pct(onePuttRate), 'Of holes', undefined],
          ['First putt', s.firstPuttDistanceAvg == null ? NO_DATA : `${s.firstPuttDistanceAvg.toFixed(1)} ft`, 'Average start', undefined],
        ]}
      >
        <Panel title="Make rate by distance" wide note="Green line is the player, dashed champagne is D1. Each band needs 10 or more putts to grade.">
          <MakeCurve bands={puttBands} />
        </Panel>
        <Panel title="How putts miss" wide>
          <CupMiss
            m={{ left: s.puttMissLeftPct, right: s.puttMissRightPct, short: s.puttMissShortPct, long: s.puttMissLongPct, low: s.puttMissLowPct, high: s.puttMissHighPct }}
          />
        </Panel>
        <Panel title="Lag leave">
          {lag.length ? (
            <Compare unit=" ft" max={8} rows={lag.map(([b, v]) => ({ label: `From ${b.replace('_', '–')} ft`, value: v, sub: 'Left for the next putt' }))} />
          ) : (
            <p className="ch-gm-p__empty">No long first putts logged.</p>
          )}
        </Panel>
        <Panel title="Make rate by break" note={brk.some((r) => r.value != null) ? 'Putts inside 10 feet.' : undefined}>
          {brk.some((r) => r.value != null) ? (
            <Compare unit="%" max={100} rows={brk} />
          ) : (
            <p className="ch-gm-p__empty">No putts inside 10 feet have a break logged yet.</p>
          )}
        </Panel>
      </Sec>
    </div>
  );
}

function avgMake(b: GolfStats['puttingByBreak']['straight']): number | null {
  const n = b.count0_3 + b.count3_5 + b.count5_10;
  if (!n) return null;
  const made = (b.makePct0_3 ?? 0) * b.count0_3 + (b.makePct3_5 ?? 0) * b.count3_5 + (b.makePct5_10 ?? 0) * b.count5_10;
  return made / n;
}
