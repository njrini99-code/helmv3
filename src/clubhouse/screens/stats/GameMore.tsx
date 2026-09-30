import type { ReactNode } from 'react';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { ChPuttBand } from '../../data/stats-common';
import type { ChProfileExtra } from '../../data/stats-player';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { InlineNotice } from '../../ui/Notices';
import { Compare } from './charts';
import { DataTable, Empty, Panel, RoundLine, SectorGrid, Tiles, type Cell, type Tone } from './detail';

/**
 * Game detail's "More detail": for each section the figures the production
 * player stats page shows below its headline (PARITY.md). Every figure is
 * GolfStats (the calculator production uses) or the window's own round, hole
 * and shot rows, over the same rounds as the section above it. A panel with
 * nothing behind it says so (CH-5317), never a zero.
 */

const pct = (v: number | null | undefined, d = 0) => (v == null ? NO_DATA : `${v.toFixed(d)}%`);
const num = (v: number | null | undefined, d = 1) => (v == null ? NO_DATA : v.toFixed(d));
const ft = (v: number | null | undefined, d = 1) => (v == null ? NO_DATA : `${v.toFixed(d)} ft`);
const tone = (v: number | null | undefined, ref: number | null | undefined, lowerIsBetter = false): Tone =>
  v == null || ref == null ? undefined : (lowerIsBetter ? v <= ref : v >= ref) ? 'gain' : 'loss';

const NOTHING = 'CH-5317';
const LINE = 'CH-5314';

/** A per-round line needs two rounds with the figure; with fewer it says what it needs. */
function ByRound({ points, unit, digits, label, what }: { points: Array<{ label: string; value: number }>; unit: string; digits: number; label: string; what: string }) {
  return points.length >= 2 ? <RoundLine points={points} unit={unit} digits={digits} label={label} /> : <Empty code={LINE}>A line needs two rounds with {what}; this window has {points.length}.</Empty>;
}

/** A shot read that failed is said, not shown as none logged. */
function Shots({ error, code, what, onRetry, children }: { error: boolean; code: string; what: string; onRetry?: () => void; children: ReactNode }) {
  if (!error) return <>{children}</>;
  return <InlineNotice code={code} title={`${what} didn't load.`} body="The rest of Game detail is correct. Try again; the error has been reported." onRetry={onRetry} />;
}

