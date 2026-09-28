'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierDetail — the role-forked Qualifier page
 * ----------------------------------------------------------------------------
 * A PRESENTATION + LAYOUT surface: the route page (`[id]/page.tsx`) owns the
 * Supabase reads, the per-player round breakdown, the entrant / rounds counts
 * and the role + can-play computation, and passes the pre-computed data in.
 * The live standings come from the Leaderboard's own realtime feed, reported
 * up once it has loaded (`onStandingsChange`), so the status card and the
 * round-progress dots read the same rows the board shows. One subscription.
 *
 * Layout (owner 2026-09-27/28): one masthead (the display title without its
 * " — suffix", the start date only), then from `xl` a main column (the live
 * Leaderboard, the coach's round-by-round, selections) beside a right rail (a
 * small "where it stands" card on top, the Details card below: dates, course,
 * spots, rules, and every player's rounds played as dots). A phone stacks
 * them in DOM order: status → leaderboard → coach modules → details (grid
 * placement, never CSS `order`, so focus order matches). No green bands:
 * contrast comes from surface steps (sunken header rows, a strong rule under
 * them), the type scale and hairlines; green is the primary action, under-par
 * figures and the live pill only.
 *
 * HONEST states:
 *   • The status card shows the server's scorecard count until the feed has
 *     answered: never a "0" flash, never a "0" after a failed read.
 *   • Round-by-round names why it is empty: nothing posted yet, a closed
 *     qualifier with nothing posted, or scores entered without linked rounds
 *     (the board has totals, there are no round cards to split).
 *   • Blank rules, a missing deadline or course are left out, not dashed.
 * ========================================================================== */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChartNoAxesColumn, ListChecks } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  StatusPill,
  EmptyState,
  InlineNotice,
  ViewHeader,
  Avatar,
  Skeleton,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { QualifierRoundCourse } from '@/app/golf/actions/golf';
import { formatToPar } from '@/lib/golf/format-to-par';

import {
  FairwayQualifierLeaderboard,
  type LeaderboardRound,
  type LeaderboardSeason,
} from './FairwayQualifierLeaderboard';
import { qualifierStatusMeta } from './qualifier-status';
import {
  deriveStandings,
  fieldProgress,
  leaderSummary,
  positionLabel,
  progressHeadline,
  qualifierDisplayName,
  toParTone,
  type Standing,
} from './qualifier-display';

/** One round's score within a player's breakdown (shape from the route page). */
interface RoundScore {
  roundNumber: number;
  score: number | null;
  toPar: number | null;
  date: string;
  courseName: string;
  /** The round card; the route page sends it to a coach only. */
  roundId?: string | null;
}

/** Per-player breakdown entry (shape from the route page). */
interface PlayerBreakdown {
  playerName: string;
  rounds: RoundScore[];
  totalScore: number;
  totalToPar: number;
}

export interface FairwayQualifierDetailProps {
  // ── Identity / role ────────────────────────────────────────────────────────
  qualifierId: string;
  isCoach: boolean;
  isPlayer: boolean;

  // ── Qualifier (real golf_qualifiers columns) ────────────────────────────────
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  entryDeadline: string | null;
  courseName: string | null;
  spotsAvailable: number | null;
  rules: string | null;

  // ── Derived counts (computed by the route page) ──────────────────────────────
  entrantCount: number;
  roundsSubmitted: number;

  // ── Player CTA gate (entered AND status in_progress|upcoming) ────────────────
  canPlayRound: boolean;

  // ── Coach round-by-round (the [playerId, breakdown] tuples + max round seen) ─
  breakdown: [string, PlayerBreakdown][];
  maxRoundNumber: number;

  // ── Feature G — multi-round model + the course assigned to each round ─────────
  numRounds: number;
  roundCourses: QualifierRoundCourse[];

  // ── Coach selections strip (W29 selection_state + count) ─────────────────────
  selectionState: string;
  selectionSlotsTotal: number;
  selectionSlotsCoachPick: number;
  selectionsCount: number;

