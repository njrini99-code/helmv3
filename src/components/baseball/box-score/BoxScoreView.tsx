'use client';

// =============================================================================
// src/components/baseball/box-score/BoxScoreView.tsx
//
// ISLAND REBUILD onto "The Living Annual" kit (design-system-living-annual.md
// §7): the game header is now a `SectionMasthead` (green accent rule, per the
// founder "more green" addendum) and every rainbow chip — the W/L/T result
// stamp, the scrimmage tag, and the per-pitcher decision letter — is an
// `InkBadge` in team (green) / neutral (graphite) tones only. No pursuit
// (clay) here: this is the Pressbox lane, not the War Room.
//
// Every measurable in both tables now renders through `<StatReadout>`
// (`font-annual tabular-nums`, near-black graphite contrast per the founder
// CONTRAST LAW) — the old `font-mono` rate-stat columns are gone, so batting
// and pitching read as one typographic system instead of two. Rate stats
// (AVG/OBP/SLG/ERA/WHIP) keep the box-score's own `format-stat.ts` helpers
// (shared with BoxScoreEntry.tsx) so the on-screen figures are byte-identical
// to before; only how they're *set* changed.
//
// PRESENTATION ONLY — batting/pitching totals math, the innings-pitched outs
// convention (#434), and every `data-testid` the e2e suite depends on
// (`batting-table`, `pitching-table`, `batting-totals-row`,
// `pitching-totals-row`) are unchanged.
// =============================================================================

import type { BaseballGame, BaseballBoxScoreBatting, BaseballBoxScorePitching } from '@/lib/types';
import { IconCalendar, IconMapPin } from '@/components/icons';
import { sumInningsPitched, ipToInnings } from '@/lib/baseball/innings';
import { EMPTY_STAT, formatAvg, formatEra, formatWhip } from './format-stat';
import {
  PaperCard,
  EditorsLetter,
  SectionMasthead,
  StatReadout,
  InkBadge,
  HairlineRule,
  Eyebrow,
  PositionChip,
} from '@/components/baseball/living-annual';
import type { InkBadgeProps } from '@/components/baseball/living-annual';

interface BoxScoreViewProps {
  game: BaseballGame;
  batting: BaseballBoxScoreBatting[];
  pitching: BaseballBoxScorePitching[];
}

/** Counting stats render through `<StatReadout>` — a number rolls on the
 *  odometer, a missing value renders the honest em dash statically. */
function fmtStat(val: number | null | undefined): number | string {
  return val == null ? EMPTY_STAT : val;
}

/** IP is stored in the .1/.2 (outs) convention, not a true decimal — display
 *  verbatim as a pre-formatted string (never fed to the numeric odometer
 *  branch, which would imply real decimal rounding). */
function fmtIP(val: number | null | undefined): string {
  if (val == null) return EMPTY_STAT;
  return val.toFixed(1);
}

// Shared typography so the two tables read as ONE record-book system, not two
// (packet: "unify batting/pitching table typography") — matches the th/tbody
// idiom already established on the passport game-log table
// (PlayerPassportFairway.tsx).
const TH = 'text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary';
const TD_STAT = 'px-2 py-2.5 text-center';
const TD_RATE = 'px-3 py-2.5 text-center';

/** Every possible pitching decision code, grouped by outcome: a team
 *  achievement (win / save / hold) reads team-green, everything else
 *  (loss / blown save / no-decision) stays quiet neutral graphite. Never
 *  clay — that ink is reserved for the War Room. */
function decisionTone(result: BaseballBoxScorePitching['result']): NonNullable<InkBadgeProps['tone']> {
  return result === 'W' || result === 'S' || result === 'H' ? 'team' : 'neutral';
}