export function ScoringMore({ s, x, onRetry }: { s: GolfStats; x: ChProfileExtra; onRetry?: () => void }) {
  const at = (v: { course: string; date: string } | null) => (v ? `${v.course} · ${v.date}` : null);
  // A 9-hole score and an 18-hole score are not the same best: with 9-hole rounds in the window each length has its own best and worst.
  const mixed = x.nineRounds > 0;
  const lengths: Array<{ label: string; best: number | null; worst: number | null; at: string | null; n: number }> = [
    // The course and date are the window's own best when it is the calculator's (it reads the newest 100 rounds with hole data), never another round's.
    { label: '18-hole', best: s.bestRound18, worst: s.worstRound18, at: x.bests.score?.value === s.bestRound18 ? at(x.bests.score) : null, n: s.roundsPlayed18 },
    { label: '9-hole', best: s.bestRound9, worst: s.worstRound9, at: x.bests9?.score && x.bests9.score.value === s.bestRound9 ? at(x.bests9.score) : null, n: s.roundsPlayed9 },
  ];
  const best = x.bests.score;
  const types: Array<[string, number | null, number]> = [
    ['Practice', s.practiceScoringAvg, s.practiceRounds],
    ['Qualifying', s.qualifyingScoringAvg, s.qualifyingRounds],
    ['Tournament', s.tournamentScoringAvg, s.tournamentRounds],
  ];
  const parMix = ([3, 4, 5] as const).map((p) => ({ p, d: s.scoringByPar[`par${p}` as const] }));
  return (
    <>
      <Panel title="Scoring numbers" wide>
        <Tiles
          label="Scoring numbers"
          items={[
            { label: 'Average to par', value: s.avgScoreToPar == null ? NO_DATA : formatToPar(s.avgScoreToPar, 2), sub: 'Per 18 holes' },
            ...(mixed
              ? lengths
                  .filter((l) => l.n > 0)
                  .flatMap((l) => [
                    { label: `Best ${l.label} round`, value: l.best == null ? NO_DATA : String(l.best), sub: l.at },
                    { label: `Worst ${l.label} round`, value: l.worst == null ? NO_DATA : String(l.worst) },
                  ])
              : [
                  { label: 'Best round', value: s.bestRound == null ? NO_DATA : String(s.bestRound), sub: best && best.value === s.bestRound ? `${best.course} · ${best.date}` : null },
                  { label: 'Worst round', value: s.worstRound == null ? NO_DATA : String(s.worstRound) },
                ]),
          ]}
        />
      </Panel>
      <Panel title="Outcomes by par" wide note="Share of that par's holes, with the average to par a hole.">
        <div className="ch-gx-pars">
          {parMix.map(({ p, d }) =>
            d.total === 0 ? (
              <div key={p} className="ch-gx-pm is-empty" data-ch-code={NOTHING}>
                <b>Par {p}s</b>
                <span>No par {p} holes scored in this window.</span>
              </div>
            ) : (
              <div key={p} className="ch-gx-pm">
                <b>Par {p}s</b>
                <span className="ch-num">
                  {d.avgToPar == null ? NO_DATA : `${formatSigned(d.avgToPar, 2)} / hole`} · {d.total} holes
                </span>
                <div className="ch-mix">
                  <div className="ch-mix__bar" role="img" aria-label={`Par ${p}: birdie or better ${d.eagle + d.birdie}, par ${d.par}, bogey ${d.bogey}, double or worse ${d.doublePlus}, of ${d.total} holes`}>
                    {(
                      [
                        ['is-birdie', d.eagle + d.birdie],
                        ['is-par', d.par],
                        ['is-bogey', d.bogey],
                        ['is-double', d.doublePlus],
                      ] as const
                    ).map(([c, v]) => (v > 0 ? <span key={c} className={`ch-mix__s ${c}`} style={{ flex: v }} /> : null))}
                  </div>
                  <div className="ch-mix__k">
                    {(
                      [
                        ['is-birdie', 'Birdie+', d.eagle + d.birdie],
                        ['is-par', 'Par', d.par],
                        ['is-bogey', 'Bogey', d.bogey],
                        ['is-double', 'Double+', d.doublePlus],
                      ] as const
                    ).map(([c, l, v]) => (
                      <span key={l}>
                        <i className={c} />
                        <b className="ch-num">{Math.round((v / d.total) * 100)}%</b>
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      </Panel>
      <Panel title="By round type" note={mixed ? "Average score per 18 holes of each type's rounds in this window: a 9-hole score counts as half a round." : 'Average score of 18-hole rounds of each type in this window.'}>
        <Tiles
          label="Scoring by round type"
          items={types.map(([l, avg, n]) => ({
            label: l,
            value: avg == null ? NO_DATA : avg.toFixed(1),
            sub: n ? `${n} ${n === 1 ? 'round' : 'rounds'}` : 'No rounds',
            empty: n === 0,
            code: 'CH-5312',
          }))}
        />
      </Panel>
      <Panel title="Streaks and records">
        <Tiles
          label="Streaks and records"
          items={[
            { label: 'Most birdies in a round', value: String(s.mostBirdiesRound) },
            { label: 'Most birdies in a row', value: String(s.mostBirdiesRow) },
            { label: 'Most pars in a row', value: String(s.mostParsRow) },
            { label: 'Longest no-3-putt streak', value: String(s.longestNo3PuttStreak), sub: 'Holes' },
            { label: 'Longest hole-out', value: s.longestHoleOut == null ? NO_DATA : `${s.longestHoleOut.toFixed(0)} yds`, empty: s.longestHoleOut == null, code: NOTHING },
          ]}
        />
      </Panel>
      <Panel title="Toughest holes" wide note={`Average to par by hole number across these rounds. A hole needs ${x.toughest?.minPlays ?? 3} plays to be ranked.`}>
        <Shots error={x.holesError} code="CH-5209" what="Toughest holes" onRetry={onRetry}>
          {x.toughest && x.toughest.holes.length > 0 ? (
            <ol className="ch-gx-rank">
              {x.toughest.holes.map((h, i) => (
                <li key={h.hole}>
                  <span className="ch-gx-rank__n ch-num">{i + 1}</span>
                  <b>
                    Hole {h.hole} · Par {h.par}
                  </b>
                  <em className="ch-num">
                    {h.plays} plays · {h.doublePlus} double or worse
                  </em>
                  <span className={'ch-num ' + (h.avgToPar > 0 ? 'ch-loss' : 'ch-gain')}>{formatSigned(h.avgToPar, 2)}</span>
                </li>
              ))}
            </ol>
          ) : x.toughest?.belowFloor ? (
            <Empty code="CH-5311">Need {x.toughest.minPlays}+ plays of a hole before it can be ranked. No hole has been played that often in this window yet.</Empty>
          ) : (
            <Empty code={NOTHING}>No hole-by-hole scores in this window.</Empty>
          )}
        </Shots>
      </Panel>
    </>
  );
}

export function TeeMore({ s, x, onRetry }: { s: GolfStats; x: ChProfileExtra; onRetry?: () => void }) {
  const type = [
    { label: 'Par 4', value: s.fairwayPctPar4 },
    { label: 'Par 5', value: s.fairwayPctPar5 },
    { label: 'Driver', value: s.fairwayPctDriver },
    { label: 'Other clubs', value: s.fairwayPctNonDriver },
  ];
  const club: Array<[string, number | null, number | null]> = [
    ['Driver', s.missLeftPctDriver, s.missRightPctDriver],
    ['Other clubs', s.missLeftPctNonDriver, s.missRightPctNonDriver],
  ];
  return (
    <>
      <Panel title="Fairways by tee type" note="Fairway rate on par 4 and par 5 tee shots, and by the club used.">
        {type.some((r) => r.value != null) ? <Compare unit="%" max={100} rows={type} /> : <Empty code={NOTHING}>No par 4 or par 5 tee shots are logged in this window.</Empty>}
      </Panel>
      <Panel title="Tee miss by club" note="Share of the lateral misses, by the club used off the tee.">
        {club.some(([, l, r]) => l != null || r != null) ? (
          <DataTable label="Tee miss by club" cols={['Club', 'Left', 'Right']} rows={club.map(([l, a, b]) => ({ key: l, head: l, cells: [pct(a), pct(b)] }))} />
        ) : (
          <Empty code={NOTHING}>No tee misses with a direction are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Where tee shots finish" wide note="Shots with no direction logged count as center, as on the production page.">
        <Shots error={x.sprayError} code="CH-5212" what="Where shots finish" onRetry={onRetry}>
          {x.spray && x.spray.driving.shots > 0 ? <SectorGrid g={x.spray.driving} unit="tee shots" /> : <Empty code="CH-5315">No tee shots with a finish are logged in this window.</Empty>}
        </Shots>
      </Panel>
      <Panel title="Fairways by round" wide>
        <ByRound points={x.series.fairway} unit="%" digits={0} label="Fairways hit by round" what="fairway holes" />
      </Panel>
    </>
  );
}

/** The approach bands the calculator keeps (each lies, each cell an average; it keeps no count per cell). */
const APPROACH_ROWS = [
  ['50–75', '30_75', 'Eff30_75', 'Prox30_75'],
  ['75–100', '75_100', 'Eff75_100', 'Prox75_100'],
  ['100–125', '100_125', 'Eff100_125', 'Prox100_125'],
  ['125–150', '125_150', 'Eff125_150', 'Prox125_150'],
  ['150–175', '150_175', 'Eff150_175', 'Prox150_175'],
  ['175–200', '175_200', 'Eff175_200', 'Prox175_200'],
  ['200–225', '200_225', 'Eff200_225', 'Prox200_225'],
  ['225+', '225_plus', 'Eff225Plus', 'Prox225Plus'],
] as const;

export function ApproachMore({ s, x, onRetry }: { s: GolfStats; x: ChProfileExtra; onRetry?: () => void }) {
  const eff = (k: string) => (s as unknown as Record<string, { fairway: number | null; rough: number | null; sand: number | null }>)[`approach${k}`]!;
  const prox = (k: string) => (s as unknown as Record<string, number | null>)[`approach${k}`] ?? null;
  const effRows = APPROACH_ROWS.map(([label, , e, p]) => ({ label, e: eff(e), p: prox(p) }));
  const hasEff = effRows.some((r) => r.e.fairway != null || r.e.rough != null || r.e.sand != null || r.p != null);
  const miss = s.approachMissByBand ?? {};
  const missRows = APPROACH_ROWS.filter(([, k]) => miss[k]);
  return (
    <>
      <Panel title="Approach numbers" wide>
        <Tiles
          label="Approach numbers"
          items={[
            { label: 'GIR per round', value: num(s.girPerRound), sub: 'Per 18 holes' },
            { label: 'Proximity · green hit', value: ft(s.approachProximityWhenHitGreen), sub: 'When the green is found' },
            { label: 'Proximity · green missed', value: ft(s.approachProximityWhenMissedGreen), sub: 'When it is missed' },
            { label: 'GIR · par 3', value: pct(s.girPctPar3) },
            { label: 'GIR · par 4', value: pct(s.girPctPar4) },
            { label: 'GIR · par 5', value: pct(s.girPctPar5) },
          ]}
        />
      </Panel>
      <Panel title="Strokes to hole out" wide note="Average strokes to hole out from each distance and lie, and the average finish when the green is hit. Averages only: the calculator keeps no count per cell.">
        {hasEff ? (
          <DataTable
            label="Strokes to hole out by distance and lie"
            cols={['Yards to the pin', 'Fairway', 'Rough', 'Sand', 'Finish · green hit']}
            rows={effRows.map((r) => ({ key: r.label, head: r.label, cells: [num(r.e.fairway, 2), num(r.e.rough, 2), num(r.e.sand, 2), ft(r.p)] }))}
          />
        ) : (
          <Empty code={NOTHING}>No approaches of 50 yards or more are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Misses by distance" wide note="Where missed greens finish, by the distance they were hit from. A miss that was short and left counts on both axes, so a row can add to more than 100%.">
        {missRows.length ? (
          <DataTable
            label="Missed greens by distance"
            cols={['Yards to the pin', 'Missed greens', 'Short', 'Long', 'Left', 'Right']}
            rows={missRows.map(([label, k]) => {
              const m = miss[k]!;
              return { key: label, head: label, cells: [String(m.total), pct(m.short), pct(m.long), pct(m.left), pct(m.right)] };
            })}
          />
        ) : (
          <Empty code={NOTHING}>No missed greens with a direction are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Greens by round" wide>
        <ByRound points={x.series.gir} unit="%" digits={0} label="Greens in regulation by round" what="greens in regulation" />
      </Panel>
      <Panel title="Where approaches finish" wide note="Every approach shot, including lay-ups. Shots with no direction logged count as center, as on the production page.">
        <Shots error={x.sprayError} code="CH-5212" what="Where shots finish" onRetry={onRetry}>
          {x.spray && x.spray.approach.shots > 0 ? <SectorGrid g={x.spray.approach} unit="approaches" /> : <Empty code="CH-5315">No approach shots with a finish are logged in this window.</Empty>}
        </Shots>
      </Panel>
    </>
  );
}

export function ShortMore({ s }: { s: GolfStats }) {
  const lie = s.atgEffByDistanceLie ?? {};
  const eff: Array<[string, number | null, { fairway: number | null; rough: number | null; sand: number | null } | undefined]> = [
    ['0–10 yds', s.atgEfficiency0_10, lie['0_10']],
    ['10–20 yds', s.atgEfficiency10_20, lie['10_20']],
    ['20–50 yds', s.atgEfficiency20_30, lie['20_30']],
  ];
  const hasEff = s.atgEfficiencyAvg != null || eff.some(([, a, l]) => a != null || l?.fairway != null || l?.rough != null || l?.sand != null);
  const dir = (['short', 'long', 'left', 'right'] as const).map((k) => [k, s.scramblingByMissDirection?.[k]] as const).filter(([, v]) => v);
  const prox: Array<{ label: string; value: number | null }> = [
    { label: 'Overall', value: s.atgProximityAvg },
    { label: 'Fairway', value: s.atgProximityByLie?.fairway ?? null },
    { label: 'Rough', value: s.atgProximityByLie?.rough ?? null },
    { label: 'Sand', value: s.atgProximityByLie?.sand ?? null },
  ];
  const cap = (k: string) => k[0]!.toUpperCase() + k.slice(1);
  return (
    <>
      <Panel title="Short-game numbers" wide>
        <Tiles
          label="Short-game numbers"
          items={[
            { label: 'Strokes to hole out', value: num(s.atgEfficiencyAvg, 2), sub: 'From a chip or pitch' },
            { label: 'Finish after the chip', value: ft(s.atgProximityAvg), sub: 'Chips that reached the green' },
            { label: 'Sand saves', value: s.sandSaveAttempts ? `${s.sandSavesMade} of ${s.sandSaveAttempts}` : NO_DATA, empty: !s.sandSaveAttempts, code: NOTHING },
            { label: 'Up and downs', value: s.scrambleAttempts ? `${s.scramblesMade} of ${s.scrambleAttempts}` : NO_DATA, empty: !s.scrambleAttempts, code: NOTHING },
          ]}
        />
      </Panel>
      <Panel title="Strokes to hole out from around the green" wide note="Average strokes to hole out from a chip or pitch within 50 yards, by distance and lie. Averages only.">
        {hasEff ? (
          <DataTable
            label="Strokes to hole out from around the green by distance and lie"
            cols={['Distance', 'All lies', 'Fairway', 'Rough', 'Sand']}
            rows={[
              ...eff.map(([label, all, l]) => ({ key: label, head: label, cells: [num(all, 2), num(l?.fairway, 2), num(l?.rough, 2), num(l?.sand, 2)] })),
              { key: 'all', head: 'All distances', cells: [num(s.atgEfficiencyAvg, 2), num(s.atgEffFairway, 2), num(s.atgEffRough, 2), num(s.atgEffSand, 2)] },
            ]}
          />
        ) : (
          <Empty code={NOTHING}>No chips or pitches within 50 yards are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Up and down by where the green was missed" note="A miss that was short and left counts on both axes, so shares can add to more than 100%.">
        {dir.length ? (
          <DataTable
            label="Up and down by the direction of the missed green"
            cols={['Missed', 'Up and down', 'Chances', 'Share of misses']}
            rows={dir.map(([k, v]) => ({ key: k, head: cap(k), cells: [pct(v!.pct), String(v!.attempts), pct(v!.shareOfMisses)] }))}
          />
        ) : (
          <Empty code={NOTHING}>No scrambles with a known miss direction are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Finish after the chip" note="Average distance left by chips and pitches that reached the green; a holed chip counts 0.">
        {prox.some((r) => r.value != null) ? <Compare unit=" ft" rows={prox} /> : <Empty code={NOTHING}>No chips finished on the green in this window.</Empty>}
      </Panel>
    </>
  );
}

/** The nine bands' keys in the calculator's own fields, in order. */
const BANDS = [
  ['0–3 ft', '0_3', '0_3', 'puttEff0_5', 'puttProximity0_5'],
  ['3–5 ft', '3_5', '3_5', 'puttEff0_5', 'puttProximity0_5'],
  ['5–10 ft', '5_10', '5_10', 'puttEff5_10', 'puttProximity5_10'],
  ['10–15 ft', '10_15', '10_15', 'puttEff10_15', 'puttProximity10_15'],
  ['15–20 ft', '15_20', '15_20', 'puttEff15_20', 'puttProximity15_20'],
  ['20–25 ft', '20_25', '20_25', 'puttEff20_25', 'puttProximity20Plus'],
  ['25–30 ft', '25_30', '25_30', 'puttEff25_30', 'puttProximity20Plus'],
  ['30–35 ft', '30_35', '30_35', 'puttEff30_35', 'puttProximity20Plus'],
  ['35+ ft', '35_plus', '35Plus', 'puttEff35Plus', 'puttProximity20Plus'],
] as const;

const BREAKS = [
  ['left_to_right', 'Left to right'],
  ['straight', 'Straight'],
  ['right_to_left', 'Right to left'],
  ['multiple', 'Multiple'],
] as const;

/** The least putts a band or cell needs before it is graded or named a practice target (production's floors). */
const GRADE_MIN = 10;
const TARGET_MIN = 8;

export function PuttingMore({ s, x, sixBands }: { s: GolfStats; x: ChProfileExtra; sixBands: ChPuttBand[] | null }) {
  const rec = s as unknown as Record<string, number | null>;
  const nine = x.puttBandsNine;
  const hasPutts = s.totalPutts > 0;
  const rows = BANDS.map(([label, key, field, effKey, proxKey], i) => {
    const b = nine?.[i];
    // Shot-level counts when they loaded (every band has an exact count); the calculator's own rate otherwise (counts only for the first five).
    const rate = b ? (b.attempts ? (b.made / b.attempts) * 100 : null) : (rec[`puttMakePct${field}`] ?? null);
    const n = b ? b.attempts : i < 5 ? (rec[`puttMakeCount${field}`] ?? 0) : null;
    const graded = b && b.bench != null && b.attempts >= GRADE_MIN && rate != null;
    const share = s.firstPuttDistanceByBand?.[key];
    const leave = s.approachPuttAvgLeaveByBand?.[key];
    const make: Cell = { v: pct(rate), tone: graded ? tone(rate, b.bench) : undefined };
    return {
      key,
      head: label,
      cells: [make, n == null ? NO_DATA : String(n), share == null ? NO_DATA : pct(share), leave == null ? NO_DATA : ft(leave), num(rec[effKey], 2), ft(rec[proxKey])],
    };
  });
  const cell = (brk: (typeof BREAKS)[number][0], field: string) => {
    const bb = s.puttingByBreak[brk] as unknown as Record<string, number | null>;
    const p = bb[`makePct${field}`];
    const n = bb[`count${field}`] ?? 0;
    return { p, n: Number(n) };
  };
  const breakRows = BANDS.map(([label, key, field]) => ({
    key,
    head: label,
    cells: BREAKS.map(([k]) => {
      const { p, n } = cell(k, field);
      return n > 0 && p != null ? `${Math.round(p)}% · ${n}` : NO_DATA;
    }),
  }));
  const breakTotal = BREAKS.reduce((a, [k]) => a + s.puttingByBreak[k].totalPutts, 0);
  const missRows = BREAKS.map(([k, label]) => ({ k, label, b: s.puttingByBreak[k] })).filter(({ b }) => b.missShortPct != null || b.missLowPct != null || b.missHighPct != null);
  let target: { band: string; brk: string; p: number; n: number } | null = null;
  for (const [label, , field] of BANDS)
    for (const [k, brkLabel] of BREAKS) {
      const { p, n } = cell(k, field);
      if (p != null && n >= TARGET_MIN && (!target || p < target.p)) target = { band: label, brk: brkLabel, p, n };
    }
  const tour = (sixBands ?? []).filter((b) => b.bench != null);
  return (
    <>
      <Panel title="Putting numbers" wide>
        <Tiles
          label="Putting numbers"
          items={[
            { label: 'Putts per round', value: num(s.puttsPerRound), sub: 'Per 18 holes' },
            { label: 'Putts per hole', value: num(s.puttsPerHole, 2), sub: 'Every hole played' },
            { label: 'One-putts', value: String(s.onePuttsTotal), sub: 'Holes won with one putt' },
            { label: 'Average leave', value: ft(s.approachPuttAvgLeave), sub: 'After a putt; a holed putt is 0' },
          ]}
        />
      </Panel>
      <Panel
        title="Putting by distance"
        wide
        note="Make rate and putts are counted from the putts logged with a distance. The first two bands share one figure for strokes to hole out and for the finish after a miss, and the four bands past 20 feet share one figure for the finish."
      >
        {hasPutts ? (
          <DataTable label="Putting by distance" cols={['Distance', 'Make', 'Putts', 'First putts from here', 'Average leave', 'Strokes to hole out', 'Finish after a miss']} rows={rows} />
        ) : (
          <Empty code={NOTHING}>No putts are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Make rate by break and distance" wide note="Make rate, then the putts behind it. Putts with no break logged are left out.">
        {breakTotal > 0 ? (
          <DataTable
            label="Make rate by break and distance"
            cols={['Distance', ...BREAKS.map(([, l]) => l)]}
            rows={[
              {
                key: 'all',
                head: 'All distances',
                cells: BREAKS.map(([k]) => {
                  const b = s.puttingByBreak[k];
                  return b.totalPutts > 0 && b.overallMakePct != null ? `${Math.round(b.overallMakePct)}% · ${b.totalPutts}` : NO_DATA;
                }),
              },
              ...breakRows,
            ]}
          />
        ) : (
          <Empty code={NOTHING}>No putts with a break are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Short, low and high misses by break" note="Share of the missed putts on each break. Low is a miss that didn't break enough; high broke too much.">
        {missRows.length ? (
          <DataTable label="Putt misses by break" cols={['Break', 'Short', 'Low', 'High']} rows={missRows.map(({ k, label, b }) => ({ key: k, head: label, cells: [pct(b.missShortPct), pct(b.missLowPct), pct(b.missHighPct)] }))} />
        ) : (
          <Empty code={NOTHING}>No missed putts with a break are logged in this window.</Empty>
        )}
      </Panel>
      <Panel title="Practice target">
        {target ? (
          <p className="ch-gx-target">
            <b className="ch-num">{target.band}</b> putts breaking <b>{target.brk.toLowerCase()}</b> are converting at <b className="ch-num">{Math.round(target.p)}%</b> ({target.n} putts), the weakest target with enough putts to read.
          </p>
        ) : (
          <Empty code={NOTHING}>No distance and break has {TARGET_MIN} putts yet, so there is no reliable practice target.</Empty>
        )}
      </Panel>
      <Panel title="Against the Tour" wide note="A band is graded once it has 10 putts. Putts inside 3 feet have no published Tour average; the last three bands are graded against the 25+ foot average.">
        {tour.length ? (
          <DataTable
            label="Make rate by distance against the Tour"
            cols={['Distance', 'You', 'Tour', 'Putts', 'Against the Tour']}
            rows={tour.map((b) => {
              const you = b.attempts ? (b.made / b.attempts) * 100 : null;
              const verdict = !b.attempts ? 'No putts yet' : b.attempts < GRADE_MIN ? `Under ${GRADE_MIN} putts` : you! >= b.bench! ? 'At or above the Tour' : 'Below the Tour';
              const t: Tone = b.attempts >= GRADE_MIN ? tone(you, b.bench) : undefined;
              return { key: b.label, head: b.label, cells: [{ v: pct(you), tone: t }, pct(b.bench, 1), String(b.attempts), { v: verdict, tone: t }] };
            })}
          />
        ) : (
          <Empty code={NOTHING}>No Tour averages or no putts with a distance to set against them in this window.</Empty>
        )}
      </Panel>
      <Panel title="Putts by round" wide>
        <ByRound points={x.series.putts} unit="" digits={0} label="Putts by round" what="putts" />
      </Panel>
    </>
  );
}
