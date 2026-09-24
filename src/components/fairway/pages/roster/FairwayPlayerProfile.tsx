'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayPlayerProfile — the coach player field sheet
 * ----------------------------------------------------------------------------
 * Rebuilt against docs/design/fairway-facelift/screens/roster-player.v3.md and
 * the page language in LANGUAGE.md. The page answers one question — "is this
 * player getting better, and where's my next conversation with them?" — in the
 * documented anatomy:
 *
 *   1. Masthead, bare on the canvas: identity, then one honest verdict
 *      sentence carrying the two links a coach can act on.
 *   2. The stage, the ONE Surface: `RoundStrip` (every plottable round against
 *      par on a real date axis) beside a divided readouts column.
 *   3. The ledger row, bare columns on hairlines: strokes-gained standing off
 *      one shared vertical zero rule, and the open focus areas.
 *   4. The round log as a dense table, with a stacked list for phone.
 *
 * What this replaced: a StatMatrix mislabeled "Season" over career numbers, a
 * standalone Standing Surface whose four sibling SG rows were fetched and
 * thrown away, a two-Surface Focus/Recent grid, and a Game/Genome/Rounds
 * Segmented row whose only on-page tab mounted `StatsSpineStage`. See the
 * spec's Risks section: dropping that mount also drops its in-page `?area=`
 * drill, which is a deliberate trade, not an oversight.
 *
 * No clock is read during render. `today` arrives as a bare `YYYY-MM-DD`
 * string from the route loader; every derivation lives in
 * `roster-player-logic.ts`, which has no JSX and no React.
 * ========================================================================== */

import { useMemo } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Surface, Button, InlineNotice, InsufficientData } from '@/components/fairway';
import { Avatar } from '@/components/fairway/controls/avatar';
import { scoreFieldCap } from '@/components/fairway/modules/ScoreField';
import { FieldReadouts, SectionHead, VerdictLine } from '@/components/fairway/pages/dashboard/coach-home-parts';
import { IconMessage } from '@/components/icons';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayPlayerStatusBadge } from './FairwayPlayerStatusBadge';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';
import { OVERLINE, FocusLedger, RoundLog, RoundStrip, StandingLedger } from './roster-player-parts';
import {
  allRoundsHref,
  buildDossierReadouts,
  buildDossierVerdict,
  gameHref,
  genomeHref,
  plottableRounds,
  scoringTrend,
  standingHalfSpan,
  standingLedgerRows,
  stripDomain,
  stripRow,
  type DossierRound,
} from './roster-player-logic';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';

/* ---------------------------------------------------------------------------
 * Props — mirror the roster/[id] loader output
 * ------------------------------------------------------------------------- */

export interface FairwayPlayerProfilePlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  phone: string | null;
  email: string | null;
  created_at: string | null;
}

export interface FairwayPlayerProfileFocusArea {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  created_at: string | null;
}

export type FairwayPlayerProfileRound = DossierRound;

export interface FairwayPlayerProfileProps {
  player: FairwayPlayerProfilePlayer;
  /** golf_team_members.status for this player on the coach's team. */
  membershipStatus: string | null;
  /** Career (`overall`) detailed stats — null when the read failed. */
  detailedStats: GolfStats | null;
  /** SG standing rows (you / team / Tour) — [] when there are none. */
  standingRows: PlayerStandingRow[];
  /**
   * True when `getPlayerStandingRows` itself FAILED. Distinct from an empty
   * `standingRows`, which is the honest state of a player without five
   * shot-tracked rounds: a failed read must never render as that empty state,
   * or a coach reads "no data" as "this kid isn't tracked".
   */
  standingUnavailable: boolean;
  /** Up to 3 non-completed focus areas, newest first. */
  focusAreas: FairwayPlayerProfileFocusArea[];
  /** Up to 12 most recent scored rounds, newest first. */
  recentRounds: FairwayPlayerProfileRound[];
  /** True when the rounds query errored. Same honesty rule as above. */
  roundsUnavailable: boolean;
  /** The coach's today as a bare `YYYY-MM-DD`, resolved once by the loader. */
  today: string;
  className?: string;
}

function fullName(p: FairwayPlayerProfilePlayer): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/* ---------------------------------------------------------------------------
 * FairwayPlayerProfile
 * ------------------------------------------------------------------------- */

