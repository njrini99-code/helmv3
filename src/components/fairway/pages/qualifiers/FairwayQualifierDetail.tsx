'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierDetail — the role-forked Qualifier page
 * ----------------------------------------------------------------------------
 * The redesigned Qualifier Detail surface (DESIGN-SYSTEM §4/§5/§6 + §0 #8). A
 * PRESENTATION + LAYOUT + IA rebuild ONLY: the route page (`[id]/page.tsx`) owns
 * the Supabase select, the per-player round breakdown derivation, the entrant /
 * rounds-submitted counts, and the role + can-play computation — and passes the
 * PRE-COMPUTED data into this component. This component re-skins it onto Fairway
 * tokens; it does NOT fetch, mutate, or reshape any business logic.
 *
 * ONE masthead (ViewHeader) replaces the legacy MobileNavHeader + PageHeader +
 * `surface-stone` triple-title plinth. ONE hero (the live Leaderboard). ONE
 * primary action, role-forked (player → "Play qualifier round"; coach → the
 * quieter "Manage selections"). Mental-model section order: triage (masthead) →
 * detail → is-it-working (leaderboard) → coach pulse (round-by-round) → what's
 * next (selections).
 *
 * HONEST states (FIX the legacy bugs):
 *   • Round-by-round renders an EmptyState ("No rounds submitted yet") when zero
 *     completed rounds exist — instead of the legacy all-dash 7-row table (the
 *     all-dash bug), and the live Leaderboard (child) shows an "awaiting first
 *     round" EmptyState instead of a bracket printing 'E' for 0-round players.
 *   • No `x/1` rounds fraction (there is no `num_rounds` column) — entrants +
 *     rounds-submitted are shown as plain honest counts.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in the
 * route page. Renders inside the `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import Link from 'next/link';
import { ChartNoAxesColumn, ListChecks, Flag } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  StatusPill,
  EmptyState,
  InlineNotice,
  ViewHeader,
  type FwStatusTone,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { QualifierRoundCourse } from '@/app/golf/actions/golf';

import { FairwayQualifierLeaderboard } from './FairwayQualifierLeaderboard';

/** One round's score within a player's breakdown (shape from the route page). */
interface RoundScore {
  roundNumber: number;
  score: number | null;
  toPar: number | null;
  date: string;
  courseName: string;
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

  // ── Qualifier plinth (real golf_qualifiers columns) ─────────────────────────
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
}

/* ─────────────────────────────────────────────────────────────────────────
 * Date / status formatting (presentation only)
 * ──────────────────────────────────────────────────────────────────────── */

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dateRange(start: string, end: string | null): string {
  const startLabel = formatDate(start);
  if (end && end !== start) return `${startLabel} – ${formatDate(end)}`;
  return startLabel;
}

const STATUS_META: Record<string, { tone: FwStatusTone; label: string }> = {
  upcoming: { tone: 'warning', label: 'Upcoming' },
  in_progress: { tone: 'accent', label: 'In progress' },
  completed: { tone: 'neutral', label: 'Completed' },
};

function statusMeta(status: string): { tone: FwStatusTone; label: string } {
  return STATUS_META[status] ?? { tone: 'neutral', label: status.replace(/_/g, ' ') };
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function toParToneClass(toPar: number | null): string {
  if (toPar === null) return 'text-text-tertiary';
  if (toPar < 0) return 'text-accent-700';
  if (toPar > 0) return 'text-danger';
  return 'text-text-secondary';
}

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
    endDate,
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
  } = props;

  // Feature G — only surface the per-round course list when the qualifier is
  // actually split across multiple rounds AND at least one course is assigned.
  const isMultiRound = numRounds > 1;
  const hasRoundCourses = roundCourses.some(
    (rc) => rc.courseName || rc.courseId,
  );
  const showRoundCourses = isMultiRound && hasRoundCourses;

  const sm = statusMeta(status);
  const backHref = isCoach
    ? '/golf/dashboard/qualifiers'
    : '/golf/dashboard/my-qualifiers';
  const backLabel = isCoach ? 'Qualifiers' : 'My qualifiers';

  // ONE primary action, role-forked — never two.
  // Player (entered + active) → green "Play qualifier round".
  // Coach → quieter "Manage selections" (→ a DIFFERENT route, the W29 workspace).
  let primaryAction: React.ReactNode = null;
  if (isPlayer && canPlayRound) {
    primaryAction = (
      <Button asChild variant="primary" size="md">
        <Link href={`/golf/dashboard/rounds/new?qualifier=${qualifierId}`}>
          Play qualifier round
        </Link>
      </Button>
    );
  } else if (isCoach) {
    primaryAction = (
      <Button asChild variant="secondary" size="md">
        <Link href={`/golf/dashboard/coachhelm/qualifying/${qualifierId}`}>
          Manage selections
        </Link>
      </Button>
    );
  }

  // P326 — no more player dead-end. A player who can't play (not entered, or the
  // qualifier is completed / entries closed) saw a masthead with NO action and NO
  // status telling them why. Give that state an explicit notice + a next step.
  // There is no player self-entry flow (coaches add entrants on create), so the
  // next action is always "contact your coach".
  let playerNotice:
    | { tone: 'info' | 'warning'; title: string; body: string }
    | null = null;
  if (isPlayer && !canPlayRound) {
    if (status === 'completed') {
      playerNotice = {
        tone: 'info',
        title: 'This qualifier is completed',
        body: 'Entries are closed and no further rounds can be posted. Review the final standings below.',
      };
    } else if (entryDeadline && new Date(entryDeadline) < new Date()) {
      playerNotice = {
        tone: 'warning',
        title: 'Entries are closed',
        body: 'The entry deadline has passed. Ask your coach if you can still be added to this qualifier.',
      };
    } else {
      playerNotice = {
        tone: 'warning',
        title: "You're not entered in this qualifier",
        body: "You can follow the standings below, but you can't post a round. Ask your coach to add you to enter.",
      };
    }
  }

  // FIX the all-dash bug: only treat the breakdown as "has rounds" when a real
  // completed round exists (maxRoundNumber > 0 AND a player actually has rounds).
  const hasAnyCompletedRound =
    maxRoundNumber > 0 && breakdown.some(([, data]) => data.rounds.length > 0);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
      {/* Quiet back link — replaces the legacy MobileNavHeader + Breadcrumb */}
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1 font-fw-sans text-caption text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      {/* 1 · ONE masthead — name, status, dates, entrants, course_name */}
      <ViewHeader
        eyebrow="Qualifier"
        title={name}
        primaryAction={primaryAction}
        meta={
          <>
            <StatusPill tone={sm.tone} pulse={sm.tone === 'accent'}>
              {sm.label}
            </StatusPill>
            <span className="tabular-nums">{dateRange(startDate, endDate)}</span>
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

      <div className="mt-8 space-y-8">
        {/* P326 · Player state notice — never a dead-end. Tells a non-entered /
            closed / completed player WHY there's no "Play" action + the next step. */}
        {playerNotice ? (
          <InlineNotice tone={playerNotice.tone} title={playerNotice.title}>
            {playerNotice.body}
          </InlineNotice>
        ) : null}

        {/* 2 · Detail surface — real columns only (dates, deadline, course, spots, rules) */}
        <Surface aria-label="Qualifier details">
          <Surface.Body>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
              <DetailItem label="Dates" value={dateRange(startDate, endDate)} numeric />
              <DetailItem label="Entry deadline" value={formatDate(entryDeadline)} numeric />
              <DetailItem label="Entrants" value={String(entrantCount)} numeric />
              <DetailItem label="Rounds submitted" value={String(roundsSubmitted)} numeric />
              {courseName ? <DetailItem label="Course" value={courseName} /> : null}
              {spotsAvailable !== null ? (
                <DetailItem label="Spots" value={String(spotsAvailable)} numeric />
              ) : null}
            </dl>

            {rules ? (
              <div className="space-y-2">
                <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                  Rules
                </p>
                <Inset padding="md">
                  <p className="whitespace-pre-wrap font-fw-sans text-body text-text-secondary">
                    {rules}
                  </p>
                </Inset>
              </div>
            ) : null}
          </Surface.Body>
        </Surface>

        {/* 2b · Feature G — the course assigned to each round (multi-round only) */}
        {showRoundCourses ? (
          <RoundCoursesSection numRounds={numRounds} roundCourses={roundCourses} />
        ) : null}

        {/* 3 · HERO — the live Leaderboard (honest "awaiting first round" when 0 scored) */}
        <FairwayQualifierLeaderboard
          qualifierId={qualifierId}
          entrantCount={entrantCount}
          selectionSlotsTotal={selectionSlotsTotal}
          selectionSlotsCoachPick={selectionSlotsCoachPick}
        />

        {/* 4 · COACH-only round-by-round breakdown */}
        {isCoach ? (
          <Surface aria-label="Round-by-round scores">
            <Surface.Header
              title={
                <span className="inline-flex items-center gap-2">
                  <ChartNoAxesColumn className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                  Round-by-round
                </span>
              }
            />
            <Surface.Body>
              {hasAnyCompletedRound ? (
                <RoundBreakdownTable breakdown={breakdown} maxRoundNumber={maxRoundNumber} />
              ) : (
                // FIX the all-dash bug: an honest empty state, NOT 7 all-dash rows.
                <EmptyState
                  variant="subtle"
                  icon={ChartNoAxesColumn}
                  title="No rounds submitted yet"
                  description="Per-round scores appear here once players post their qualifier rounds."
                />
              )}
            </Surface.Body>
          </Surface>
        ) : null}

        {/* 5 · COACH-only selections strip — surfaces the W29 selection_state datum */}
        {isCoach ? (
          <SelectionsStrip
            qualifierId={qualifierId}
            selectionState={selectionState}
            selectionSlotsTotal={selectionSlotsTotal}
            selectionsCount={selectionsCount}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Detail item (a single labelled datum in the detail grid)
 * ──────────────────────────────────────────────────────────────────────── */

function DetailItem({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
        {label}
      </dt>
      <dd
        className={cn(
          'font-fw-sans text-body font-medium text-text-primary',
          numeric && 'tabular-nums',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Round-by-round matte table — drops the skeuomorphic surface-matte card chrome
 * ──────────────────────────────────────────────────────────────────────── */

function RoundBreakdownTable({
  breakdown,
  maxRoundNumber,
}: {
  breakdown: [string, PlayerBreakdown][];
  maxRoundNumber: number;
}) {
  const roundColumns = Array.from({ length: maxRoundNumber }, (_, i) => i + 1);
  // Only rank players who actually posted a round (honest position).
  let scoredSeen = 0;

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[480px] border-collapse font-fw-sans text-body">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th className="w-8 pb-2 pr-3 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
              #
            </th>
            <th className="pb-2 pr-3 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
              Player
            </th>
            {roundColumns.map((n) => (
              <th
                key={n}
                className="px-2 pb-2 text-center font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary"
              >
                R{n}
              </th>
            ))}
            <th className="pb-2 pl-3 text-right font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
              Total
            </th>
            <th className="pb-2 pl-3 text-right font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
              To par
            </th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map(([playerId, data]) => {
            const hasRounds = data.rounds.length > 0;
            const position = hasRounds ? ++scoredSeen : null;
            const leader = position === 1;

            return (
              <tr
                key={playerId}
                className={cn(
                  'border-b border-border-subtle last:border-b-0',
                  leader && 'bg-accent-50/60',
                )}
              >
                <td className="py-2.5 pr-3 tabular-nums">
                  <span className={cn(leader ? 'font-medium text-accent-700' : 'text-text-tertiary')}>
                    {position ?? '—'}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 font-medium text-text-primary">
                  {data.playerName}
                </td>
                {roundColumns.map((n) => {
                  const round = data.rounds.find((r) => r.roundNumber === n);
                  return (
                    <td key={n} className="px-2 py-2.5 text-center">
                      {round ? (
                        <div className="flex flex-col items-center">
                          <span className="font-fw-mono text-body-sm font-medium text-text-primary tabular-nums">
                            {round.score ?? '—'}
                          </span>
                          <span className={cn('font-fw-mono text-caption tabular-nums', toParToneClass(round.toPar))}>
                            {formatToPar(round.toPar)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-caption text-text-tertiary">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2.5 pl-3 text-right font-fw-mono font-medium text-text-primary tabular-nums">
                  {hasRounds ? data.totalScore : '—'}
                </td>
                <td
                  className={cn(
                    'py-2.5 pl-3 text-right font-fw-mono font-medium tabular-nums',
                    hasRounds ? toParToneClass(data.totalToPar) : 'text-text-tertiary',
                  )}
                >
                  {hasRounds ? formatToPar(data.totalToPar) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Feature G — per-round course assignment (the venue the coach set for each
 * round). Read-only for both roles; players see WHERE each round is played.
 * ──────────────────────────────────────────────────────────────────────── */

function RoundCoursesSection({
  numRounds,
  roundCourses,
}: {
  numRounds: number;
  roundCourses: QualifierRoundCourse[];
}) {
  // Index assignments by round so we can render a row per declared round
  // (an unassigned round shows an honest "Course not set yet").
  const byRound = new Map<number, QualifierRoundCourse>();
  for (const rc of roundCourses) byRound.set(rc.roundNumber, rc);
  const rows = Array.from({ length: numRounds }, (_, i) => i + 1);

  return (
    <Surface aria-label="Course per round">
      <Surface.Header
        title={
          <span className="inline-flex items-center gap-2">
            <Flag className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            Course per round
          </span>
        }
      />
      <Surface.Body>
        <ul className="divide-y divide-border-subtle">
          {rows.map((roundNumber) => {
            const assigned = byRound.get(roundNumber);
            return (
              <li
                key={roundNumber}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken font-fw-mono text-body-sm font-medium tabular-nums text-text-secondary"
                >
                  {roundNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                    Round {roundNumber}
                  </p>
                  {assigned?.courseName ? (
                    <p className="truncate font-fw-sans text-body font-medium text-text-primary">
                      {assigned.courseName}
                    </p>
                  ) : (
                    <p className="font-fw-sans text-body text-text-tertiary">
                      Course not set yet
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Surface.Body>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Selections strip — surfaces the W29 selection_state datum the legacy hides
 * ──────────────────────────────────────────────────────────────────────── */

function SelectionsStrip({
  qualifierId,
  selectionState,
  selectionSlotsTotal,
  selectionsCount,
}: {
  qualifierId: string;
  selectionState: string;
  selectionSlotsTotal: number;
  selectionsCount: number;
}) {
  const notStarted = selectionState === 'open' && selectionsCount === 0;
  const href = `/golf/dashboard/coachhelm/qualifying/${qualifierId}`;

  return (
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
              {notStarted
                ? 'Selections not started'
                : `${selectionsCount} of ${selectionSlotsTotal} selected`}
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
  );
}
