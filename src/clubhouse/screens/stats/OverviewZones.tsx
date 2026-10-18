import type { CSSProperties, ReactNode } from 'react';
import type { ChPlayerProfile } from '../../data/stats-player';
import { formatSigned, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { holeCoverage } from '../../data/round-scope';
import { Zone, ZoneBig as Big, ZoneBlock as Vis, ZoneNote as Missing, Zones } from '../../ui/Zone';
import { LegBars } from './LegBars';

/**
 * P005: the Overview as seven zones, one per stat area (strokes gained, scoring, off the tee, approach, short game, putting,
 * the last rounds). A zone is a band set off by a gold rule: on the left what the stat is and one big reading with the team
 * and Tour beside it, on the right the picture that fits it (a distribution, a fairway strip, a green with its misses, a
 * funnel, a make-rate curve). Every figure is read from the profile; a zone whose read failed says so instead of drawing
 * zeros, and the Game detail tab holds the rest of each area.
 */

type Stats = NonNullable<ChPlayerProfile['stats']>;

const fixed = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? NO_DATA : v.toFixed(d));
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pos = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100);

/** A single bar against the team and Tour marks: fill from the start, the team's tick (ink) and the Tour's (gold). */
function Track({ value, lo = 0, hi = 100, team, tour, bad = false, from }: { value: number; lo?: number; hi?: number; team?: number | null; tour?: number | null; bad?: boolean; from?: number }) {
  const a = pos(from ?? lo, lo, hi);
  const b = pos(value, lo, hi);
  return (
    <div className="ch-ztrack" aria-hidden="true">
      <i className={'ch-ztrack__fill' + (bad ? ' is-bad' : '')} style={{ '--ch-z-a': Math.min(a, b) / 100, '--ch-z-w': Math.abs(b - a) / 100 } as CSSProperties} />
      {team != null && <u className="ch-ztrack__tick is-team" style={{ '--ch-z-x': pos(team, lo, hi) } as CSSProperties} />}
      {tour != null && <u className="ch-ztrack__tick is-tour" style={{ '--ch-z-x': pos(tour, lo, hi) } as CSSProperties} />}
    </div>
  );
}