export function FairwayPlayerProfile({
  player,
  membershipStatus,
  detailedStats,
  standingRows,
  standingUnavailable,
  focusAreas,
  recentRounds,
  roundsUnavailable,
  today,
  className,
}: FairwayPlayerProfileProps) {
  const name = fullName(player);
  const location = [player.hometown, player.state].filter(Boolean).join(', ');

  /* ── The stage ─────────────────────────────────────────────────────────── */
  // One fetch, three consumers. The PLOTTABLE subset drives the axis, the
  // strip and the stage's own round count; the table below shows every fetched
  // row, because a round dated in year 60824 is still a real row — it just
  // cannot sit on an axis without destroying it for the other eleven.
  const plotted = useMemo(() => plottableRounds(recentRounds, today), [recentRounds, today]);
  const domain = useMemo(() => stripDomain(plotted, today), [plotted, today]);
  const cap = useMemo(() => scoreFieldCap([stripRow(player.id, name, plotted)]), [player.id, name, plotted]);
  const trend = useMemo(() => scoringTrend(recentRounds), [recentRounds]);

  const readouts = useMemo(
    () => buildDossierReadouts({
      detailedStats,
      standingRows,
      standingUnavailable,
      roundsUnavailable,
      trend,
      plottedCount: plotted.length,
    }),
    [detailedStats, standingRows, standingUnavailable, roundsUnavailable, trend, plotted.length],
  );

  const verdictParts = useMemo(
    () => buildDossierVerdict({ playerId: player.id, standingRows, standingUnavailable, trend }),
    [player.id, standingRows, standingUnavailable, trend],
  );

  const sgRows = useMemo(() => standingLedgerRows(standingRows, player.id), [standingRows, player.id]);
  const sgHalf = useMemo(() => standingHalfSpan(sgRows), [sgRows]);

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[1200px] flex-col overflow-x-clip px-5 pt-6 pb-10 md:px-8 md:pt-8 md:pb-28',
        className,
      )}
    >
      {/* ── 1 · Masthead ────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {/* No arrow glyph: the control carries its destination in words. */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-text-tertiary">
            <Link href="/golf/dashboard/roster">Roster</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button asChild variant="primary" size="sm" leftIcon={<IconMessage size={16} />}>
              <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message</Link>
            </Button>
            <FairwayPlayerActionsMenu
              playerId={player.id}
              playerName={name}
              currentStatus={membershipStatus}
              email={player.email}
              phone={player.phone}
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} src={player.avatar_url} size="md" className="shrink-0" />
          <div className="min-w-0">
            <h1 className="break-words font-fw-display text-h1 tracking-[-0.02em] text-text-primary md:text-display">
              {name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <FairwayYearBadge year={player.graduation_year} />
              <FairwayPlayerStatusBadge
                playerId={player.id}
                currentStatus={membershipStatus}
                editable
                size="sm"
              />
              {location ? (
                <span className="font-fw-sans text-caption text-text-tertiary">{location}</span>
              ) : null}
            </div>
          </div>
        </div>

        <VerdictLine parts={verdictParts} />
      </header>

      {/* ── 2 · The stage ───────────────────────────────────────────────── */}
      <Surface as="section" aria-label="Round strip" elevation="border" padding="none" className="mt-10 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4 md:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            {/* The count is what the strip actually DREW, not what was
                fetched: a round with an impossible date is excluded from the
                axis, and an overline claiming twelve above eleven marks is a
                small lie the reader can see. */}
            <p className={OVERLINE}>
              Round history
              {plotted.length > 0 ? (
                <>
                  {' '}
                  <span aria-hidden="true">·</span> last {plotted.length}{' '}
                  {plotted.length === 1 ? 'round' : 'rounds'}
                </>
              ) : null}
            </p>
            <h2 className="font-fw-display text-h2 text-text-primary">Round strip</h2>
            <p className="max-w-[60ch] font-fw-sans text-caption text-text-tertiary">
              Each bar is one round against par, oldest to today. Amber rises over par, green drops
              under; par is the line, scale ±{cap}.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="order-2 flex min-w-0 flex-col justify-center px-5 py-5 md:px-6 xl:order-1">
            {roundsUnavailable ? (
              <InlineNotice tone="warning" title="Couldn’t load this player’s rounds">
                Something went wrong reading their rounds. Refresh to try again; nothing has been
                lost.
              </InlineNotice>
            ) : plotted.length === 0 ? (
              <InsufficientData
                title="No scored rounds yet"
                description="Rounds land here as this player logs them, and the strip draws each one against par."
              />
            ) : (
              <RoundStrip rounds={plotted} domain={domain} cap={cap} />
            )}
          </div>
          <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
            <FieldReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · The ledger row ──────────────────────────────────────────── */}
      {/* The split's floor is measured, not assumed. At `md` the Standing
          column is 298px and its row needs 316 (8rem label + 6rem bar +
          4.25rem value + two 12px gaps), so the row spilled into Focus. At
          `lg` the column is 334 and the same row fits with slack, so the even
          two-up starts there. The unequal 7/5 and the vertical divider wait
          for `xl`, where the column is 526. Below `lg`, one column. */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 lg:grid-cols-2 lg:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        <section aria-label="Strokes gained" className="flex flex-col gap-3 xl:col-span-7 xl:pr-8">
          <SectionHead title="Strokes gained" action={{ label: 'Game', href: gameHref(player.id) }} />
          <StandingLedger rows={sgRows} half={sgHalf} unavailable={standingUnavailable} />
        </section>
        <section aria-label="Focus areas" className="flex flex-col gap-3 xl:col-span-5 xl:pl-8">
          <SectionHead
            title="Focus"
            count={focusAreas.length > 0 ? focusAreas.length : undefined}
            action={{ label: 'Genome', href: genomeHref(player.id) }}
          />
          <FocusLedger areas={focusAreas} genomeHref={genomeHref(player.id)} />
        </section>
      </div>

      {/* ── 4 · The round log ───────────────────────────────────────────── */}
      <section id="rounds" aria-label="Round log" className="mt-10 flex scroll-mt-24 flex-col gap-3">
        <SectionHead
          title="Round log"
          count={roundsUnavailable ? undefined : recentRounds.length}
          action={{ label: 'View all', href: allRoundsHref(name) }}
        />
        {roundsUnavailable ? (
          <InlineNotice tone="warning" title="Couldn’t load this player’s rounds">
            Something went wrong reading their rounds. Refresh to try again; nothing has been lost.
          </InlineNotice>
        ) : recentRounds.length === 0 ? (
          <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
            No scored rounds yet.
          </p>
        ) : (
          <RoundLog rounds={recentRounds} />
        )}
      </section>
    </div>
  );
}
