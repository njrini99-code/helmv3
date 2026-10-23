'use client';

import { ArrowRight, CircleDot, Crosshair, Flag, FlagTriangleRight, MoveUpRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { gameSectionFromHash } from './legs';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChSessionState } from '../../lib/session-state';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { holeCoverage } from '../../data/round-scope';
import type { ChPuttBand, ChWindow } from '../../data/stats-common';
import type { ChHoles } from '../../data/stats-filter';
import type { ChReadArea } from '../../data/coachhelm-classify';
import type { ChStatsReads } from '../../data/stats-reads';
import type { ChProfileExtra } from '../../data/stats-player';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { EmptyState } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { formatFixed, formatPct, NO_DATA } from '../../lib/format';
import { floorRate, sampleState } from '../../lib/stats-signal';
import { Compare, CupMiss, FairwayStrip, GreenMiss, Ladder, ParTiles } from './charts';
import { PuttBands } from './PuttBands';
import type { PuttBandInput } from './putt-bands';
import { ScoreMixBar } from './ScoreMixBar';
import { Empty, More, Panel, Rule, RULE_WINDOW } from './detail';
import { ApproachMore, PuttingMore, ScoringMore, ShortMore, TeeMore } from './GameMore';
import { readsLineParts, READS_FAILED } from './reads-line';
import { plural } from '../../lib/plural';

type Tone = 'gain' | 'loss' | undefined;
const pct = formatPct;
const num = formatFixed;
/** Green when on the right side of the benchmark, amber when not, no colour without one. */
const tone = (v: number | null | undefined, ref: number | null | undefined, lowerIsBetter = false): Tone =>
  v == null || ref == null ? undefined : (lowerIsBetter ? v <= ref : v >= ref) ? 'gain' : 'loss';

/** A figure: label, value, the line under it, its tone, and what it needs when it is under its floor (said in place of the value). */
type Fig = [string, string, string | null, Tone, string?];

/**
 * A rate held to its floor (A7): under it the figure says what it needs, never "100%" from one bunker shot; between the floors
 * the value stays, untoned, with its early-read tag; from the steady floor it reads as before. `n` is in the floor's own unit.
 */
function floorFig(label: string, kind: 'fraction' | 'scramble', n: number, v: number | null | undefined, note: string | null, t: Tone): Fig {
  const f = floorRate(kind, n, v ?? null);
  if (f.needs) return [label, NO_DATA, null, undefined, f.needs];
  if (f.early) return [label, pct(f.value), [f.early, note].filter(Boolean).join(' · '), undefined];
  return [label, pct(v), note, t];
}

const SECTIONS = [
  ['scoring', 'Scoring'],
  ['tee', 'Off the tee'],
  ['approach', 'Approach'],
  ['short', 'Short game'],
  ['putting', 'Putting'],
] as const;

/**
 * "CoachHelm sees…" under a section's rule (spec D build A): how many current reads in this area are costing strokes and how many
 * are working, and the Deep dive, as one link. Nothing when the reads are off, failed (one line under the chips says so) or none.
 */
function ReadsLine({ reads, area }: { reads: ChStatsReads | undefined; area: ChReadArea }) {
  const r = reads?.status === 'ready' ? reads.byArea[area] : undefined;
  const parts = r ? readsLineParts(area, r) : null;
  if (!r || !parts) return null;
  return (
    <p className="ch-gm__reads">
      <Link href={r.href} className="ch-gm__reads-a">
        <span>
          {parts.map((part, i) => (typeof part === 'number' ? <span key={i} className="ch-num">{part}</span> : part))}{' '}
          <span className="ch-gm__reads-go">
            Deep dive <Icon icon={ArrowRight} size={14} />
          </span>
        </span>
      </Link>
    </p>
  );
}