export function OverviewZones({ data, coach, ribbon }: { data: ChPlayerProfile; coach: boolean; ribbon: ReactNode }) {
  const w = data.win;
  const s: Stats | null = data.stats && !data.statsError ? data.stats : null;
  const cmp = (label: string) => data.comparisons.find((c) => c.label === label);
  const baseline = sgBaseline(data.tour);
  const ref = (label: string) => (coach ? cmp(label)?.team : cmp(label)?.bench) ?? null;
  const refName = coach ? 'Team' : 'Tour';
  const first = data.firstName;

  // 1 · strokes gained
  const legs = [
    { label: 'Off the tee', means: 'Tee shots on par 4s and 5s', value: w.sgLegs.tee, team: coach ? (cmp('SG off the tee')?.team ?? null) : null },
    { label: 'Approach', means: 'Full shots from over 30 yards', value: w.sgLegs.approach, team: coach ? (cmp('SG approach')?.team ?? null) : null },
    { label: 'Around green', means: 'Chips, pitches and bunker shots within 30 yards', value: w.sgLegs.around, team: coach ? (cmp('SG around green')?.team ?? null) : null },
    { label: 'Putting', means: 'Every shot on the green', value: w.sgLegs.putting, team: coach ? (cmp('SG putting')?.team ?? null) : null },
  ];
  const sg = w.sgPerRound;
  const sgTeam = coach ? (cmp('SG total')?.team ?? null) : null;
  const sgHi = 1;
  const sgLo = Math.min(-3, Math.floor(Math.min(sg ?? 0, sgTeam ?? 0)) - 1);

  // 2 · scoring
  const holesScored = s ? s.totalEagles + s.totalBirdies + s.totalPars + s.totalBogeys + s.totalDoublePlus : 0;
  const mix = s
    ? ([
        ['Eagle', s.totalEagles, s.eaglesPerRound, 'eagle'],
        ['Birdie', s.totalBirdies, s.birdiesPerRound, 'birdie'],
        ['Par', s.totalPars, s.parsPerRound, 'par'],
        ['Bogey', s.totalBogeys, s.bogeysPerRound, 'bogey'],
        ['Double or worse', s.totalDoublePlus, s.doublePlusPerRound, 'double'],
      ] as const)
    : [];
  const parRows = s
    ? ([3, 4, 5] as const).map((p) => {
        const d = s.scoringByPar[`par${p}` as const];
        const tourAvg = data.bench[`scoring_par_${p}`];
        return { p, you: d.avgToPar, tour: tourAvg == null ? null : tourAvg - p };
      })
    : [];
  const toParAvg = data.rounds.length ? data.rounds.reduce((a, r) => a + (r.toPar ?? 0) / (r.holes / 18), 0) / data.rounds.length : null;

  // 3 · off the tee
  const fwOpp = s?.fairwayOpportunities ?? 0;
  const fwLeft = s?.missLeftCount ?? 0;
  const fwRight = s?.missRightCount ?? 0;
  const fwHit = s?.fairwaysHit ?? 0;
  const fwOther = Math.max(0, fwOpp - fwHit - fwLeft - fwRight);
  const fwBase = Math.max(1, fwOpp);
  const missTotal = fwLeft + fwRight;
  const penBench = data.bench.penalty_rate_per_round ?? null;

  // 4 · approach
  const miss = s && s.approachMissTotal > 0 ? s : null;
  const mShort = miss ? (miss.approachMissShortPct ?? 0) + (miss.approachMissShortLeftPct ?? 0) + (miss.approachMissShortRightPct ?? 0) : 0;
  const mLong = miss ? (miss.approachMissLongPct ?? 0) + (miss.approachMissLongLeftPct ?? 0) + (miss.approachMissLongRightPct ?? 0) : 0;
  const mLeft = miss ? (miss.approachMissLeftPct ?? 0) : 0;
  const mRight = miss ? (miss.approachMissRightPct ?? 0) : 0;
  const mSum = Math.max(1, mShort + mLong + mLeft + mRight);
  const share = (v: number) => Math.round((v / mSum) * 100);
  const girYou = cmp('Greens in regulation')?.you ?? null;
  const proxAll = data.extra.approach ?? [];
  const prox = proxAll.filter((b) => b.value != null);
  const proxHi = Math.max(1, ...prox.flatMap((b) => [b.value ?? 0, b.bench ?? 0])) * 1.25;
  // A range under its sample floor says what it needs (CH-5318), as the standing table did.
  const floorOf = (label: string) => cmp(`Proximity ${label.replace('-', '–')}`)?.floor;
  // The bucket's label is its lookup key (leak-map-buckets.ts); on screen a range takes an en dash and yards are "yds".
  const rangeOf = (label: string) => label.replace('-', '–').replace(/ yd$/, ' yds');

  // 5 · short game
  const scrAtt = s?.scrambleAttempts ?? 0;
  const scrMade = s?.scramblesMade ?? 0;
  const sandAtt = s?.sandSaveAttempts ?? 0;
  const sandMade = s?.sandSavesMade ?? 0;
  const scrYou = cmp('Scrambling')?.you ?? null;

  // 6 · putting
  const bands = (data.extra.puttBandsNine ?? data.puttBands ?? []).map((b) => ({ label: b.label.replace(' ft', ''), pct: b.attempts ? (b.made / b.attempts) * 100 : null, bench: b.bench, n: b.attempts }));
  const puttsYou = cmp('Putts per round')?.you ?? null;
  const threePutts = cmp('3-putts per round')?.you ?? null;

  // Hole-level stats read the rounds that have their holes scored, not a round posted as a total only (Q-123): say so when that is fewer.
  const coverage = holeCoverage(data.extra.holeRounds ?? w.rounds, w.rounds);
  return (
    <Zones>
      {coverage && (
        <p className="ch-zns__note">
          {coverage}; the scoring average and the pressure gap read all {w.rounds}. {coach ? 'Team values are pooled from the active players’ rounds in the same window, where the round cache has the figure. ' : ''}Bands need 10 shots or putts.
        </p>
      )}
      <Zone
        n={1}
        title="Strokes gained"
        def={
          <>
            Strokes gained or lost a round, shot by shot, against a benchmark. <b>Zero is {baseline.noun}.</b> Below zero is normal for most players; what matters is the gap {coach ? 'to the team' : 'to the Tour'} and which leg it comes from.
          </>
        }
        read={
          <>
            <Big value={sg == null ? NO_DATA : formatSigned(sg)} tone={sg == null ? undefined : sg >= 0 ? 'good' : 'bad'} />
            <div className="ch-znlines">
              {sgTeam != null && sg != null && (
                <span>
                  <b>Team {formatSigned(sgTeam)}</b> · {Math.abs(sg - sgTeam).toFixed(1)} {sg >= sgTeam ? 'ahead of' : 'behind'} them
                </span>
              )}
              {data.sgChange.delta != null && <span>{data.sgChange.delta >= 0 ? 'Up' : 'Down'} {Math.abs(data.sgChange.delta).toFixed(1)} on the previous 10</span>}
            </div>
          </>
        }
      >
        <Vis title="Where the strokes go" note="The same number split by the shots it counts. Right of the line gains strokes, left loses them.">
          <LegBars rows={legs} baseline={`Zero is ${baseline.noun}`} teamName={coach ? 'Team' : null} />
        </Vis>
        {sg != null && (
          <Vis title={coach ? 'Against the team and the Tour' : 'Against the Tour'} note={`Total strokes gained a round, ${formatSigned(sgLo, 0)} to ${formatSigned(sgHi, 0)}.`}>
            <div className="ch-zpin">
              <span style={{ left: `${pos(sg, sgLo, sgHi)}%` }}>You {formatSigned(sg)}</span>
            </div>
            <Track value={sg} lo={sgLo} hi={sgHi} from={0} bad={sg < 0} team={sgTeam} tour={0} />
            <div className="ch-zlegend">
              {sgTeam != null && (
                <span>
                  <i className="is-team" />
                  Team {formatSigned(sgTeam)}
                </span>
              )}
              <span>
                <i className="is-tour" />
                Tour 0.0
              </span>
            </div>
          </Vis>
        )}
      </Zone>

      <Zone
        n={2}
        alt
        title="Scoring"
        def={
          <>
            The score a round, and how every hole played against par. <b>Lower is better.</b> Birdies and doubles decide a round more than pars do.
          </>
        }
        read={
          <>
            <Big value={fixed(w.avg)} />
            <div className="ch-znlines">
              {toParAvg != null && (
                <span>
                  <b>{toParAvg > 0.05 ? `+${toParAvg.toFixed(1)}` : toParAvg < -0.05 ? `−${Math.abs(toParAvg).toFixed(1)}` : 'E'}</b> to par a round
                </span>
              )}
              {coach && data.teamAvg != null && w.avg != null && (
                <span>
                  Team <b>{data.teamAvg.toFixed(1)}</b> · {Math.abs(w.avg - data.teamAvg).toFixed(1)} {w.avg <= data.teamAvg ? 'ahead of' : 'behind'} them
                </span>
              )}
            </div>
          </>
        }
      >
        {s && holesScored > 0 ? (
          <>
            <Vis title="Every hole, by result" note={`${holesScored} holes over ${s.roundsPlayed} ${s.roundsPlayed === 1 ? 'round' : 'rounds'}.`}>
              <div className="ch-zmix" role="img" aria-label={mix.map(([l, c]) => `${l} ${c}`).join(', ')}>
                {mix.map(([l, c, , k]) => (
                  <i key={l} className={`is-${k}`} style={{ '--ch-z-n': c } as CSSProperties} title={`${l} ${c}`}>
                    {c / holesScored > 0.08 ? c : null}
                  </i>
                ))}
              </div>
              <div className="ch-zmixkey">
                {mix.map(([l, , per, k]) => (
                  <div key={l}>
                    <span>
                      <i className={`is-${k}`} />
                      {l}
                    </span>
                    <b className="ch-num">{fixed(per)}</b>a round
                  </div>
                ))}
              </div>
            </Vis>
            <Vis title="Each par against par" note="Average strokes over or under par a hole. The gold tick is the Tour.">
              <ParDots rows={parRows} />
            </Vis>
          </>
        ) : (
          <Missing>Hole-by-hole results appear once a round is posted with its holes.</Missing>
        )}
      </Zone>

      <Zone
        n={3}
        title="Off the tee"
        def={
          <>
            Tee shots on par 4s and 5s. <b>Fairways hit</b> is the share that finish on the fairway; penalties are strokes lost to a ball that could not be played.
          </>
        }
        read={
          <>
            <Big value={fixed(cmp('Fairways hit')?.you, 0)} unit="%" tone="good" />
            <div className="ch-znlines">
              <span>
                fairways hit{ref('Fairways hit') != null && <> · <b>{refName} {Math.round(ref('Fairways hit')!)}%</b></>}
              </span>
              {s?.penaltiesPerRound != null && (
                <span>
                  <b>{s.penaltiesPerRound.toFixed(1)}</b> penalty strokes a round
                </span>
              )}
              {w.sgLegs.tee != null && (
                <span>
                  Strokes gained <b>{formatSigned(w.sgLegs.tee)}</b>
                </span>
              )}
            </div>
          </>
        }
      >
        {fwOpp > 0 ? (
          <>
            <Vis title="Where tee shots finish" note={`${fwOpp} tee shots on par 4s and 5s. The strip reads left to right across the hole.`}>
              <div className="ch-zfw" role="img" aria-label={`Left ${fwLeft}, fairway ${fwHit}, right ${fwRight}${fwOther > 0 ? `, missed with the side not logged ${fwOther}` : ''}`}>
                <div className="is-rough" style={{ flexGrow: fwLeft }}>
                  <b className="ch-num">{Math.round((fwLeft / fwBase) * 100)}%</b>Left · {fwLeft}
                </div>
                {fwOther > 0 && (
                  <div className="is-other" style={{ flexGrow: fwOther }}>
                    <b className="ch-num">{Math.round((fwOther / fwBase) * 100)}%</b>Missed, side not logged · {fwOther}
                  </div>
                )}
                <div className="is-fw" style={{ flexGrow: fwHit }}>
                  <b className="ch-num">{Math.round((fwHit / fwBase) * 100)}%</b>Fairway · {fwHit}
                </div>
                <div className="is-rough" style={{ flexGrow: fwRight }}>
                  <b className="ch-num">{Math.round((fwRight / fwBase) * 100)}%</b>Right · {fwRight}
                </div>
              </div>
              {missTotal > 0 && Math.abs(fwLeft - fwRight) >= 1 && (
                <p className="ch-zmeta">
                  When {first} misses, <b>{Math.round((Math.max(fwLeft, fwRight) / missTotal) * 100)}%</b> go {fwRight > fwLeft ? 'right' : 'left'}.
                </p>
              )}
            </Vis>
            <div className="ch-zpair">
              {s?.penaltiesPerRound != null && (
                <div className="ch-zmini">
                  <div className="l">
                    Penalty strokes<span>A round{penBench != null ? `. The Tour has ${penBench}.` : '.'}</span>
                  </div>
                  <b className="ch-num">{s.penaltiesPerRound.toFixed(1)}</b>
                  <Track value={s.penaltiesPerRound} lo={0} hi={Math.max(1.2, (penBench ?? 0) * 2, s.penaltiesPerRound * 1.4)} bad tour={penBench} />
                </div>
              )}
              {s?.fairwayPctPar4 != null && s.fairwayPctPar5 != null && (
                <div className="ch-zmini">
                  <div className="l">
                    By hole<span>Fairways hit on par 4s and 5s</span>
                  </div>
                  <b className="ch-num">
                    {Math.round(s.fairwayPctPar4)}
                    <small>% par 4</small> · {Math.round(s.fairwayPctPar5)}
                    <small>% par 5</small>
                  </b>
                  <Track value={s.fairwayPctPar4} />
                </div>
              )}
            </div>
          </>
        ) : (
          <Missing>No tee shots are logged in this window, so fairways can’t be drawn yet.</Missing>
        )}
      </Zone>

      <Zone
        n={4}
        alt
        title="Approach"
        def={
          <>
            Full shots from over 30 yards into the green. <b>Greens in regulation</b> counts the green found in par minus two strokes.
          </>
        }
        read={
          <>
            <Big value={fixed(girYou, 0)} unit="%" tone={girYou != null && ref('Greens in regulation') != null && girYou < ref('Greens in regulation')! ? 'bad' : 'good'} />
            <div className="ch-znlines">
              <span>
                greens in regulation
                {ref('Greens in regulation') != null && <> · <b>{refName} {Math.round(ref('Greens in regulation')!)}%</b></>}
              </span>
              {w.sgLegs.approach != null && (
                <span>
                  Strokes gained <b>{formatSigned(w.sgLegs.approach)}</b>
                  {w.sgLegs.approach < 0 && legs.every((l) => l.value == null || l.value >= w.sgLegs.approach!) ? ': the biggest cost' : ''}
                </span>
              )}
            </div>
          </>
        }
      >
        {miss ? (
          <Vis title="Where missed greens finish" note={`${miss.approachMissTotal} approaches that missed and logged a direction. The thicker the edge, the more misses finish there.`}>
            <GreenDiagram short={share(mShort)} long={share(mLong)} left={share(mLeft)} right={share(mRight)} gir={girYou} />
          </Vis>
        ) : (
          <Missing>Missed greens appear once approaches are logged with a direction.</Missing>
        )}
        {proxAll.length > 0 && prox.length > 0 && (
          <Vis title="How close approaches finish" note="Average distance from the hole after an approach, in feet. Shorter is better. The gold tick is the Tour.">
            <div className="ch-zrows">
              {proxAll.map((b) => {
                if (b.value == null) {
                  return (
                    <div key={b.label} className="ch-zrow">
                      <span className="l">
                        {rangeOf(b.label)}
                        <small>{b.shots} shots</small>
                      </span>
                      <em className="ch-zfloor" data-ch-code="CH-5318">
                        {floorOf(b.label) ?? 'Not enough shots yet.'}
                      </em>
                      <b className="ch-num">{NO_DATA}</b>
                    </div>
                  );
                }
                return (
                  <div key={b.label} className="ch-zrow">
                    <span className="l">
                      {rangeOf(b.label)}
                      <small>{b.shots} shots</small>
                    </span>
                    <Track value={b.value} lo={0} hi={proxHi} bad={b.bench != null && b.value > b.bench} tour={b.bench} />
                    <b className="ch-num">{Math.round(b.value)} ft</b>
                  </div>
                );
              })}
            </div>
          </Vis>
        )}
      </Zone>

      <Zone
        n={5}
        title="Short game"
        def={
          <>
            <b>Scrambling</b> is par or better after missing the green. <b>Sand saves</b> is the same from a greenside bunker.
          </>
        }
        read={
          <>
            <Big value={fixed(scrYou, 0)} unit="%" tone="good" />
            <div className="ch-znlines">
              <span>
                scrambling{ref('Scrambling') != null && <> · <b>{refName} {Math.round(ref('Scrambling')!)}%</b></>}
              </span>
              {sandAtt > 0 && (
                <span>
                  Sand saves <b>{sandMade} of {sandAtt}</b>
                </span>
              )}
              {w.sgLegs.around != null && (
                <span>
                  Strokes gained <b>{formatSigned(w.sgLegs.around)}</b>
                </span>
              )}
            </div>
          </>
        }
      >
        {scrAtt > 0 ? (
          <Vis title="From missed green to par" note="Of every green missed, how many were saved.">
            <div className="ch-zfn">
              <div className="r">
                <span>
                  Greens missed<small>Not in regulation</small>
                </span>
                <div>
                  <i style={{ '--ch-z-p': 1 } as CSSProperties} />
                </div>
                <b className="ch-num">{scrAtt}</b>
              </div>
              <div className="r">
                <span>
                  Saved par or better<small>The scramble</small>
                </span>
                <div>
                  <i className="is-win" style={{ '--ch-z-p': scrMade / scrAtt } as CSSProperties} />
                </div>
                <b className="ch-num is-win">{scrMade}</b>
              </div>
              {sandAtt > 0 && (
                <>
                  <div className="r is-gap">
                    <span>
                      Bunker shots<small>Greenside</small>
                    </span>
                    <div>
                      <i style={{ '--ch-z-p': 1 } as CSSProperties} />
                    </div>
                    <b className="ch-num">{sandAtt}</b>
                  </div>
                  <div className="r">
                    <span>
                      Saved<small>Sand saves</small>
                    </span>
                    <div>
                      <i className="is-sand" style={{ '--ch-z-p': sandMade / sandAtt } as CSSProperties} />
                    </div>
                    <b className="ch-num">{sandMade}</b>
                  </div>
                </>
              )}
            </div>
            <p className="ch-zmeta">
              {first} saves <b>{Math.round((scrMade / scrAtt) * 100)}</b> in 100 greens missed{sandAtt > 0 && sandAtt < 10 ? `. In the bunker it is ${sandMade} in ${sandAtt}, a small sample` : ''}.
            </p>
          </Vis>
        ) : (
          <Missing>Short-game chances appear once approaches miss the green and the next shots are logged.</Missing>
        )}
      </Zone>

      <Zone
        n={6}
        alt
        title="Putting"
        def={
          <>
            Putts a round counts every putt, so it rises with every green missed. <b>Make rate by distance</b> is the fair read: a 4-footer and a 25-footer are different putts.
          </>
        }
        read={
          <>
            <Big value={fixed(puttsYou)} />
            <div className="ch-znlines">
              <span>
                putts a round{ref('Putts per round') != null && <> · <b>{refName} {ref('Putts per round')!.toFixed(1)}</b></>}
              </span>
              {threePutts != null && (
                <span>
                  <b>{threePutts.toFixed(1)}</b> 3-putts a round
                </span>
              )}
              {w.sgLegs.putting != null && (
                <span>
                  Strokes gained <b>{formatSigned(w.sgLegs.putting)}</b>
                </span>
              )}
            </div>
          </>
        }
      >
        {bands.filter((b) => b.pct != null).length >= 2 ? (
          <Vis title="Make rate by distance" note="Share of putts holed from each distance. The gold line is the Tour; the shaded gap is strokes left on the green.">
            <MakeCurve bands={bands} />
            {data.extra.puttsError && <p className="ch-zmeta">The putt read failed, so the curve stops at 20 feet.</p>}
          </Vis>
        ) : (
          <Missing>Make rates appear once putts are logged with their distances.</Missing>
        )}
      </Zone>

      <Zone
        n={7}
        title="The last rounds"
        def={
          <>
            Each round against {first}’s own average. Green rises when a round beat it, gold hangs when it didn’t. <b>Lower is better.</b>
          </>
        }
        read={<div className="ch-znlines">{data.rounds.length} {data.rounds.length === 1 ? 'round' : 'rounds'} in this window</div>}
      >
        {ribbon}
      </Zone>
    </Zones>
  );
}