export function BoxScoreView({ game, batting, pitching }: BoxScoreViewProps) {
  const gameDate = new Date(game.game_date + 'T00:00:00');
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const won = game.our_score != null && game.opponent_score != null && game.our_score > game.opponent_score;
  const lost = game.our_score != null && game.opponent_score != null && game.our_score < game.opponent_score;
  const resultLabel = won ? 'W' : lost ? 'L' : 'T';
  const resultTone: NonNullable<InkBadgeProps['tone']> = won ? 'team' : 'neutral';

  // Batting totals
  const totals = batting.reduce(
    (acc, r) => ({
      ab: acc.ab + r.ab,
      r: acc.r + r.r,
      h: acc.h + r.h,
      doubles: acc.doubles + r.doubles,
      triples: acc.triples + r.triples,
      hr: acc.hr + r.hr,
      rbi: acc.rbi + r.rbi,
      bb: acc.bb + r.bb,
      k: acc.k + r.k,
      sb: acc.sb + r.sb,
      cs: acc.cs + r.cs,
      sac: acc.sac + r.sac,
      sf: acc.sf + r.sf,
      lob: acc.lob + r.lob,
    }),
    { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, sac: 0, sf: 0, lob: 0 }
  );

  const teamAvg = formatAvg(totals.ab > 0 ? totals.h / totals.ab : null);

  // Pitching totals
  const pitchTotals = pitching.reduce(
    (acc, r) => ({
      // .1/.2 are outs, not decimals — sum via outs (6.1 + 6.2 → 13.0). (#434)
      ip: sumInningsPitched([acc.ip, r.ip]),
      h: acc.h + r.h,
      r: acc.r + r.r,
      er: acc.er + r.er,
      bb: acc.bb + r.bb,
      k: acc.k + r.k,
      hr: acc.hr + r.hr,
    }),
    { ip: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0 }
  );

  // Rates divide by TRUE innings (outs / 3), not the notation value. (#434)
  const teamInnings = ipToInnings(pitchTotals.ip);
  const teamERA = formatEra(teamInnings > 0 ? (9 * pitchTotals.er) / teamInnings : null);
  const teamWHIP = formatWhip(teamInnings > 0 ? (pitchTotals.bb + pitchTotals.h) / teamInnings : null);

  return (
    <div className="space-y-5">
      {/* Game header — a masthead, not a form-list. */}
      <PaperCard className="p-5">
        {(game.game_type === 'scrimmage' || game.home_away) && (
          <div className="mb-2 flex items-center gap-2">
            {/* Only the exception (scrimmage) earns a stamp — an official game
                needs no badge, the same convention the passport game log uses. */}
            {game.game_type === 'scrimmage' && <InkBadge label="Scrimmage" tone="neutral" />}
            {game.home_away && (
              <span className={TH}>{game.home_away}</span>
            )}
          </div>
        )}

        <SectionMasthead
          title={`vs ${game.opponent_name ?? 'Unknown Opponent'}`}
          ink="team"
          actions={
            game.our_score != null && game.opponent_score != null ? (
              <div className="flex items-center gap-3">
                <InkBadge label={resultLabel} tone={resultTone} variant="solid" className="px-2.5 py-1 text-body-lg" />
                <div className="text-right">
                  {/* Literal uppercase source text — `getByText(/^FINAL$/)` in
                      the e2e suite matches DOM text content, not CSS
                      `text-transform`, so this can't lean on `TH`'s `uppercase`. */}
                  <p className={TH}>FINAL</p>
                  <StatReadout
                    value={`${game.our_score} – ${game.opponent_score}`}
                    className="text-display leading-none"
                  />
                </div>
              </div>
            ) : undefined
          }
        >
          <div className="flex items-center gap-3 font-annual text-body-sm text-text-secondary">
            <span className="flex items-center gap-1">
              <IconCalendar size={14} />
              {formattedDate}
            </span>
            {game.location && (
              <span className="flex items-center gap-1">
                <IconMapPin size={14} />
                {game.location}
              </span>
            )}
          </div>
        </SectionMasthead>
      </PaperCard>

      {/* Batting */}
      {batting.length > 0 && (
        <PaperCard className="overflow-hidden p-0" data-testid="batting-table">
          <div className="px-5 pb-3 pt-4">
            <Eyebrow ink="team">Batting</Eyebrow>
            <HairlineRule ink="team" weight={2} className="mt-2 w-10" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-[1.5px] border-grade-plus/60 bg-[var(--paper-canvas)]">
                  <th scope="col" className={`sticky left-0 min-w-[140px] bg-[var(--paper-canvas)] px-4 py-2.5 text-left ${TH}`}>
                    Player
                  </th>
                  {['AB','R','H','2B','3B','HR','RBI','BB','K','SB','CS','HBP','SAC','SF','LOB'].map((h) => (
                    <th key={h} scope="col" className={`min-w-[36px] px-2 py-2.5 ${TH}`}>{h}</th>
                  ))}
                  <th scope="col" className={`min-w-[48px] px-3 py-2.5 ${TH}`}>AVG</th>
                  <th scope="col" className={`min-w-[48px] px-3 py-2.5 ${TH}`}>OBP</th>
                  <th scope="col" className={`min-w-[48px] px-3 py-2.5 ${TH}`}>SLG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {batting.map((row) => (
                  <tr key={row.id} className="hover:bg-[color:var(--paper-canvas)]">
                    <td className="sticky left-0 bg-[var(--paper)] px-4 py-2.5 font-annual text-body-sm font-medium text-text-primary">
                      {row.player ? (
                        <span className="inline-flex items-center gap-1.5">
                          {row.player.first_name?.[0]}. {row.player.last_name}
                          {row.player.primary_position && (
                            <PositionChip label={row.player.primary_position} size="sm" />
                          )}
                        </span>
                      ) : EMPTY_STAT}
                    </td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.ab)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.r)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.h)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.doubles)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.triples)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.hr)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.rbi)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.bb)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.k)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.sb)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.cs)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.hbp)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.sac)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.sf)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.lob)} /></td>
                    <td className={TD_RATE}><StatReadout value={formatAvg(row.avg)} /></td>
                    <td className={TD_RATE}><StatReadout value={formatAvg(row.obp)} /></td>
                    <td className={TD_RATE}><StatReadout value={formatAvg(row.slg)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-grade-plus/60 bg-[var(--paper-canvas)]" data-testid="batting-totals-row">
                  <td className={`sticky left-0 bg-[var(--paper-canvas)] px-4 py-2.5 ${TH} text-text-primary`}>TOTALS</td>
                  <td className={TD_STAT}><StatReadout value={totals.ab} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.r} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.h} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.doubles} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.triples} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.hr} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.rbi} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.bb} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.k} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.sb} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.cs} className="font-semibold" /></td>
                  <td colSpan={1} />
                  <td className={TD_STAT}><StatReadout value={totals.sac} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.sf} className="font-semibold" /></td>
                  <td className={TD_STAT}><StatReadout value={totals.lob} className="font-semibold" /></td>
                  <td className={TD_RATE}><StatReadout value={teamAvg} className="font-semibold" /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </PaperCard>
      )}

      {/* Pitching */}
      {pitching.length > 0 && (
        <PaperCard className="overflow-hidden p-0" data-testid="pitching-table">
          <div className="px-5 pb-3 pt-4">
            <Eyebrow ink="team">Pitching</Eyebrow>
            <HairlineRule ink="team" weight={2} className="mt-2 w-10" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-[1.5px] border-grade-plus/60 bg-[var(--paper-canvas)]">
                  <th scope="col" className={`sticky left-0 min-w-[140px] bg-[var(--paper-canvas)] px-4 py-2.5 text-left ${TH}`}>
                    Pitcher
                  </th>
                  {['IP','H','R','ER','BB','K','HR','PC'].map((h) => (
                    <th key={h} scope="col" className={`min-w-[40px] px-2 py-2.5 ${TH}`}>{h}</th>
                  ))}
                  <th scope="col" className={`min-w-[52px] px-3 py-2.5 ${TH}`}>ERA</th>
                  <th scope="col" className={`min-w-[52px] px-3 py-2.5 ${TH}`}>WHIP</th>
                  <th scope="col" className={`min-w-[40px] px-3 py-2.5 ${TH}`}>Dec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hairline)]">
                {pitching.map((row) => (
                  <tr key={row.id} className="hover:bg-[color:var(--paper-canvas)]">
                    <td className="sticky left-0 bg-[var(--paper)] px-4 py-2.5 font-annual text-body-sm font-medium text-text-primary">
                      {row.player ? `${row.player.first_name?.[0]}. ${row.player.last_name}` : EMPTY_STAT}
                    </td>
                    <td className={TD_STAT}><StatReadout value={fmtIP(row.ip)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.h)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.r)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.er)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.bb)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.k)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.hr)} /></td>
                    <td className={TD_STAT}><StatReadout value={fmtStat(row.pitch_count)} /></td>
                    <td className={TD_RATE}><StatReadout value={formatEra(row.era)} /></td>
                    <td className={TD_RATE}><StatReadout value={formatWhip(row.whip)} /></td>
                    <td className={TD_RATE}>
                      {row.result && (
                        <InkBadge label={row.result} tone={decisionTone(row.result)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {pitching.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-grade-plus/60 bg-[var(--paper-canvas)]" data-testid="pitching-totals-row">
                    <td className={`sticky left-0 bg-[var(--paper-canvas)] px-4 py-2.5 ${TH} text-text-primary`}>TOTALS</td>
                    <td className={TD_STAT}><StatReadout value={fmtIP(pitchTotals.ip)} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.h} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.r} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.er} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.bb} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.k} className="font-semibold" /></td>
                    <td className={TD_STAT}><StatReadout value={pitchTotals.hr} className="font-semibold" /></td>
                    <td colSpan={1} />
                    <td className={TD_RATE}><StatReadout value={teamERA} className="font-semibold" /></td>
                    <td className={TD_RATE}><StatReadout value={teamWHIP} className="font-semibold" /></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </PaperCard>
      )}

      {/* Empty states — no yellow warning boxes, an unreleased-first-issue letter. */}
      {batting.length === 0 && pitching.length === 0 && (
        <EditorsLetter ink="team" title="No stats recorded for this game yet" />
      )}
    </div>
  );
}