/** What a figure that has nothing behind it says in place of a bare dash (the phone's brief): the reason, in a few words. */
const NONE_REASON: Record<string, string> = {
  'scoring:Scoring average': 'No scores yet',
  'scoring:Birdies / round': 'No holes scored',
  'scoring:Bogeys / round': 'No holes scored',
  'scoring:Doubles or worse': 'No holes scored',
  'tee:Fairways hit': 'No drives logged',
  'tee:Driver distance': 'No driver shots',
  'tee:Penalties / round': 'No rounds with shots',
  'tee:Fairways par 5': 'No par 5 drives',
  'approach:Greens in regulation': 'No approach shots',
  'approach:Proximity · all': 'No finish distances',
  'approach:Missed short': 'No missed greens',
  'approach:From the rough': 'No rough approaches',
  'short:Scrambling': 'No chances yet',
  'short:Sand saves': 'No bunker shots',
  'short:Inside 10 yds': 'No chances this close',
  'short:From the rough': 'No rough chances',
  'putting:Putts / GIR': 'No putts tracked',
  'putting:3-putts / round': 'No putts tracked',
  'putting:One-putt rate': 'No putts tracked',
  'putting:First putt': 'No putts tracked',
};

function Sec({
  id,
  hide = false,
  icon,
  title,
  lead,
  sub,
  figs,
  rule,
  how,
  reads,
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
  figs: Fig[];
  /** The window and the rounds this section counts, under its figures. */
  rule: string;
  /** The phone's long account of what the rule line counts, behind "How this is measured" (the line above is then the short one). */
  how?: string;
  /** "CoachHelm sees…" for this section, under its rule. */
  reads?: ReactNode;
  /** The figures below the headline: a "More detail" disclosure. */
  more: ReactNode;
  children: ReactNode;
}) {
  if (hide) return null;
  return (
    <section className="ch-gm" id={`gm-${id}`} aria-labelledby={`gm-${id}-t`}>
      <div className="ch-gm__id">
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
          {figs.map(([l, v, n, t, needs]) => {
            const reason = needs ?? (v === NO_DATA ? NONE_REASON[`${id}:${l}`] : undefined);
            return (
              <div key={l}>
                <dt>{l}</dt>
                <dd className={reason ? 'ch-gm__none' : `ch-num${t ? ` ch-${t}` : ''}`}>{reason ?? v}</dd>
                {n && v !== NO_DATA && <dd className="ch-gm__sub">{n}</dd>}
              </div>
            );
          })}
        </dl>
        <Rule how={how}>{rule}</Rule>
        {reads}
      </div>
      <div className="ch-gm__vis">
        <div className="ch-gm__body">{children}</div>
        {more}
      </div>
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
  reads,
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
  /** What CoachHelm sees in each section (data/stats-reads.ts); absent or off draws nothing. */
  reads?: ChStatsReads;
  onRetry?: () => void;
  phone?: boolean;
}) {
  // The player reading their own stats is "You": the verb agrees and mid-sentence it is lower case (F-45).
  const reduced = useChReducedMotion();
  const you = first === 'You';
  const verb = (third: string, base: string) => (you ? base : third);
  const mid = you ? 'you' : first;
  // On the phone `on` is a choice (one section at a time) and comes back when the coach returns to the page (PAGE_PERFORMANCE.md rule 1);
  // on desktop it only follows the scroll, so it is not kept.
  const [chosen, setChosen] = useChSessionState<string>('game-section', 'scoring');
  const [spied, setSpied] = useState<string>('scoring');
  const on = phone ? chosen : spied;
  const setOn = phone ? setChosen : setSpied;
  const show = (id: string) => !phone || on === id;

  useEffect(() => {
    if (phone) return;
    const els = SECTIONS.map(([id]) => document.getElementById(`gm-${id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setSpied(top.target.id.replace('gm-', ''));
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [phone]);

  // An address that ends `#gm-<section>` (the team grid's leg figures) names the phone's section: it is chosen, then scrolled
  // to once it is in the page, since the phone draws only the chosen one. A new request each time, so the same hash twice scrolls twice.
  const [asked, setAsked] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (!phone) return;
    const read = () => {
      const id = gameSectionFromHash(window.location.hash);
      if (!id) return;
      setChosen(id);
      setAsked({ id });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [phone, setChosen]);
  useEffect(() => {
    if (!phone || !asked || on !== asked.id) return;
    const el = document.getElementById(`gm-${asked.id}`);
    if (!el) return;
    setAsked(null);
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [phone, asked, on, reduced]);

  const jump = (id: string) => {
    if (phone && id === on) return;
    haptic('select');
    setOn(id);
    if (phone) return;
    document.getElementById(`gm-${id}`)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  };

  const dist = {
    eagle: s.eaglesPerRound ?? 0,
    birdie: s.birdiesPerRound ?? 0,
    par: s.parsPerRound ?? 0,
    bogey: s.bogeysPerRound ?? 0,
    double: s.doublePlusPerRound ?? 0,
  };
  const totals = { eagle: s.totalEagles, birdie: s.totalBirdies, par: s.totalPars, bogey: s.totalBogeys, double: s.totalDoublePlus };
  // Doubles or worse are said as a share of the holes scored, the unit the Tour's figure is in (a per-round count set beside a share of holes is not a comparison).
  const holesScored = totals.eagle + totals.birdie + totals.par + totals.bogey + totals.double;
  const doublePct = holesScored > 0 ? (totals.double / holesScored) * 100 : null;
  const par = (p: 3 | 4 | 5) => {
    const d = s.scoringByPar[`par${p}` as const];
    return { par: p, avg: d.avgToPar == null ? null : p + d.avgToPar, bench: bench[`scoring_par_${p}`] ?? null };
  };
  const pars = [par(3), par(4), par(5)];
  const p5 = pars[2]!;

  // Off the tee
  const fw = s.fairwayPercentage;
  // The fairway and green rates' floors count rounds with a chance at them (A7): the window's rounds, once any is logged.
  const fwRounds = s.fairwayOpportunities ? rounds : 0;
  const girRounds = s.girOpportunities ? rounds : 0;
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

  // Putting: the make-rate chart reads the window's own putts in the six bands the Tour grades (0–3 to 25+ ft, exact made and
  // tried); without the putt read it falls back to the calculator's own rates, which stop at 20 feet.
  const cacheBands = [
    { band: '0–3', value: s.puttMakePct0_3, bench: null, n: s.puttMakeCount0_3 },
    { band: '3–5', value: s.puttMakePct3_5, bench: bench.putts_made_3_5ft_pct ?? null, n: s.puttMakeCount3_5 },
    { band: '5–10', value: s.puttMakePct5_10, bench: bench.putts_made_5_10ft_pct ?? null, n: s.puttMakeCount5_10 },
    { band: '10–15', value: s.puttMakePct10_15, bench: bench.putts_made_10_15ft_pct ?? null, n: s.puttMakeCount10_15 },
    // No Tour mark: the Tour's standard is 15-25 feet, and this band is 15-20 (graded like with like only in the six Tour bands).
    { band: '15–20', value: s.puttMakePct15_20, bench: null, n: s.puttMakeCount15_20 },
  ];
  // The calculator keeps a rate and a count, not the putts made: the band carries the rate as kept and says its count.
  const curve: PuttBandInput[] = shotBands
    ? shotBands.map((b) => ({ label: b.label, made: b.made, attempts: b.attempts, bench: b.bench }))
    : cacheBands.map((b) => ({ label: `${b.band} ft`, made: null, rate: b.value, attempts: b.n, bench: b.bench }));
  // The lead names the band furthest under the Tour, from the six bands the Tour publishes (not the nine, which reuse a standard across bands).
  const leadBands = shotBands
    ? shotBands.map((b) => ({ band: b.label.replace(' ft', ''), value: b.attempts ? (b.made / b.attempts) * 100 : null, bench: b.bench, n: b.attempts }))
    : cacheBands;
  const worstPutt = leadBands
    .filter((b) => b.value != null && b.bench != null && b.n >= 10)
    .sort((a, b) => (a.value! - a.bench!) - (b.value! - b.bench!))[0];
  const onePuttRate = s.holesPlayed ? (s.onePuttsTotal / s.holesPlayed) * 100 : null;
  // Nearest band first ("0_3", "3_5", ... "35_plus"), whatever order the cache keeps them in (F-54).
  const lag = Object.entries(s.approachPuttAvgLeaveByBand ?? {})
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b));
  const brk = (['straight', 'left_to_right', 'right_to_left'] as const).map((k) => ({
    label: k === 'straight' ? 'Straight' : k === 'left_to_right' ? 'Left to right' : 'Right to left',
    value: avgMake(s.puttingByBreak[k]),
    sub: `${s.puttingByBreak[k].count0_3 + s.puttingByBreak[k].count3_5 + s.puttingByBreak[k].count5_10} putts inside 10 ft`,
  }));

  // Every figure below but the scoring average reads the rounds with their holes scored; a round posted as a total only is a score and nothing else (Q-123).
  const holeCount = x.holeRounds ?? rounds;
  const sample = `${plural(holeCount, 'round')} · ${s.totalPutts} putts · ${s.girOpportunities} approaches`;
  // What every section counts: the window's own rounds, of the lengths the filter chose, the same ones the Rounds table lists.
  const lengths =
    holes === '18'
      ? '18 holes only (9-hole rounds are left out)'
      : `${holes === '9' ? '9-hole rounds' : '18- and 9-hole rounds'}; per-round figures are per 18 holes (a 9-hole round counts as half a round)`;
  const coverage = holeCoverage(holeCount, rounds);
  const basisLine = `${basis ?? RULE_WINDOW[win]} · ${plural(rounds, 'round')}, ${lengths}${coverage ? `. ${coverage}, the rest posted as a total only` : ''}`;
  // The phone's one short line: the window, and how many rounds count. "Last 10 rounds" with three behind it says three qualify, not that ten were read (likewise Last 5 and Last 20).
  const lastN = Number(/^Last (\d+) rounds$/.exec(basis ?? RULE_WINDOW[win])?.[1]);
  const fewer = win === 'last10' && lastN > 0 && rounds < lastN;
  const kept = /hole/i.test(basis ?? '') ? null : holes === '18' ? '18 holes only' : holes === '9' ? '9 holes only' : '18 and 9 holes';
  const shortBasis = `${basis ?? RULE_WINDOW[win]} · ${fewer ? `${plural(rounds, 'round qualifies', 'rounds qualify')}` : `${plural(rounds, 'round')}`}${kept ? `, ${kept}` : ''}`;
  /** The rule under a section's figures: the long line on a screen; on the phone the short line, and the rest behind "How this is measured". */
  const ruleOf = (tail: string) => (phone ? { rule: shortBasis, how: `${basisLine}. ${tail}` } : { rule: `${basisLine}. ${tail}` });
  /** A panel's note: the whole paragraph on a screen; on the phone one short line, and the paragraph behind "How this is measured". */
  const noteOf = (long: string, short: string) => (phone ? { note: short, how: long } : { note: long });

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
      {reads?.status === 'failed' && (
        <p className="ch-gx-rule" data-ch-code="CH-5215">
          {READS_FAILED}
        </p>
      )}
      {x.truncated && (
        <p className="ch-gx-rule" data-ch-code="CH-5319">
          This window has more rounds than the shot-level figures read, so they cover the newest 100.
        </p>
      )}

      <Sec
        id="scoring"
        hide={!show('scoring')}
        reads={<ReadsLine reads={reads} area="scoring" />}
        icon={Flag}
        title="Scoring"
        sub={`${s.roundsPlayed} rounds`}
        {...ruleOf('Every scored hole of those rounds.')}
        lead={
          s.roundsPlayed
            ? `${first} ${verb('makes', 'make')} ${dist.birdie.toFixed(1)} birdies and ${dist.double.toFixed(1)} doubles a round.${
                p5.avg != null ? ` Par 5s ${p5.avg < 5 ? 'are a scoring chance' : 'are giving shots back'}, playing ${p5.avg.toFixed(2)} on average.` : ''
              }`
            : `No hole-by-hole scores in this window yet.`
        }
        figs={[
          ['Scoring average', num(s.scoringAverage18 ?? s.scoringAverage), 'Per 18 holes', undefined],
          ['Birdies / round', num(s.birdiesPerRound), null, undefined],
          ['Bogeys / round', num(s.bogeysPerRound), null, undefined],
          [
            'Doubles or worse',
            num(s.doublePlusPerRound),
            doublePct == null ? null : `${formatPct(doublePct)} of holes${bench.big_number_rate != null ? ` · Tour ${bench.big_number_rate}%` : ''}`,
            doublePct != null && bench.big_number_rate != null ? (doublePct <= bench.big_number_rate ? 'gain' : 'loss') : undefined,
          ],
        ]}
        more={
          <More>
            <ScoringMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="What an average round looks like" wide {...noteOf('Every scored hole by result, under par to the left and over par to the right, with each result a round. Select one for the holes behind it. Doubles or worse are the quickest place to save strokes.', 'Doubles or worse are the quickest place to save strokes.')}>
          <ScoreMixBar counts={totals} perRound={dist} triple={x.triplePlus} label="Every hole, by result" />
        </Panel>
        <Panel title="Scoring by par" wide>
          <ParTiles rows={pars} />
        </Panel>
      </Sec>

      <Sec
        id="tee"
        hide={!show('tee')}
        reads={<ReadsLine reads={reads} area="tee" />}
        icon={MoveUpRight}
        title="Off the tee"
        sub={`${s.fairwayOpportunities} drives`}
        {...ruleOf('Par 4 and par 5 tee shots; penalties are logged penalty shots.')}
        lead={
          fw == null
            ? 'No tee shots are logged in this window, so fairways and distance can’t be read yet.'
            : sampleState('fraction', fwRounds) === 'none'
              ? `${s.fairwaysHit} of ${s.fairwayOpportunities} fairways so far: too few rounds to read as a rate yet.`
              : `${first} ${verb('finds', 'find')} ${Math.round(fw)}% of fairways.${
                left != null && right != null && Math.abs(left - right) >= 1 ? ` When the drive misses it goes ${left > right ? 'left' : 'right'} more often` : ''
              }${s.penaltiesPerRound ? `, and ${s.penaltiesPerRound.toFixed(1)} penalty strokes a round come from the tee` : ''}.`
        }
        figs={[
          floorFig('Fairways hit', 'fraction', fwRounds, fw, s.fairwayOpportunities ? `${s.fairwaysHit} of ${s.fairwayOpportunities} attempts` : null, undefined),
          ['Driver distance', s.drivingDistanceDriverOnly == null ? NO_DATA : `${Math.round(s.drivingDistanceDriverOnly)} yds`, 'Average drive', undefined],
          ['Penalties / round', num(s.penaltiesPerRound), benchPen != null ? `Tour ${benchPen}` : null, tone(s.penaltiesPerRound, benchPen, true)],
          ['Fairways par 5', pct(s.fairwayPctPar5), s.fairwayPctPar4 != null ? `Par 4s: ${Math.round(s.fairwayPctPar4)}%` : null, undefined],
        ]}
        more={
          <More>
            <TeeMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="Where drives finish" note="Share of tee shots on par 4s and 5s.">
          {s.fairwayOpportunities > 0 ? (
            <FairwayStrip opportunities={s.fairwayOpportunities} hit={s.fairwaysHit} left={s.missLeftCount} right={s.missRightCount} />
          ) : (
            <EmptyState compact code="CH-5317" title="No drive results logged." />
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
        reads={<ReadsLine reads={reads} area="approach" />}
        icon={Crosshair}
        title="Approach"
        sub={`${s.girOpportunities} approach shots`}
        {...ruleOf('Every approach, whether the green is hit or missed.')}
        lead={
          s.girPercentage == null
            ? 'No approach shots are logged in this window.'
            : sampleState('fraction', girRounds) === 'none'
              ? 'Greens in regulation needs two rounds before it reads as a rate.'
              : worstProx && worstProx.value! > worstProx.bench!
              ? `${first} ${verb('hits', 'hit')} ${Math.round(s.girPercentage)}% of greens. The biggest gap to the Tour is from ${worstProx.band} yards, finishing ${Math.round(worstProx.value!)} feet away against ${Math.round(worstProx.bench!)}.`
              : `${first} ${verb('hits', 'hit')} ${Math.round(s.girPercentage)}% of greens in regulation.`
        }
        figs={[
          floorFig('Greens in regulation', 'fraction', girRounds, s.girPercentage, bench.gir_pct != null ? `Tour ${bench.gir_pct}%` : null, tone(s.girPercentage, bench.gir_pct)),
          ['Proximity · all', s.approachProximityAvg == null ? NO_DATA : `${Math.round(s.approachProximityAvg)} ft`, 'Every approach', undefined],
          ['Missed short', hasMiss ? pct(missShort) : NO_DATA, 'Of missed greens', hasMiss && missShort > missLong ? 'loss' : undefined],
          ['From the rough', pct(s.girPctFromRough), s.girPctFromFairway != null ? `GIR · fairway ${Math.round(s.girPctFromFairway)}%` : null, undefined],
        ]}
        more={
          <More>
            <ApproachMore s={s} x={x} onRetry={onRetry} />
          </More>
        }
      >
        <Panel title="Greens hit by distance" wide note="Bars are the GIR rate from each band.">
          <Ladder rows={girBands.map(([band, value]) => ({ band, value, bench: null }))} unit="%" label="Yards to the pin" phone={phone} />
        </Panel>
        <Panel
          title="Proximity against the Tour"
          wide
          {...noteOf(
            'Average finish in feet from every approach, hit or missed, lay-ups left out; shorter is better. The dashed tick is the Tour average for that range. A range needs 10 shots.',
            'Shorter is better. The tick is the Tour.',
          )}
        >
          {x.approachError ? (
            <InlineNotice code="CH-5210" title="Proximity against the Tour didn’t load." body="The rest of Game detail is correct. Try again." onRetry={onRetry} />
          ) : tourProx.length ? (
            <>
              <Ladder rows={tourProx.map((b) => ({ band: b.band, value: b.value, bench: b.bench, n: b.n, floor: b.floor }))} unit=" ft" label="Yards to the pin" invert phone={phone} code="CH-5316" />
              {/* On a phone each band's own row says it ("Needs 10", with its shots); a screen says it in a line under the chart. */}
              {!phone && tourProx.some((b) => b.value == null) && (
                <EmptyState
                  compact
                  code="CH-5316"
                  title="Some distances need more shots."
                  body={tourProx
                    .filter((b) => b.value == null)
                    .map((b) => `${b.band} yards: ${b.n ? `${plural(b.n, 'shot')}, under ${b.floor}` : 'no shots'}`)
                    .join(' · ')}
                />
              )}
            </>
          ) : (
            <Empty code="CH-5316">No approach shots with a finish distance are logged in this window.</Empty>
          )}
        </Panel>
        <Panel
          title="Finish when the green is hit"
          wide
          {...noteOf('Average finish in feet by the distance hit from; shorter is better. Counts greens found only, so it has no Tour tick.', 'Shorter is better. Greens found only.')}
        >
          <Ladder rows={proxBands.map(([band, value]) => ({ band, value, bench: null }))} unit=" ft" label="Yards to the pin" invert phone={phone} none="No greens hit" />
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
            <EmptyState compact code="CH-5317" title="No missed-green directions logged." />
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
        reads={<ReadsLine reads={reads} area="short" />}
        icon={FlagTriangleRight}
        title="Short game"
        sub={`${s.scrambleAttempts} chances`}
        {...ruleOf('Chances are greens missed; chips and pitches are counted by the lie they were played from.')}
        lead={
          s.scramblingPercentage == null
            ? 'No up-and-down chances are logged in this window.'
            : sampleState('scramble', s.scrambleAttempts) === 'none'
              ? `Up and down ${s.scramblesMade} of ${plural(s.scrambleAttempts, 'time')} so far: too few chances to read as a rate yet.`
              : `${first} ${verb('gets', 'get')} up and down ${Math.round(s.scramblingPercentage)}% of the time.${
                  s.scramblingPctRough != null ? ` From the rough it’s ${Math.round(s.scramblingPctRough)}%` : ''
                }${s.sandSavePercentage != null && sampleState('scramble', s.sandSaveAttempts) !== 'none' ? `, and sand saves are ${Math.round(s.sandSavePercentage)}%` : ''}.`
        }
        figs={[
          floorFig('Scrambling', 'scramble', s.scrambleAttempts, s.scramblingPercentage, s.scrambleAttempts ? `${s.scramblesMade} of ${s.scrambleAttempts} chances` : null, undefined),
          floorFig('Sand saves', 'scramble', s.sandSaveAttempts, s.sandSavePercentage, benchSand != null ? `Tour ${benchSand}%` : s.sandSaveAttempts ? `${s.sandSavesMade} of ${s.sandSaveAttempts}` : null, tone(s.sandSavePercentage, benchSand)),
          ['Inside 10 yds', pct(s.scramblingPct0_10), 'Up and down', undefined],
          ['From the rough', pct(s.scramblingPctRough), benchScrRough != null ? `Tour ${benchScrRough}%` : `${s.scrambleRoughAttempts} attempts`, tone(s.scramblingPctRough, benchScrRough)],
        ]}
        more={
          <More>
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
        reads={<ReadsLine reads={reads} area="putting" />}
        icon={CircleDot}
        title="Putting"
        sub={`${s.totalPutts} putts`}
        {...ruleOf('Putts per round are per 18 holes; make rates count the putts logged with a distance.')}
        lead={
          s.totalPutts === 0
            ? 'No putts are logged in this window.'
            : worstPutt && worstPutt.value! < worstPutt.bench!
              ? `From ${worstPutt.band} feet ${mid} ${verb('makes', 'make')} ${Math.round(worstPutt.value!)}%. The Tour rate is ${Math.round(worstPutt.bench!)}%, so that range costs the most.`
              : `${first} ${verb('averages', 'average')} ${num(s.puttsPerGir, 2)} putts per green hit and ${num(s.threePuttsPerRound)} three-putts a round.`
        }
        figs={[
          ['Putts / GIR', num(s.puttsPerGir, 2), null, undefined],
          ['3-putts / round', num(s.threePuttsPerRound), null, undefined],
          ['One-putt rate', pct(onePuttRate), 'Of holes', undefined],
          ['First putt', s.firstPuttDistanceAvg == null ? NO_DATA : `${s.firstPuttDistanceAvg.toFixed(1)} ft`, 'Average start', undefined],
        ]}
        more={
          <More>
            <PuttingMore s={s} x={x} sixBands={shotBands} />
          </More>
        }
      >
        <Panel
          title="Make rate by distance"
          wide
          {...noteOf(
            `Green dots are at or above the Tour, amber below it. A band shows from 10 putts and is graded against the Tour from 30.${shotBands ? ' Counts are putts logged with a distance. The Tour publishes five averages, one for each band past 3 feet.' : ''}`,
            'Amber dots are below the Tour. A band grades from 30 putts.',
          )}
        >
          {x.puttsError && <InlineNotice code="CH-5211" title="Putts past 20 feet didn’t load." body="The curve stops at 20 feet. Try again." onRetry={onRetry} />}
          <PuttBands bands={curve} compact={phone} />
        </Panel>
        <Panel title="How putts miss" wide>
          {/* Four zeros and "100% low side" claimed a pattern that was never logged (F-54). */}
          {[s.puttMissLeftPct, s.puttMissRightPct, s.puttMissShortPct, s.puttMissLongPct].some((v) => v != null && v > 0) ? (
            <CupMiss
              m={{ left: s.puttMissLeftPct, right: s.puttMissRightPct, short: s.puttMissShortPct, long: s.puttMissLongPct, low: s.puttMissLowPct, high: s.puttMissHighPct }}
            />
          ) : (
            <EmptyState compact code="CH-5317" title="No missed-putt directions logged." />
          )}
        </Panel>
        <Panel title="Lag leave">
          {lag.length ? (
            <Compare unit=" ft" max={8} rows={lag.map(([b, v]) => ({ label: `From ${b.replace('_plus', '+').replace('_', '–')} ft`, value: v, sub: 'Left for the next putt' }))} />
          ) : (
            <EmptyState compact code="CH-5317" title="No long first putts logged." />
          )}
        </Panel>
        <Panel title="Make rate by break" note={brk.some((r) => r.value != null) ? 'Putts inside 10 feet.' : undefined}>
          {brk.some((r) => r.value != null) ? (
            <Compare unit="%" max={100} rows={brk} />
          ) : (
            <EmptyState compact code="CH-5317" title="No putts inside 10 feet have a break logged yet." />
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
