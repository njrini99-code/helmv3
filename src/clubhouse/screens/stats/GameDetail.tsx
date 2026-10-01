'use client';

import { CircleDot, Crosshair, Flag, FlagTriangleRight, MoveUpRight, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { ChPuttBand, ChWindow } from '../../data/stats-common';
import type { ChHoles } from '../../data/stats-filter';
import type { ChProfileExtra } from '../../data/stats-player';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { haptic } from '../../lib/haptics';
import { NO_DATA } from '../../lib/format';
import { Compare, CupMiss, FairwayStrip, GreenMiss, Ladder, MakeCurve, ParTiles, ScoreMix } from './charts';
import { Empty, More, Panel, Rule, RULE_WINDOW } from './detail';
import { ApproachMore, PuttingMore, ScoringMore, ShortMore, TeeMore } from './GameMore';

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
  hide = false,
  icon,
  title,
  lead,
  sub,
  figs,
  rule,
  more,
  children,
}: {
  id: string;
  /** The phone shows one section at a time (the chips switch it); desktop shows all five. */
  hide?: boolean;
  icon: LucideIcon;
  title: string;
  lead: string;
  sub: string;
  figs: Array<[string, string, string | null, Tone]>;
  /** The window and the rounds this section counts, under its figures. */
  rule: string;
  /** The figures below the headline: a "More detail" disclosure. */
  more: ReactNode;
  children: ReactNode;
}) {
  if (hide) return null;
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
            {n && <dd className="ch-gm__sub">{n}</dd>}
          </div>
        ))}
      </dl>
      <Rule>{rule}</Rule>
      <div className="ch-gm__body">{children}</div>
      {more}
    </section>
  );
}

/**
 * Game detail: every section leads with one head-pro sentence built from the
 * numbers below it, then four figures against the Tour where golf_pga_standards has
 * a Tour average, a line saying which rounds they count, the matched visuals, and a
 * "More detail" disclosure with everything else the production player stats page
 * shows for the area (PARITY.md). Missing shot data reads as a dash and a plain
 * sentence, never a zero.
 */