/** Each par against par: a dot for the player and a gold tick for the Tour, either side of one par line. */
function ParDots({ rows }: { rows: Array<{ p: 3 | 4 | 5; you: number | null; tour: number | null }> }) {
  const vals = rows.flatMap((r) => [r.you, r.tour]).filter((v): v is number => v != null);
  const span = Math.max(0.6, Math.ceil(Math.max(0, ...vals.map((v) => Math.abs(v))) * 10) / 10);
  const x = (v: number) => 60 + ((v + span) / (2 * span)) * 500;
  const par = x(0);
  return (
    <svg className="ch-zsvg" viewBox="0 0 640 170" role="img" aria-label={rows.map((r) => `Par ${r.p} ${r.you == null ? 'no data' : formatSigned(r.you, 2)}`).join(', ')}>
      <line x1={par} y1={6} x2={par} y2={150} stroke="var(--ch-text-primary)" strokeWidth={1.5} />
      <text x={par} y={166} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ch-text-tertiary)">Par</text>
      <text x={60} y={166} fontSize={12} fill="var(--ch-text-tertiary)">Under par</text>
      <text x={560} y={166} textAnchor="end" fontSize={12} fill="var(--ch-text-tertiary)">Over par</text>
      {rows.map((r, i) => {
        const y = 38 + i * 50;
        const over = (r.you ?? 0) > 0;
        return (
          <g key={r.p}>
            <text x={0} y={y + 4} fontSize={14} fontWeight={600} fill="var(--ch-text-primary)">Par {r.p}</text>
            {r.you != null && (
              <text x={640} y={y + 5} textAnchor="end" fontSize={16} fontWeight={700} fill={over ? 'var(--ch-warning-600)' : 'var(--ch-green-600)'}>
                {formatSigned(r.you, 2)}
              </text>
            )}
            {r.you != null && r.tour != null && <line x1={x(r.tour)} y1={y} x2={x(r.you)} y2={y} stroke="var(--ch-champagne-500)" strokeWidth={3} strokeLinecap="round" />}
            {r.tour != null && <rect x={x(r.tour) - 2} y={y - 12} width={4} height={24} rx={2} fill="var(--ch-champagne-500)" />}
            {r.you != null && (
              <>
                <circle cx={x(r.you)} cy={y} r={9} fill={over ? 'var(--ch-warning-600)' : 'var(--ch-green-500)'} stroke="var(--ch-ivory-25)" strokeWidth={3} />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A green seen from above, its four edges thickened by the share of missed approaches that finish there. */
function GreenDiagram({ short, long, left, right, gir }: { short: number; long: number; left: number; right: number; gir: number | null }) {
  const stroke = (v: number) => 5 + (v / 100) * 28;
  const worst = Math.max(short, long, left, right);
  const tone = (v: number) => (v === worst ? 'var(--ch-warning-600)' : 'var(--ch-champagne-500)');
  return (
    <svg className="ch-zsvg ch-zgreen" viewBox="0 0 340 250" role="img" aria-label={`Missed greens: ${short} percent short, ${long} long, ${left} left, ${right} right`}>
      <g transform="translate(20,6)">
        <circle cx={150} cy={115} r={66} fill="var(--ch-green-100)" stroke="var(--ch-green-400)" strokeWidth={2} />
        <circle cx={150} cy={115} r={30} fill="none" stroke="var(--ch-green-200)" strokeWidth={1.5} />
        <line x1={150} y1={115} x2={150} y2={90} stroke="var(--ch-ink-900)" strokeWidth={2} />
        <path d="M150 90 l16 6 l-16 6 z" fill="var(--ch-chart-flag)" />
        {gir != null && (
          <>
            <text x={150} y={132} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--ch-green-900)" letterSpacing={-1}>{Math.round(gir)}%</text>
            <text x={150} y={148} textAnchor="middle" fontSize={11} fill="var(--ch-text-secondary)">greens hit</text>
          </>
        )}
        <path d="M 204 179.4 A 84 84 0 0 1 96 179.4" fill="none" stroke={tone(short)} strokeWidth={stroke(short)} />
        <path d="M 96 50.6 A 84 84 0 0 1 204 50.6" fill="none" stroke={tone(long)} strokeWidth={stroke(long)} />
        <path d="M 85.6 169 A 84 84 0 0 1 85.6 61" fill="none" stroke={tone(left)} strokeWidth={stroke(left)} />
        <path d="M 214.4 61 A 84 84 0 0 1 214.4 169" fill="none" stroke={tone(right)} strokeWidth={stroke(right)} />
        <text x={150} y={232} textAnchor="middle" fontSize={15} fontWeight={700} fill={tone(short)}>Short {short}%</text>
        <text x={150} y={24} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ch-text-secondary)">Long {long}%</text>
        <text x={62} y={119} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ch-text-secondary)">Left {left}%</text>
        <text x={238} y={119} fontSize={13} fontWeight={600} fill="var(--ch-text-secondary)">Right {right}%</text>
      </g>
    </svg>
  );
}

/** Make rate by distance as a line against the Tour's, the gap between them shaded; counts of putts under each distance. */
function MakeCurve({ bands }: { bands: Array<{ label: string; pct: number | null; bench: number | null; n: number }> }) {
  const W = 680;
  const x = (i: number) => 80 + (i * (W - 110 - 50)) / Math.max(1, bands.length - 1);
  const y = (p: number) => 220 - p * 2;
  const you = bands.flatMap((b, i) => (b.pct == null ? [] : [{ i, p: b.pct }]));
  const tour = bands.flatMap((b, i) => (b.bench == null ? [] : [{ i, p: b.bench }]));
  const line = (pts: Array<{ i: number; p: number }>) => pts.map((q) => `${x(q.i)},${y(q.p)}`).join(' ');
  const gap = tour.length > 1 ? [...tour.map((q) => `${x(q.i)},${y(q.p)}`), ...[...tour].reverse().map((q) => `${x(q.i)},${y(you.find((a) => a.i === q.i)?.p ?? q.p)}`)].join(' ') : null;
  return (
    <svg className="ch-zsvg" viewBox={`0 0 ${W} 300`} role="img" aria-label={bands.map((b) => `${b.label} ${b.pct == null ? 'no putts' : `${Math.round(b.pct)} percent`}`).join(', ')}>
      <g stroke="var(--ch-ledger-rule)">{[20, 70, 120, 170, 220].map((v) => <line key={v} x1={50} y1={v} x2={W - 20} y2={v} />)}</g>
      <g fontSize={12} fill="var(--ch-text-tertiary)" textAnchor="end">
        {[100, 75, 50, 25, 0].map((p) => (
          <text key={p} x={42} y={y(p) + 4}>{p === 0 ? '0' : `${p}%`}</text>
        ))}
      </g>
      {gap && <polygon points={gap} fill="var(--ch-champagne-500)" fillOpacity={0.28} />}
      {tour.length > 1 && <polyline points={line(tour)} fill="none" stroke="var(--ch-champagne-500)" strokeWidth={3} strokeDasharray="6 5" />}
      {you.length > 1 && <polyline points={line(you)} fill="none" stroke="var(--ch-green-600)" strokeWidth={4} strokeLinejoin="round" />}
      {you.map((q) => (
        <g key={q.i}>
          <circle cx={x(q.i)} cy={y(q.p)} r={7} fill="var(--ch-green-600)" stroke="var(--ch-ivory-25)" strokeWidth={3} />
          <text x={x(q.i)} y={y(q.p) - 12} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--ch-green-900)">{Math.round(q.p)}%</text>
        </g>
      ))}
      <g fontSize={12.5} fontWeight={600} fill="var(--ch-warning-600)" textAnchor="middle">
        <text x={42} y={284} textAnchor="end" fontSize={12}>Tour</text>
        {tour.map((q) => (
          <text key={q.i} x={x(q.i)} y={284}>{Math.round(q.p)}%</text>
        ))}
      </g>
      <g fontSize={13} fontWeight={600} fill="var(--ch-text-primary)" textAnchor="middle">
        {bands.map((b, i) => (
          <text key={b.label} x={x(i)} y={246}>{b.label} ft</text>
        ))}
      </g>
      <g fontSize={12} fill="var(--ch-text-tertiary)" textAnchor="middle">
        <text x={42} y={264} textAnchor="end">Putts</text>
        {bands.map((b, i) => (
          <text key={b.label} x={x(i)} y={264}>{b.n}</text>
        ))}
      </g>
    </svg>
  );
}