  // ── Coach only: season scoring averages for the board's player panels ──────
  season?: LeaderboardSeason | null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Date formatting (presentation only)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Format a bare ISO date ("YYYY-MM-DD") for display. Parsed as **local**
 * midnight, not `new Date(dateStr)` — that treats a date-only string as UTC
 * midnight, so a timezone behind UTC (any US zone) reads it back as the PRIOR
 * calendar day. That off-by-one also produces a hydration mismatch: the
 * server (commonly UTC) and the browser (the viewer's local zone) format the
 * same UTC instant into two different calendar days (#30/#126). Matches
 * `FairwayMyQualifiers.tsx`'s local-safe parse so a qualifier's date agrees
 * across every surface it's shown on.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// formatToPar is consolidated onto @/lib/golf/format-to-par (U+2212 minus; see
// src/test/schema/format-to-par-single-source.test.ts), and its colour onto
// `toParTone` in ./qualifier-display.

/* ─────────────────────────────────────────────────────────────────────────
 * The page
 * ──────────────────────────────────────────────────────────────────────── */

export function FairwayQualifierDetail(props: FairwayQualifierDetailProps) {
  const {
    qualifierId,
    isCoach,
    isPlayer,
    name,
    status,
    startDate,
    entryDeadline,
    courseName,
    spotsAvailable,
    rules,
    entrantCount,
    roundsSubmitted,
    canPlayRound,
    breakdown,
    maxRoundNumber,
    numRounds,
    roundCourses,
    selectionState,
    selectionSlotsTotal,
    selectionSlotsCoachPick,
    selectionsCount,
    season = null,
  } = props;

  const sm = qualifierStatusMeta(status);
  const title = qualifierDisplayName(name);
  const backHref = isCoach ? '/golf/dashboard/qualifiers' : '/golf/dashboard/my-qualifiers';
  const backLabel = isCoach ? 'Qualifiers' : 'My qualifiers';

  // The Leaderboard's live feed, reported up once it has loaded (null before).
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const feedHasScores = standings?.some((s) => s.hasScore) ?? false;

  // Each player's linked round cards for the board's detail panels; absent
  // when no round is linked (scores keyed straight onto the entries).
  const roundsByPlayer = useMemo(() => {
    const linked = breakdown.filter(([, data]) => data.rounds.length > 0);
    if (linked.length === 0) return undefined;
    return new Map<string, LeaderboardRound[]>(
      linked.map(([playerId, data]) => [
        playerId,
        data.rounds.map((r) => ({ roundNumber: r.roundNumber, score: r.score, toPar: r.toPar, roundId: r.roundId ?? null })),
      ]),
    );
  }, [breakdown]);

  // ONE primary action, role-forked — never two.
  // Player (entered + active) → green "Play qualifier round".
  // Coach → quieter "Manage selections" (→ a DIFFERENT route, the W29 workspace).
  let primaryAction: React.ReactNode = null;
  if (isPlayer && canPlayRound) {
    primaryAction = (
      <Button asChild variant="primary" size="md">
        <Link href={`/golf/dashboard/rounds/new?qualifier=${qualifierId}`}>Play qualifier round</Link>
      </Button>
    );
  } else if (isCoach) {
    primaryAction = (
      <Button asChild variant="secondary" size="md">
        <Link href={`/golf/dashboard/coachhelm/qualifying/${qualifierId}`}>Manage selections</Link>
      </Button>
    );
  }

  // Coach-only "Edit qualifier" (name/dates/rules/spots/round-courses).
  const secondaryActions = isCoach ? (
    <Button asChild variant="ghost" size="md">
      <Link href={`/golf/dashboard/qualifiers/${qualifierId}/edit`}>Edit qualifier</Link>
    </Button>
  ) : undefined;

  // P326 — no player dead-end. A player who can't play (not entered, or the
  // qualifier is over) gets the reason and a next step. There is no player
  // self-entry flow and no "add entrant" action, so the copy points to a person.
  let playerNotice: { tone: 'info' | 'warning'; title: string; body: string } | null = null;
  if (isPlayer && !canPlayRound) {
    if (status === 'completed') {
      playerNotice = {
        tone: 'info',
        title: 'This qualifier is completed',
        body: 'Entries are closed and no further rounds can be posted. Review the final standings below.',
      };
    } else {
      playerNotice = {
        tone: 'warning',
        title: "You're not entered in this qualifier",
        body: "Entries were locked in when this qualifier was created, so there's no in-app way to join now. Talk to your coach if you think this is a mistake.",
      };
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
      {/* Coach phones already get "‹ Qualifiers" in the shell top bar (NAT-04);
          the player's link targets My qualifiers, which the top bar does not. */}
      <Link
        href={backHref}
        className={cn(
          'mb-5 inline-flex min-h-11 items-center gap-1 font-fw-sans text-caption text-text-tertiary transition-colors hover:text-text-secondary md:min-h-0',
          isCoach && 'max-md:hidden',
        )}
      >
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      {/* ONE masthead — the display title, status, start date, field, course */}
      <ViewHeader
        title={title}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        meta={
          <>
            <StatusPill tone={sm.tone} pulse={sm.pulse}>
              {sm.label}
            </StatusPill>
            <span className="tabular-nums">{formatDate(startDate)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {entrantCount} {entrantCount === 1 ? 'entrant' : 'entrants'}
            </span>
            {courseName ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{courseName}</span>
              </>
            ) : null}
          </>
        }
      />

      {playerNotice ? (
        <InlineNotice tone={playerNotice.tone} title={playerNotice.title} className="mt-6">
          {playerNotice.body}
        </InlineNotice>
      ) : null}

      {/* The DOM is the reading order, so a phone stacks it as written: the
          status card, the main column (board, then the coach's modules), the
          details. From xl the grid places the status and details cards in a
          right rail (below 1280px the expanded sidebar leaves too little room
          for the board's table beside a rail); no CSS `order`, so focus and
          screen-reader order match what is on screen. The rail's second row is 1fr: the main column
          spans both rows, and an item spanning a flexible row only sizes that
          row, so row 1 stays the status card's height and Details sits right
          under it however tall the board grows. */}
      <div className="mt-6 flex flex-col gap-6 lg:mt-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,22rem)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-8 xl:gap-y-6">
        <StatusCard
          className="xl:col-start-2 xl:row-start-1"
          status={status}
          numRounds={numRounds}
          entrantCount={entrantCount}
          serverCardsIn={roundsSubmitted}
          standings={standings}
        />

        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:gap-8">
          <FairwayQualifierLeaderboard
            qualifierId={qualifierId}
            entrantCount={entrantCount}
            selectionSlotsTotal={selectionSlotsTotal}
            selectionSlotsCoachPick={selectionSlotsCoachPick}
            numRounds={numRounds}
            roundsByPlayer={roundsByPlayer}
            season={isCoach ? season : null}
            canOpenRounds={isCoach}
            onStandingsChange={setStandings}
          />

          {isCoach ? (
            <RoundByRoundCard
              status={status}
              breakdown={breakdown}
              maxRoundNumber={maxRoundNumber}
              feedHasScores={feedHasScores}
            />
          ) : null}

          {isCoach ? (
            <SelectionsStrip
              qualifierId={qualifierId}
              status={status}
              selectionState={selectionState}
              selectionSlotsTotal={selectionSlotsTotal}
              selectionsCount={selectionsCount}
            />
          ) : null}
        </div>

        <DetailsCard
          className="xl:col-start-2 xl:row-start-2"
          status={status}
          startDate={startDate}
          entryDeadline={entryDeadline}
          courseName={courseName}
          spotsAvailable={spotsAvailable}
          selectionSlotsTotal={selectionSlotsTotal}
          selectionSlotsCoachPick={selectionSlotsCoachPick}
          numRounds={numRounds}
          roundCourses={roundCourses}
          rules={rules}
          standings={standings}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Status card — where the qualifier stands, top of the rail
 * ──────────────────────────────────────────────────────────────────────── */

function StatusCard({
  status,
  numRounds,
  entrantCount,
  serverCardsIn,
  standings,
  className,
}: {
  status: string;
  numRounds: number;
  entrantCount: number;
  /** The route page's completed-round count, shown until the feed answers. */
  serverCardsIn: number;
  standings: Standing[] | null;
  className?: string;
}) {
  const rounds = Math.max(1, numRounds);
  const progress = standings ? fieldProgress(standings, rounds) : null;
  const cardsIn = progress ? progress.cardsIn : serverCardsIn;
  const cardsTotal = progress && progress.entrants > 0 ? progress.cardsTotal : entrantCount * rounds;
  const leader = standings ? leaderSummary(standings) : null;
  const completed = status === 'completed';

  return (
    <Surface padding="none" aria-label="Where it stands" className={cn('overflow-hidden', className)}>
      <div className="px-5 pb-5 pt-4">
        <p className="font-fw-sans text-caption text-text-tertiary">{completed ? 'Result' : 'Progress'}</p>
        {progress ? (
          <p className="mt-0.5 font-fw-sans text-h3 text-text-primary">{progressHeadline(progress, status)}</p>
        ) : (
          <Skeleton className="mt-1.5 h-5 w-40 rounded-fw-sm" />
        )}

        <RoundSegments perRound={progress?.perRound ?? null} numRounds={rounds} entrants={progress?.entrants ?? 0} />

        <p className="mt-4 flex items-baseline gap-1.5 font-fw-sans" data-testid="qualifier-cards-in">
          <span className="text-h2 tabular-nums text-text-primary">{cardsIn}</span>
          <span className="text-body-sm tabular-nums text-text-secondary">of {cardsTotal} scorecards in</span>
        </p>
      </div>

      {leader && leader.leaders[0] ? (
        <div className="flex items-center gap-3 border-t border-border-subtle bg-surface-sunken px-5 py-3.5">
          {leader.leaders.length === 1 ? (
            <Avatar
              name={leader.leaders[0].playerName}
              identityKey={leader.leaders[0].playerId}
              tone="identity"
              size="sm"
              decorative
            />
          ) : null}
          <p className="min-w-0 flex-1 font-fw-sans text-body-sm leading-5 text-text-secondary">
            <LeaderLine leader={leader} completed={completed} />
          </p>
          <span
            className={cn(
              'shrink-0 font-fw-sans text-h3 tabular-nums',
              toParTone(leader.leaders[0].totalToPar),
            )}
          >
            {formatToPar(leader.leaders[0].totalToPar)}
          </span>
        </div>
      ) : null}
    </Surface>
  );
}

/** "Cole Bennett leads by 3", "… finished first, 2 clear", "… are tied for first". */
function LeaderLine({ leader, completed }: { leader: NonNullable<ReturnType<typeof leaderSummary>>; completed: boolean }) {
  const [first, second] = leader.leaders;
  if (!first) return null;
  const name = (s: Standing) => <span className="font-semibold text-text-primary">{s.playerName}</span>;
  if (leader.leaders.length > 2) {
    return (
      <>
        <span className="font-semibold text-text-primary">{leader.leaders.length} players</span>{' '}
        {completed ? 'finished tied for first' : 'are tied for first'}
      </>
    );
  }
  if (second) {
    return (
      <>
        {name(first)} and {name(second)} {completed ? 'finished tied for first' : 'are tied for first'}
      </>
    );
  }
  const margin = leader.margin;
  const clear = margin && margin > 0 ? `${margin} ${margin === 1 ? 'shot' : 'shots'}` : null;
  if (completed) {
    return (
      <>
        {name(first)} finished first{clear ? `, ${clear} clear` : ''}
      </>
    );
  }
  return (
    <>
      {name(first)} {clear ? `leads by ${clear}` : 'leads'}
    </>
  );
}

/** One bar per round, filled by the share of the field through it. */
function RoundSegments({
  perRound,
  numRounds,
  entrants,
}: {
  perRound: number[] | null;
  numRounds: number;
  entrants: number;
}) {
  const shares = perRound ?? Array.from({ length: numRounds }, () => 0);
  return (
    <div className="mt-3">
      <div aria-hidden className="flex gap-1.5">
        {shares.map((share, i) => (
          <div key={i} className="min-w-0 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]">
              <div
                className="h-full rounded-full bg-text-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(share * 100)}%` }}
              />
            </div>
            <p
              className={cn(
                'mt-1.5 font-fw-sans text-caption tabular-nums',
                share > 0 ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              R{i + 1}
            </p>
          </div>
        ))}
      </div>
      {perRound && entrants > 0 ? (
        <p className="sr-only">
          {perRound
            .map((share, i) => `Round ${i + 1}: ${Math.round(share * entrants)} of ${entrants} players through`)
            .join('. ')}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Details card — dates, course, spots, rules, and rounds played per player
 * ──────────────────────────────────────────────────────────────────────── */

function DetailsCard({
  status,
  startDate,
  entryDeadline,
  courseName,
  spotsAvailable,
  selectionSlotsTotal,
  selectionSlotsCoachPick,
  numRounds,
  roundCourses,
  rules,
  standings,
  className,
}: {
  status: string;
  startDate: string;
  entryDeadline: string | null;
  courseName: string | null;
  spotsAvailable: number | null;
  selectionSlotsTotal: number;
  selectionSlotsCoachPick: number;
  numRounds: number;
  roundCourses: QualifierRoundCourse[];
  rules: string | null;
  standings: Standing[] | null;
  className?: string;
}) {
  const rounds = Math.max(1, numRounds);
  const ruleText = rules?.trim() ?? '';
  const coachPicks = Math.min(Math.max(selectionSlotsCoachPick, 0), selectionSlotsTotal);
  const onScore = selectionSlotsTotal - coachPicks;
  // Feature G — the course per round, only when split across rounds and set.
  const byRound = new Map(roundCourses.map((rc) => [rc.roundNumber, rc]));
  const showRoundCourses = rounds > 1 && roundCourses.some((rc) => rc.courseName || rc.courseId);

  return (
    <Surface padding="none" aria-label="Qualifier details" className={cn('overflow-hidden', className)}>
      <div className="border-b border-border-strong bg-surface-sunken px-5 py-3">
        <h2 className="font-fw-sans text-body font-semibold text-text-primary">Details</h2>
      </div>

      <dl className="divide-y divide-border-subtle px-5">
        <DetailRow label="Start date" value={formatDate(startDate)} numeric />
        {entryDeadline ? <DetailRow label="Entry deadline" value={formatDate(entryDeadline)} numeric /> : null}
        {courseName ? <DetailRow label="Course" value={courseName} /> : null}
        <DetailRow label="Rounds" value={String(rounds)} numeric />
        {spotsAvailable !== null ? <DetailRow label="Spots" value={String(spotsAvailable)} numeric /> : null}
        {selectionSlotsTotal > 0 && coachPicks > 0 ? (
          <DetailRow label="Selection" value={`${onScore} on score · ${coachPicks} coach's pick`} numeric />
        ) : null}
      </dl>

      {showRoundCourses ? (
        <div className="border-t border-border-subtle px-5 py-4">
          <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">Course by round</h3>
          <ul className="mt-2 space-y-1.5">
            {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => {
              const assigned = byRound.get(n)?.courseName;
              return (
                <li key={n} className="flex items-baseline gap-3 font-fw-sans text-body-sm">
                  <span className="w-7 shrink-0 tabular-nums text-text-tertiary">R{n}</span>
                  <span className={cn('min-w-0 flex-1', assigned ? 'text-text-primary' : 'text-text-tertiary')}>
                    {assigned ?? 'Course not set yet'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {ruleText ? (
        <div className="border-t border-border-subtle px-5 py-4">
          <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">Rules</h3>
          <Inset padding="sm" className="mt-2">
            <p className="whitespace-pre-wrap font-fw-sans text-body-sm text-text-primary">{ruleText}</p>
          </Inset>
        </div>
      ) : null}

      <RoundsPlayed standings={standings} numRounds={rounds} status={status} />
    </Surface>
  );
}

function DetailRow({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 font-fw-sans text-caption text-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right font-fw-sans text-body-sm font-semibold text-text-primary',
          numeric && 'tabular-nums',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Every player's rounds played out of the qualifier's rounds, as dots. */
function RoundsPlayed({
  standings,
  numRounds,
  status,
}: {
  standings: Standing[] | null;
  numRounds: number;
  status: string;
}) {
  const anyPlayed = standings?.some((s) => s.roundsCompleted > 0) ?? false;

  return (
    <section aria-label="Rounds played" className="border-t border-border-subtle px-5 pb-4 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">Rounds played</h3>
        <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          {numRounds} {numRounds === 1 ? 'round' : 'rounds'} each
        </span>
      </div>

      {standings === null ? (
        <div role="status" aria-label="Loading rounds played" className="mt-3 space-y-3">
          <Skeleton className="h-4 w-full rounded-fw-sm" />
          <Skeleton className="h-4 w-5/6 rounded-fw-sm" />
          <Skeleton className="h-4 w-4/6 rounded-fw-sm" />
        </div>
      ) : !anyPlayed ? (
        <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">
          {status === 'completed'
            ? 'No rounds were posted before this qualifier closed.'
            : standings.length > 0
              ? `No rounds posted yet. ${standings.length} ${standings.length === 1 ? 'player is' : 'players are'} entered.`
              : 'No rounds posted yet.'}
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-border-subtle">
          {standings.map((s) => {
            const played = Math.min(s.roundsCompleted, numRounds);
            return (
              <li key={s.playerId} className="flex min-h-11 items-center gap-3 py-1.5">
                <Avatar name={s.playerName} identityKey={s.playerId} tone="identity" size="xs" decorative />
                <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {s.playerName}
                </span>
                <span aria-hidden className="flex shrink-0 items-center gap-1">
                  {Array.from({ length: numRounds }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        i < played ? 'bg-text-primary' : '[box-shadow:inset_0_0_0_1.5px_var(--fw-color-border-strong)]',
                      )}
                    />
                  ))}
                </span>
                <span aria-hidden className="w-7 shrink-0 text-right font-fw-sans text-caption tabular-nums text-text-secondary">
                  {played}/{numRounds}
                </span>
                <span className="sr-only">
                  {played} of {numRounds} {numRounds === 1 ? 'round' : 'rounds'} played
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Round-by-round — coach-only. Below `md` card rows (player + per-round
 * chips + total/to-par), from `md` a table. Positions are the same golf
 * standings as the board (shared to-par shares the position).
 * ──────────────────────────────────────────────────────────────────────── */

function RoundByRoundCard({
  status,
  breakdown,
  maxRoundNumber,
  feedHasScores,
  className,
}: {
  status: string;
  breakdown: [string, PlayerBreakdown][];
  maxRoundNumber: number;
  /** The board shows scores (live feed), whatever the round cards say. */
  feedHasScores: boolean;
  className?: string;
}) {
  // FIX the all-dash bug: only "has rounds" when a real completed round exists.
  const hasAnyCompletedRound = maxRoundNumber > 0 && breakdown.some(([, data]) => data.rounds.length > 0);

  return (
    <Surface aria-label="Round-by-round scores" className={className}>
      <Surface.Header
        title={
          <h2 className="inline-flex items-center gap-2 font-fw-sans text-h3 text-text-primary">
            <ChartNoAxesColumn className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            Round-by-round
          </h2>
        }
      />
      <Surface.Body>
        {hasAnyCompletedRound ? (
          <RoundBreakdownTable breakdown={breakdown} maxRoundNumber={maxRoundNumber} />
        ) : feedHasScores ? (
          // The board has totals but no round cards are linked (scores were
          // keyed straight onto the entries): say so, rather than claim no
          // rounds exist under a scored leaderboard.
          <EmptyState
            variant="subtle"
            icon={ChartNoAxesColumn}
            title="No per-round breakdown"
            description="Scores were entered without linked rounds, so there are no round cards to split by round."
          />
        ) : status === 'completed' ? (
          // #91 — a completed qualifier with zero rounds is CLOSED, not "yet to happen".
          <EmptyState
            variant="subtle"
            icon={ChartNoAxesColumn}
            title="Completed: no rounds were recorded"
            description="This qualifier closed before any per-round scores were posted."
          />
        ) : (
          <EmptyState
            variant="subtle"
            icon={ChartNoAxesColumn}
            title="No rounds submitted yet"
            description="Per-round scores appear here once players post their qualifier rounds."
          />
        )}
      </Surface.Body>
    </Surface>
  );
}

function RoundBreakdownTable({
  breakdown,
  maxRoundNumber,
}: {
  breakdown: [string, PlayerBreakdown][];
  maxRoundNumber: number;
}) {
  const roundColumns = Array.from({ length: maxRoundNumber }, (_, i) => i + 1);

  // Golf standings over the breakdown, computed once so the phone list and
  // the table read identical positions.
  const standings = deriveStandings(
    breakdown.map(([playerId, data]) => ({
      player_id: playerId,
      player_name: data.playerName,
      rounds_completed: data.rounds.length,
      total_score: data.totalScore,
      total_to_par: data.totalToPar,
    })),
  );
  const byId = new Map(breakdown);
  const rows = standings.flatMap((s) => {
    const data = byId.get(s.playerId);
    return data ? [{ playerId: s.playerId, standing: s, data }] : [];
  });

  return (
    <>
      {/* Phone — card rows: player + per-round chips + total (Rule 8) */}
      <ul className="divide-y divide-border-subtle md:hidden">
        {rows.map(({ playerId, standing, data }) => {
          const hasRounds = data.rounds.length > 0;
          return (
            <li key={playerId} className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'w-7 shrink-0 text-right font-fw-sans text-body-sm tabular-nums',
                      standing.position === 1 ? 'font-semibold text-text-primary' : 'text-text-tertiary',
                    )}
                  >
                    {positionLabel(standing)}
                  </span>
                  <Link
                    href={`/golf/dashboard/stats?player=${playerId}`}
                    className="min-w-0 flex-1 truncate rounded-fw-sm font-fw-sans text-body font-medium text-text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {data.playerName}
                  </Link>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-fw-sans text-body font-semibold tabular-nums text-text-primary">
                    {hasRounds ? data.totalScore : '—'}
                  </p>
                  <p className={cn('font-fw-sans text-caption tabular-nums', hasRounds ? toParTone(data.totalToPar) : 'text-text-tertiary')}>
                    {hasRounds ? formatToPar(data.totalToPar) : '—'}
                  </p>
                </div>
              </div>

              {hasRounds ? (
                <div className="flex flex-wrap gap-1.5">
                  {roundColumns.map((n) => {
                    const round = data.rounds.find((r) => r.roundNumber === n);
                    if (!round) return null;
                    return (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 rounded-fw-sm bg-surface-sunken px-2 py-1 font-fw-sans text-caption tabular-nums"
                      >
                        <span className="text-text-tertiary">R{n}</span>
                        <span className="font-medium text-text-primary">{round.score ?? '—'}</span>
                        <span className={toParTone(round.toPar)}>{formatToPar(round.toPar)}</span>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* md+ — the table */}
      <div className="hidden overflow-x-auto overscroll-x-contain md:block">
        <table className="w-full min-w-[480px] border-collapse font-fw-sans text-body">
          <thead>
            <tr className="border-b border-border-strong text-left">
              <th className="w-10 pb-2 pr-3 font-fw-sans text-caption font-semibold text-text-tertiary">Pos</th>
              <th className="pb-2 pr-3 font-fw-sans text-caption font-semibold text-text-tertiary">Player</th>
              {roundColumns.map((n) => (
                <th key={n} className="px-2 pb-2 text-center font-fw-sans text-caption font-semibold text-text-tertiary">
                  R{n}
                </th>
              ))}
              <th className="pb-2 pl-3 text-right font-fw-sans text-caption font-semibold text-text-tertiary">Total</th>
              <th className="pb-2 pl-3 text-right font-fw-sans text-caption font-semibold text-text-tertiary">To par</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ playerId, standing, data }) => {
              const hasRounds = data.rounds.length > 0;
              return (
                <tr key={playerId} className="border-b border-border-subtle last:border-b-0">
                  <td className="py-2.5 pr-3 tabular-nums">
                    <span className={cn(standing.position === 1 ? 'font-semibold text-text-primary' : 'text-text-tertiary')}>
                      {positionLabel(standing)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-text-primary">
                    <Link
                      href={`/golf/dashboard/stats?player=${playerId}`}
                      className="rounded-fw-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {data.playerName}
                    </Link>
                  </td>
                  {roundColumns.map((n) => {
                    const round = data.rounds.find((r) => r.roundNumber === n);
                    return (
                      <td key={n} className="px-2 py-2.5 text-center">
                        {round ? (
                          <div className="flex flex-col items-center">
                            <span className="text-body-sm font-medium tabular-nums text-text-primary">{round.score ?? '—'}</span>
                            <span className={cn('text-caption tabular-nums', toParTone(round.toPar))}>{formatToPar(round.toPar)}</span>
                          </div>
                        ) : (
                          <span className="text-caption text-text-tertiary">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-text-primary">
                    {hasRounds ? data.totalScore : '—'}
                  </td>
                  <td className={cn('py-2.5 pl-3 text-right font-semibold tabular-nums', hasRounds ? toParTone(data.totalToPar) : 'text-text-tertiary')}>
                    {hasRounds ? formatToPar(data.totalToPar) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Selections strip — surfaces the W29 selection_state datum the legacy hides
 * ──────────────────────────────────────────────────────────────────────── */

function SelectionsStrip({
  qualifierId,
  status,
  selectionState,
  selectionSlotsTotal,
  selectionsCount,
  className,
}: {
  qualifierId: string;
  status: string;
  selectionState: string;
  selectionSlotsTotal: number;
  selectionsCount: number;
  className?: string;
}) {
  const notStarted = selectionState === 'open' && selectionsCount === 0;
  const href = `/golf/dashboard/coachhelm/qualifying/${qualifierId}`;

  // #89 — `status` (the play lifecycle) and `selectionState` (the roster
  // workflow) are two independent state machines. Name the mismatch before
  // the coach clicks through, so it never reads as a silent bug.
  const playCompletedSelectionPending = status === 'completed' && selectionState !== 'selected';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Surface aria-label="Selections" elevation="border" className={cn(notStarted && 'bg-surface-sunken')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-tertiary"
            >
              <ListChecks className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-fw-sans text-body font-medium text-text-primary">
                {notStarted ? 'Selections not started' : `${selectionsCount} of ${selectionSlotsTotal} selected`}
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                {notStarted
                  ? 'Open the selection workspace to begin picking qualifiers.'
                  : `Selection state: ${selectionState.replace(/_/g, ' ')}.`}
              </p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={href}>Open selection workspace</Link>
          </Button>
        </div>
      </Surface>
      {playCompletedSelectionPending ? (
        <InlineNotice tone="warning" title="Selection workflow hasn't caught up">
          This qualifier's play status is <strong>Completed</strong>, but the roster selection state is still{' '}
          <strong>{selectionState.replace(/_/g, ' ')}</strong>: these track separately. Open the selection workspace
          to confirm or finalize the travel squad.
        </InlineNotice>
      ) : null}
    </div>
  );
}