export function GameDetail({
  s,
  x,
  bench,
  first,
  rounds,
  window: win,
  basis,
  holes = '18',
  puttBands: shotBands = null,
  onRetry,
  phone = false,
}: {
  s: GolfStats;
  /** What the profile reads beyond the shot-level figures: per-round lines, holes, approach proximity, where shots finish. */
  x: ChProfileExtra;
  /** The Tour's averages by metric id (the team's own tour). */
  bench: Record<string, number>;
  first: string;
  rounds: number;
  window: ChWindow;
  /** Which rounds the figures count, in words, when a filter narrows the window ("Tournaments, Sep 1 to Sep 29"); the window's own label when absent. */
  basis?: string;
  /** Which round lengths the figures count: said under each section (a 9-hole round counts as half a round, per 18). */
  holes?: ChHoles;
  /** Make rate by distance from the window's putts in the six bands the Tour grades, for the lead sentence and the Tour table. */
  puttBands?: ChPuttBand[] | null;
  onRetry?: () => void;
  phone?: boolean;
}) {
  const [on, setOn] = useState<string>('scoring');
  const show = (id: string) => !phone || on === id;

  useEffect(() => {
    if (phone) return;
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
  }, [phone]);

  const jump = (id: string) => {
    if (phone && id === on) return;
    haptic('select');
    setOn(id);
    if (phone) return;
    document.getElementById(`gm-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const dist = {
    eagle: s.eaglesPerRound ?? 0,
    birdie: s.birdiesPerRound ?? 0,
    par: s.parsPerRound ?? 0,
    bogey: s.bogeysPerRound ?? 0,
    double: s.doublePlusPerRound ?? 0,
  };
  const totals = { eagle: s.totalEagles, birdie: s.totalBirdies, par: s.totalPars, bogey: s.totalBogeys, double: s.totalDoublePlus };
  const par = (p: 3 | 4 | 5) => {
    const d = s.scoringByPar[`par${p}` as const];
    return { par: p, avg: d.avgToPar == null ? null : p + d.avgToPar, bench: bench[`scoring_par_${p}`] ?? null };
  };
  const pars = [par(3), par(4), par(5)];
  const p5 = pars[2]!;

  // Off the tee
  const fw = s.fairwayPercentage;
  const left = s.missLeftPct;
  const right = s.missRightPct;
  const benchPen = bench.penalty_rate_per_round ?? null;

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
  // Finish when the green is hit, by the calculator's bands. It counts only greens found, which is not the Tour's basis (every approach),
  // so these carry no Tour tick; the comparison is the three bands below, which count every approach as the Tour does.
  const proxBands: Array<[string, number | null]> = [
    ['50–75', s.approachProx30_75],
    ['75–100', s.approachProx75_100],
    ['100–125', s.approachProx100_125],
    ['125–150', s.approachProx125_150],
    ['150–175', s.approachProx150_175],
    ['175–200', s.approachProx175_200],
    ['200+', s.approachProx200_225 ?? s.approachProx225Plus],
  ];
  const tourProx = (x.approach ?? []).map((b) => ({ band: b.label.replace('-', '–').replace(' yd', ''), value: b.value, bench: b.bench, n: b.shots, floor: b.floor }));
  const worstProx = tourProx.filter((b) => b.value != null && b.bench != null).sort((a, b) => b.value! - b.bench! - (a.value! - a.bench!))[0];
  const missShort = (s.approachMissShortPct ?? 0) + (s.approachMissShortLeftPct ?? 0) + (s.approachMissShortRightPct ?? 0);
  const missLong = (s.approachMissLongPct ?? 0) + (s.approachMissLongLeftPct ?? 0) + (s.approachMissLongRightPct ?? 0);
  const hasMiss = s.approachMissTotal > 0;

  // Short game
  const benchScrFw = bench.scrambling_pct_fairway ?? null;
  const benchScrRough = bench.scrambling_pct_rough ?? null;
  const benchSand = bench.scrambling_pct_sand ?? null;

  // Putting: the curve is the calculator's nine bands from the window's own putts (exact counts past 20 feet); without the putt read it stops at 20 feet.
  const nine = x.puttBandsNine;
  const curve = nine
    ? nine.map((b) => ({ band: b.label.replace(' ft', ''), value: b.attempts ? (b.made / b.attempts) * 100 : null, bench: b.bench, n: b.attempts }))
    : [
        { band: '0–3', value: s.puttMakePct0_3, bench: null, n: s.puttMakeCount0_3 },
        { band: '3–5', value: s.puttMakePct3_5, bench: bench.putts_made_3_5ft_pct ?? null, n: s.puttMakeCount3_5 },
        { band: '5–10', value: s.puttMakePct5_10, bench: bench.putts_made_5_10ft_pct ?? null, n: s.puttMakeCount5_10 },
        { band: '10–15', value: s.puttMakePct10_15, bench: bench.putts_made_10_15ft_pct ?? null, n: s.puttMakeCount10_15 },
        // No Tour mark: the Tour's standard is 15-25 feet, and this band is 15-20 (graded like with like only in the six Tour bands).
        { band: '15–20', value: s.puttMakePct15_20, bench: null, n: s.puttMakeCount15_20 },
      ];
  // The lead names the band furthest under the Tour, from the six bands the Tour publishes (not the nine, which reuse a standard across bands).
  const leadBands = shotBands
    ? shotBands.map((b) => ({ band: b.label.replace(' ft', ''), value: b.attempts ? (b.made / b.attempts) * 100 : null, bench: b.bench, n: b.attempts }))
    : curve;
  const worstPutt = leadBands
    .filter((b) => b.value != null && b.bench != null && b.n >= 10)
    .sort((a, b) => (a.value! - a.bench!) - (b.value! - b.bench!))[0];
  const onePuttRate = s.holesPlayed ? (s.onePuttsTotal / s.holesPlayed) * 100 : null;
  const lag = Object.entries(s.approachPuttAvgLeaveByBand ?? {}).filter(([, v]) => v != null);
  const brk = (['straight', 'left_to_right', 'right_to_left'] as const).map((k) => ({
    label: k === 'straight' ? 'Straight' : k === 'left_to_right' ? 'Left to right' : 'Right to left',
    value: avgMake(s.puttingByBreak[k]),
    sub: `${s.puttingByBreak[k].count0_3 + s.puttingByBreak[k].count3_5 + s.puttingByBreak[k].count5_10} putts inside 10 ft`,
  }));

  const sample = `${rounds} ${rounds === 1 ? 'round' : 'rounds'} · ${s.totalPutts} putts · ${s.girOpportunities} approaches`;
  // What every section counts: the window's own rounds, of the lengths the filter chose, the same ones the Rounds table lists.
  const lengths =
    holes === '18'
      ? '18 holes only (9-hole rounds are left out)'
      : `${holes === '9' ? '9-hole rounds' : '18- and 9-hole rounds'}; per-round figures are per 18 holes (a 9-hole round counts as half a round)`;
  const basisLine = `${basis ?? RULE_WINDOW[win]} · ${rounds} ${rounds === 1 ? 'round' : 'rounds'}, ${lengths}`;
  const open = !phone;

  return (
    <div className={'ch-gd' + (phone ? ' is-phone' : '')}>
      <nav className="ch-gd__nav" aria-label="Game sections">
        {SECTIONS.map(([id, l]) => (
          <button key={id} type="button" className="ch-pill" aria-pressed={on === id} onClick={() => jump(id)}>
            {l}
          </button>
        ))}
        <span className="ch-gd__src">{sample} logged</span>
      </nav>
      {x.truncated && (
        <p className="ch-gx-rule" data-ch-code="CH-5319">
          This window has more rounds than the shot-level figures read, so they cover the newest 100.
        </p>
      )}

      <Sec
        id="scoring"
        hide={!show('scoring')}
        icon={Flag}
        title="Scoring"
        sub={`${s.roundsPlayed} rounds`}
        rule={`${basisLine}. Every scored hole of those rounds.`}
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
          ['Doubles or worse', num(s.doublePlusPerRound), bench.big_number_rate != null ? `Tour ${bench.big_number_rate}% of holes` : null, undefined],
        ]}
        more={
          <More open={open}>
            <ScoringMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="What an average round looks like" wide note="Holes per round by result, then the holes they add up to. Doubles or worse are the quickest place to save strokes.">
          <ScoreMix d={dist} totals={totals} />
        </Panel>
        <Panel title="Scoring by par" wide>
          <ParTiles rows={pars} />
        </Panel>
      </Sec>

      <Sec
        id="tee"
        hide={!show('tee')}
        icon={MoveUpRight}
        title="Off the tee"
        sub={`${s.fairwayOpportunities} drives`}
        rule={`${basisLine}. Par 4 and par 5 tee shots; penalties are logged penalty shots.`}
        lead={
          fw == null
            ? 'No tee shots are logged in this window, so fairways and distance can’t be read yet.'
            : `${first} finds ${Math.round(fw)}% of fairways.${
                left != null && right != null && Math.abs(left - right) >= 1 ? ` When the drive misses it goes ${left > right ? 'left' : 'right'} more often` : ''
              }${s.penaltiesPerRound ? `, and ${s.penaltiesPerRound.toFixed(1)} penalty strokes a round come from the tee` : ''}.`
        }
        figs={[
          ['Fairways hit', pct(fw), s.fairwayOpportunities ? `${s.fairwaysHit} of ${s.fairwayOpportunities} attempts` : null, undefined],
          ['Driver distance', s.drivingDistanceDriverOnly == null ? NO_DATA : `${Math.round(s.drivingDistanceDriverOnly)} yds`, 'Average drive', undefined],
          ['Penalties / round', num(s.penaltiesPerRound), benchPen != null ? `Tour ${benchPen}` : null, tone(s.penaltiesPerRound, benchPen, true)],
          ['Fairways par 5', pct(s.fairwayPctPar5), s.fairwayPctPar4 != null ? `Par 4 ${Math.round(s.fairwayPctPar4)}%` : null, undefined],
        ]}
        more={
          <More open={open}>
            <TeeMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="Where drives finish" note="Share of tee shots on par 4s and 5s.">
          {s.fairwayOpportunities > 0 ? (
            <FairwayStrip opportunities={s.fairwayOpportunities} hit={s.fairwaysHit} left={s.missLeftCount} right={s.missRightCount} />
          ) : (
            <p className="ch-gm-p__empty">No drive results logged.</p>
          )}
        </Panel>
        <Panel title="Distance by club">
          <Compare
            unit=" yds"
            max={320}
            rows={[
              { label: 'All tee shots', value: s.drivingDistanceAvg, sub: 'First shot of each hole' },
              { label: 'Driver', value: s.drivingDistanceDriverOnly, sub: 'Carry and roll' },
              { label: 'Other clubs', value: s.drivingDistanceNonDriverOnly, sub: 'When driver stays in the bag' },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="approach"
        hide={!show('approach')}
        icon={Crosshair}
        title="Approach"
        sub={`${s.girOpportunities} approach shots`}
        rule={`${basisLine}. Every approach, whether the green is hit or missed.`}
        lead={
          s.girPercentage == null
            ? 'No approach shots are logged in this window.'
            : worstProx && worstProx.value! > worstProx.bench!
              ? `${first} hits ${Math.round(s.girPercentage)}% of greens. The biggest gap to the Tour is from ${worstProx.band} yards, finishing ${Math.round(worstProx.value!)} feet away against ${Math.round(worstProx.bench!)}.`
              : `${first} hits ${Math.round(s.girPercentage)}% of greens in regulation.`
        }
        figs={[
          ['Greens in regulation', pct(s.girPercentage), bench.gir_pct != null ? `Tour ${bench.gir_pct}%` : null, tone(s.girPercentage, bench.gir_pct)],
          ['Proximity · all', s.approachProximityAvg == null ? NO_DATA : `${Math.round(s.approachProximityAvg)} ft`, 'Every approach', undefined],
          ['Missed short', hasMiss ? pct(missShort) : NO_DATA, 'Of missed greens', hasMiss && missShort > missLong ? 'loss' : undefined],
          ['From the rough', pct(s.girPctFromRough), s.girPctFromFairway != null ? `GIR · fairway ${Math.round(s.girPctFromFairway)}%` : null, undefined],
        ]}
        more={
          <More open={open}>
            <ApproachMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="Greens hit by distance" wide note="Bars are the GIR rate from each band.">
          <Ladder rows={girBands.map(([band, value]) => ({ band, value, bench: null }))} unit="%" label="Yards to the pin" />
        </Panel>
        <Panel title="Proximity against the Tour" wide note="Average finish in feet from every approach, hit or missed, lay-ups left out; shorter is better. The dashed tick is the Tour average for that range. A range needs 10 shots.">
          {x.approachError ? (
            <InlineNotice code="CH-5210" title="Proximity against the Tour didn't load." body="The rest of Game detail is correct. Try again; the error has been reported." onRetry={onRetry} />
          ) : tourProx.length ? (
            <>
              <Ladder rows={tourProx.map((b) => ({ band: b.band, value: b.value, bench: b.bench }))} unit={'′'} label="Yards to the pin" invert />
              {tourProx.some((b) => b.value == null) && (
                <p className="ch-gm-p__empty" data-ch-code="CH-5316">
                  {tourProx
                    .filter((b) => b.value == null)
                    .map((b) => `${b.band} yards: ${b.n ? `${b.n} ${b.n === 1 ? 'shot' : 'shots'}, under ${b.floor}` : 'no shots'}`)
                    .join(' · ')}
                </p>
              )}
            </>
          ) : (
            <Empty code="CH-5316">No approach shots with a finish distance are logged in this window.</Empty>
          )}
        </Panel>
        <Panel title="Finish when the green is hit" wide note="Average finish in feet by the distance hit from; shorter is better. Counts greens found only, so it has no Tour tick.">
          <Ladder rows={proxBands.map(([band, value]) => ({ band, value, bench: null }))} unit={'′'} label="Yards to the pin" invert />
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
        <Panel title="Greens hit by lie" note="Counts are approaches from each lie.">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: 'Fairway', value: s.girPctFromFairway, sub: `${s.girCountFromFairway} approaches` },
              { label: 'Rough', value: s.girPctFromRough, sub: `${s.girCountFromRough} approaches` },
              { label: 'Sand', value: s.girPctFromSand, sub: `${s.girCountFromSand} approaches` },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="short"
        hide={!show('short')}
        icon={FlagTriangleRight}
        title="Short game"
        sub={`${s.scrambleAttempts} chances`}
        rule={`${basisLine}. Chances are greens missed; chips and pitches are counted by the lie they were played from.`}
        lead={
          s.scramblingPercentage == null
            ? 'No up-and-down chances are logged in this window.'
            : `${first} gets up and down ${Math.round(s.scramblingPercentage)}% of the time.${
                s.scramblingPctRough != null ? ` From the rough it's ${Math.round(s.scramblingPctRough)}%` : ''
              }${s.sandSavePercentage != null ? `, and sand saves are ${Math.round(s.sandSavePercentage)}%` : ''}.`
        }
        figs={[
          ['Scrambling', pct(s.scramblingPercentage), s.scrambleAttempts ? `${s.scramblesMade} of ${s.scrambleAttempts} chances` : null, undefined],
          ['Sand saves', pct(s.sandSavePercentage), benchSand != null ? `Tour ${benchSand}%` : s.sandSaveAttempts ? `${s.sandSavesMade} of ${s.sandSaveAttempts}` : null, tone(s.sandSavePercentage, benchSand)],
          ['Inside 10 yds', pct(s.scramblingPct0_10), 'Up and down', undefined],
          ['From the rough', pct(s.scramblingPctRough), benchScrRough != null ? `Tour ${benchScrRough}%` : `${s.scrambleRoughAttempts} attempts`, tone(s.scramblingPctRough, benchScrRough)],
        ]}
        more={
          <More open={open}>
            <ShortMore s={s} />
          </More>
        }
      >
        <Panel title="Up and down by lie" note="Counts are attempts in the window.">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: 'Fringe', value: s.scramblingPctFringe, sub: `${s.scrambleFringeAttempts} attempts` },
              { label: 'Fairway', value: s.scramblingPctFairway, sub: `${s.scrambleFairwayAttempts} attempts${benchScrFw != null ? ` · Tour ${benchScrFw}%` : ''}` },
              { label: 'Rough', value: s.scramblingPctRough, sub: `${s.scrambleRoughAttempts} attempts${benchScrRough != null ? ` · Tour ${benchScrRough}%` : ''}` },
              { label: 'Sand', value: s.scramblingPctSand, sub: `${s.scrambleSandAttempts} attempts${benchSand != null ? ` · Tour ${benchSand}%` : ''}` },
            ]}
          />
        </Panel>
        <Panel title="Up and down by distance" note="The last band is everything over 20 yards.">
          <Compare
            unit="%"
            max={100}
            rows={[
              { label: '0–10 yds', value: s.scramblingPct0_10 },
              { label: '10–20 yds', value: s.scramblingPct10_20 },
              { label: '20+ yds', value: s.scramblingPct20_30 },
            ]}
          />
        </Panel>
      </Sec>

      <Sec
        id="putting"
        hide={!show('putting')}
        icon={CircleDot}
        title="Putting"
        sub={`${s.totalPutts} putts`}
        rule={`${basisLine}. Putts per round are per 18 holes; make rates count the putts logged with a distance.`}
        lead={
          s.totalPutts === 0
            ? 'No putts are logged in this window.'
            : worstPutt && worstPutt.value! < worstPutt.bench!
              ? `From ${worstPutt.band} feet ${first} makes ${Math.round(worstPutt.value!)}%. The Tour rate is ${Math.round(worstPutt.bench!)}%, so that range costs the most.`
              : `${first} averages ${num(s.puttsPerGir, 2)} putts per green hit and ${num(s.threePuttsPerRound)} three-putts a round.`
        }
        figs={[
          ['Putts / GIR', num(s.puttsPerGir, 2), null, undefined],
          ['3-putts / round', num(s.threePuttsPerRound), null, undefined],
          ['One-putt rate', pct(onePuttRate), 'Of holes', undefined],
          ['First putt', s.firstPuttDistanceAvg == null ? NO_DATA : `${s.firstPuttDistanceAvg.toFixed(1)} ft`, 'Average start', undefined],
        ]}
        more={
          <More open={open}>
            <PuttingMore s={s} x={x} sixBands={shotBands} />
          </More>
        }
      >
        <Panel title="Make rate by distance" wide note={`Green line is the player, dashed champagne is the Tour. Each band needs 10 or more putts to grade.${nine ? ' Counts are putts logged with a distance. The Tour publishes five averages, so 15 to 25 feet share one and 25 feet and beyond share one.' : ''}`}>
          {x.puttsError && <InlineNotice code="CH-5211" title="Putts past 20 feet didn't load." body="The curve stops at 20 feet. Try again; the error has been reported." onRetry={onRetry} />}
          <MakeCurve bands={curve} />
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
