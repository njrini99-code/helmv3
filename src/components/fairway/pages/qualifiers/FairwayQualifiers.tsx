'use client';

/**
 * ============================================================================
 * Fairway · pages/qualifiers · FairwayQualifiers
 * ----------------------------------------------------------------------------
 * The shared coach + player /golf/dashboard/qualifiers list: the team's
 * "lineup decisions". The page passes the team's golf_qualifiers rows (legacy
 * query: team_id, not test, start_date desc) and the viewer's role; the list
 * itself fetches only the hero's live standings.
 *
 * ── Role ───────────────────────────────────────────────────────────────────
 *   Coaches and players see the same qualifiers and the same cards. Role
 *   changes the coach-only "Create qualifier" action (masthead and empty
 *   state), the copy, and the hero's action style: a coach's one green action
 *   is Create qualifier, so the hero's reads secondary; with no Create action,
 *   a player's hero action is the page's primary.
 *
 * ── Order ──────────────────────────────────────────────────────────────────
 *   1. HERO — the live qualifier, else the next one to start. Its sunken well
 *      reads the same feed as the detail page's board (useQualifierRealtime →
 *      deriveStandings / fieldProgress): where the rounds stand, scorecards
 *      in, and the top of the board, or the entered field before anyone has
 *      scored. "Next round" is progressHeadline only: qualifier rounds carry
 *      no dates, so none are invented. The hero is keyed by qualifier id, so
 *      a search that changes the hero remounts the feed instead of painting
 *      the last qualifier's players under the new name.
 *   2. ACTIVE — the other upcoming / live qualifiers.
 *   3. CONCLUDED — completed qualifiers, newest first, in pages of 12; an
 *      honest subtle EmptyState when there are none.
 *
 * ── Contrast without green ─────────────────────────────────────────────────
 *   Hierarchy comes from the type scale (label-over-value facts, a strong
 *   title), surface steps (the shadow hero card, its sunken well, sunken card
 *   footers) and hairlines. Green is the primary action, the Live pill and an
 *   under-par score only.
 *
 * ── One link per card ──────────────────────────────────────────────────────
 *   A card's title is its only link, stretched over the card by an ::after
 *   overlay (the FairwayDocuments pattern): the whole card is the target, the
 *   link's name is the qualifier's name, and nothing interactive nests inside
 *   a link. The "View leaderboard" affordance is decorative and follows the
 *   card's hover.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import {
  ViewHeader,
  Surface,
  StatusPill,
  Button,
  EmptyState,
  FilterPill,
  SearchField,
  Avatar,
  AvatarGroup,
  Skeleton,
} from '@/components/fairway';
import { IconArrowRight, IconPlus } from '@/components/icons';
import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { formatToPar } from '@/lib/golf/format-to-par';
import { isPlausibleQualifierDate } from '@/lib/golf/qualifier-date';
import type { GolfQualifier } from '@/lib/types/golf';
import { cn } from '@/lib/utils';

import { QualifierRoundSegments } from './QualifierRoundSegments';
import {
  deriveStandings,
  fieldProgress,
  positionLabel,
  progressHeadline,
  qualifierDisplayName,
  toParTone,
  type Standing,
} from './qualifier-display';
import { qualifierStatusMeta } from './qualifier-status';

const CREATE_HREF = '/golf/dashboard/qualifiers/new';
const detailHref = (id: string) => `/golf/dashboard/qualifiers/${id}`;

/** Status segments for the filter row. */
type StatusFilter = 'all' | 'active' | 'concluded';

/**
 * P328: bound the concluded list so a multi-season history never renders as an
 * unbounded wall. We show the newest N and reveal the rest in pages on demand,
 * keeping the page scannable while respecting the PostgREST 1000-row server cap
 * the page query is limited to.
 */
const CONCLUDED_PAGE_SIZE = 12;

/** Players the hero's well names before "+N more on the board". */
const HERO_TOP = 3;

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the page resolves role + fetches the SAME golf_qualifiers list and
 * passes it straight through.
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayQualifiersProps {
  /** Whether the current viewer is a coach (gates the Create CTA + copy only). */
  isCoach: boolean;
  /** The team's qualifiers (legacy query verbatim: team_id, start_date desc). */
  qualifiers: GolfQualifier[];
}

/** A bare ISO date ("YYYY-MM-DD") at local midnight; null when malformed. */
function parseLocalDate(dateStr: string): Date | null {
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Format a bare ISO date ("YYYY-MM-DD") for display. Parsed as **local**
 * midnight, not `new Date(dateStr)` — that treats a date-only string as UTC
 * midnight, so a timezone behind UTC (any US zone) reads it back as the PRIOR
 * calendar day, and server (UTC) vs. client (local) render two different
 * calendar days for the same value — a hydration mismatch (#30/#126). Matches
 * `FairwayMyQualifiers.tsx` / `FairwayQualifierDetail.tsx`'s local-safe parse
 * so a qualifier's date agrees across every surface it's shown on.
 */
export function formatDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * A qualifier's dates, as short as they stay unambiguous: "Aug 7, 2026",
 * "Sep 25–29, 2026", "Sep 29 – Oct 2, 2026", "Dec 30, 2026 – Jan 2, 2027".
 * Same local-midnight parse as `formatDate`; an end before the start (bad
 * data) prints both dates in full rather than a backwards range.
 */
export function formatDateRange(start: string, end: string | null | undefined): string {
  const from = parseLocalDate(start);
  const to = end && end !== start ? parseLocalDate(end) : null;
  if (!from || !to) return formatDate(start);
  if (from.getFullYear() !== to.getFullYear() || to.getTime() < from.getTime()) {
    return `${formatDate(start)} – ${formatDate(end as string)}`;
  }
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const year = from.getFullYear();
  if (from.getMonth() === to.getMonth()) return `${month(from)} ${from.getDate()}–${to.getDate()}, ${year}`;
  return `${month(from)} ${from.getDate()} – ${month(to)} ${to.getDate()}, ${year}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Status → CTA label (P333). An 'Upcoming' qualifier has zero rounds, so the
 * detail shows an "Awaiting first round" empty state — "View leaderboard"
 * over-promises. Match the label to what the detail page will actually show:
 *   upcoming    → "View details"
 *   in_progress → "View leaderboard"
 *   completed   → "View results"
 * ────────────────────────────────────────────────────────────────────────── */
function ctaLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'View leaderboard';
    case 'completed':
      return 'View results';
    default:
      // 'upcoming' and any unknown/pre-start status — no leaderboard yet.
      return 'View details';
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */
export function FairwayQualifiers({ isCoach, qualifiers }: FairwayQualifiersProps) {
  // ── Filter + search state (P328) ──────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [concludedVisible, setConcludedVisible] = useState(CONCLUDED_PAGE_SIZE);

  const isActiveStatus = (q: GolfQualifier) =>
    (q.status ?? 'upcoming') === 'upcoming' || q.status === 'in_progress';

  // Unfiltered buckets — drive the HONEST total counts on the filter pills.
  const allActive = useMemo(() => qualifiers.filter(isActiveStatus), [qualifiers]);
  const allConcluded = useMemo(
    () => qualifiers.filter((q) => q.status === 'completed'),
    [qualifiers],
  );
  // NUMC-07: a qualifier with an impossible start date (prod has year 60824)
  // stays listed so it can be fixed, but never counts as active or becomes
  // the hero.
  const activeCount = allActive.filter((q) => isPlausibleQualifierDate(q.start_date)).length;
  const concludedCount = allConcluded.length;

  // Name/description search (P328) — applied to BOTH buckets.
  const matchesQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (qualifier: GolfQualifier) => {
      if (!q) return true;
      const haystack = `${qualifier.name ?? ''} ${qualifier.description ?? ''} ${
        qualifier.course_name ?? ''
      }`.toLowerCase();
      return haystack.includes(q);
    };
  }, [query]);

  const showActiveBucket = statusFilter === 'all' || statusFilter === 'active';
  const showConcludedBucket = statusFilter === 'all' || statusFilter === 'concluded';

  const active = useMemo(
    () => (showActiveBucket ? allActive.filter(matchesQuery) : []),
    [showActiveBucket, allActive, matchesQuery],
  );
  const concluded = useMemo(
    () => (showConcludedBucket ? allConcluded.filter(matchesQuery) : []),
    [showConcludedBucket, allConcluded, matchesQuery],
  );

  const isFiltering = statusFilter !== 'all' || query.trim().length > 0;
  // Bounded concluded render — newest N (the list arrives start_date-desc).
  const concludedShown = concluded.slice(0, concludedVisible);
  const concludedRemaining = concluded.length - concludedShown.length;

  // The HERO is the single most-relevant active/upcoming qualifier (P327). The
  // `active` bucket arrives start_date-DESC, so `active[0]` would be the qualifier
  // starting FURTHEST in the future — the opposite of "focal". Re-derive instead:
  // prefer a live (in_progress) qualifier, else the upcoming one with the SOONEST
  // start_date (the next one to play). Ties on start_date keep list order (stable).
  const hero = useMemo(() => {
    const candidates = active.filter((q) => isPlausibleQualifierDate(q.start_date));
    if (candidates.length === 0) return null;
    const live = candidates.find((q) => q.status === 'in_progress');
    if (live) return live;
    // No live qualifier — choose the upcoming with the minimum start_date.
    return candidates.reduce((soonest, q) =>
      new Date(q.start_date).getTime() < new Date(soonest.start_date).getTime() ? q : soonest,
    );
  }, [active]);
  // Everything else in the active bucket renders in the "Active" list below the
  // hero — keep the original start_date-desc order for the remainder.
  const restActive = useMemo(
    () => (hero ? active.filter((q) => q.id !== hero.id) : active),
    [hero, active],
  );

  // The ONE coach-only primary action. This deliberately remains a document
  // navigation: the coach dashboard's streamed data can keep a soft transition
  // pending, whereas the qualifier builder is immediately available on a full
  // request. A real anchor preserves normal modified-click behavior as well.
  const createCta = isCoach ? (
    <Button variant="primary" asChild>
      <a href={CREATE_HREF}>
        <IconPlus size={16} />
        <span>Create qualifier</span>
      </a>
    </Button>
  ) : undefined;

  // Honest count chips — rendered ONLY when > 0 (never a fake "0 active").
  const meta =
    activeCount > 0 || concludedCount > 0 ? (
      <>
        {activeCount > 0 && (
          <span className="tabular-nums">
            {activeCount} active
          </span>
        )}
        {activeCount > 0 && concludedCount > 0 && (
          <span aria-hidden="true">·</span>
        )}
        {concludedCount > 0 && (
          <span className="tabular-nums">
            {concludedCount} concluded
          </span>
        )}
      </>
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* ── ONE MASTHEAD ─────────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow="Qualifiers"
        title="Lineup decisions."
        description={
          isCoach
            ? 'Run head-to-head qualifiers to decide who plays this week.'
            : 'Qualifiers your coach posts will appear here.'
        }
        meta={meta}
        primaryAction={createCta}
      />

      {qualifiers.length === 0 ? (
        // ── FULL-EMPTY — no qualifiers at all (handled; not the demo) ─────────
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              title="No qualifiers yet"
              description={
                isCoach
                  ? 'Create a qualifier to run a head-to-head and decide who plays this week.'
                  : 'No qualifiers have been posted by your coach yet.'
              }
              action={
                isCoach ? (
                  <Button variant="primary" asChild>
                    <a href={CREATE_HREF}>
                      <IconPlus size={16} />
                      <span>Create qualifier</span>
                    </a>
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {/* ── TOOLBAR (P328) — status filter + name search ─────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter qualifiers by status">
              <FilterPill
                selected={statusFilter === 'all'}
                showCheck={false}
                count={qualifiers.length}
                onClick={() => setStatusFilter('all')}
              >
                All
              </FilterPill>
              <FilterPill
                selected={statusFilter === 'active'}
                showCheck={false}
                count={activeCount}
                onClick={() => setStatusFilter('active')}
              >
                Active
              </FilterPill>
              <FilterPill
                selected={statusFilter === 'concluded'}
                showCheck={false}
                count={concludedCount}
                onClick={() => setStatusFilter('concluded')}
              >
                Concluded
              </FilterPill>
            </div>
            <div className="max-w-md">
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search qualifiers by name, course, or detail"
                aria-label="Search qualifiers"
              />
            </div>
          </div>

          {active.length === 0 && concluded.length === 0 ? (
            // ── NO MATCHES — search/filter narrowed everything away ───────────
            <Surface elevation="border" padding="lg">
              <EmptyState
                variant="subtle"
                title="No qualifiers match your filters"
                description="Try a different search term or clear the status filter."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStatusFilter('all');
                      setQuery('');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-10">
              {/* ── 1 · HERO — the single focal active/upcoming qualifier ────── */}
              {hero && <QualifierHero key={hero.id} qualifier={hero} isCoach={isCoach} />}

              {/* ── 2 · ACTIVE — remaining upcoming / in_progress qualifiers ── */}
              {restActive.length > 0 && (
                <section className="flex flex-col gap-4">
                  <SectionHeading>Active</SectionHeading>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {restActive.map((q) => (
                      <QualifierCard key={q.id} qualifier={q} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── 3 · CONCLUDED — bounded; honest-empty when none ─────────── */}
              {showConcludedBucket && (
                <section className="flex flex-col gap-4">
                  <SectionHeading>Concluded</SectionHeading>
                  {concluded.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {concludedShown.map((q) => (
                          <QualifierCard key={q.id} qualifier={q} />
                        ))}
                      </div>
                      {concludedRemaining > 0 && (
                        <div className="flex justify-center pt-1">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setConcludedVisible((n) => n + CONCLUDED_PAGE_SIZE)
                            }
                          >
                            Show {Math.min(CONCLUDED_PAGE_SIZE, concludedRemaining)} more
                            <span className="ml-1 tabular-nums text-text-tertiary">
                              ({concludedRemaining} remaining)
                            </span>
                          </Button>
                        </div>
                      )}
                    </>
                  ) : isFiltering ? null : (
                    <Surface elevation="border" padding="none">
                      <EmptyState
                        variant="subtle"
                        title="No concluded qualifiers yet"
                        description="Qualifiers move here once they're completed."
                      />
                    </Surface>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Section heading — a strong label with a hairline running out to the edge.
 * ────────────────────────────────────────────────────────────────────────── */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <h2 className="font-fw-sans text-body font-semibold text-text-primary">{children}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * The card's one link — its title, stretched over the card by an ::after
 * overlay. The card is the positioned ancestor (Surface is `relative`) and
 * nothing between them is positioned. The overlay sits above the card's
 * positioned children (pills, avatars, the decorative CTA), so every click
 * lands on the link; the focus ring is drawn inset on the overlay so the
 * card's overflow clip cannot cut it.
 * ────────────────────────────────────────────────────────────────────────── */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="outline-none after:absolute after:inset-0 after:z-[1] after:rounded-card after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-border-focus"
    >
      {children}
    </Link>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Facts — label over value: dates, rounds, spots, course.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierFacts({ qualifier, className }: { qualifier: GolfQualifier; className?: string }) {
  const { start_date, end_date, num_rounds, spots_available, course_name } = qualifier;
  const oneDay = !end_date || end_date === start_date;
  const facts: Array<{ label: string; value: string; grow?: boolean }> = [
    { label: oneDay ? 'Date' : 'Dates', value: formatDateRange(start_date, end_date) },
    { label: 'Rounds', value: String(num_rounds) },
  ];
  if (spots_available != null) facts.push({ label: 'Spots', value: String(spots_available) });
  if (course_name) facts.push({ label: 'Course', value: course_name, grow: true });

  return (
    <dl className={cn('flex flex-wrap gap-x-6 gap-y-3 font-fw-sans', className)}>
      {facts.map((fact) => (
        <div
          key={fact.label}
          className={cn('min-w-0', fact.grow && 'basis-full sm:basis-auto sm:flex-1')}
        >
          <dt className="text-caption text-text-tertiary">{fact.label}</dt>
          <dd className="mt-0.5 truncate text-body-sm font-semibold tabular-nums text-text-primary">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * HERO — the focal qualifier: who it is and its facts on the card, where it
 * stands in a sunken well beside them (from xl; stacked below), and the
 * decorative action at the foot of the text column.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierHero({ qualifier, isCoach }: { qualifier: GolfQualifier; isCoach: boolean }) {
  const status = qualifier.status ?? 'upcoming';
  const cfg = qualifierStatusMeta(status);

  return (
    <Surface
      elevation="shadow"
      padding="none"
      interactive
      className="group overflow-hidden"
      data-testid="qualifier-hero"
    >
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-rows-[1fr_auto] xl:gap-x-10 xl:p-8">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <StatusPill tone={cfg.tone} pulse={cfg.pulse} size="md">
            {cfg.label}
          </StatusPill>
          <h2 className="mt-3 font-fw-display text-h2 text-text-primary [text-wrap:balance]">
            <CardLink href={detailHref(qualifier.id)}>{qualifierDisplayName(qualifier.name)}</CardLink>
          </h2>
          {qualifier.description ? (
            <p className="mt-2 line-clamp-2 max-w-[60ch] font-fw-sans text-body text-text-secondary">
              {qualifier.description}
            </p>
          ) : null}
          <QualifierFacts qualifier={qualifier} className="mt-5 border-t border-border-subtle pt-4" />
        </div>

        <HeroStanding
          qualifierId={qualifier.id}
          status={status}
          numRounds={qualifier.num_rounds}
          className="xl:col-start-2 xl:row-span-2 xl:row-start-1"
        />

        <div className="xl:col-start-1 xl:row-start-2 xl:self-end">
          <Button
            asChild
            variant={isCoach ? 'secondary' : 'primary'}
            className={cn(
              'w-full sm:w-auto',
              isCoach
                ? 'group-hover:border-border-strong group-hover:bg-surface-tint'
                : 'group-hover:bg-accent-fill-hover',
            )}
          >
            <span aria-hidden="true" data-testid="qualifier-hero-cta">
              {ctaLabel(status)}
              <IconArrowRight
                size={16}
                className="transition-transform [transition-duration:180ms] group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
          </Button>
        </div>
      </div>
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * The hero's well — where it stands, from the live feed. Progress on top,
 * then the top of the board (or the entered field before anyone has scored).
 * Side by side inside the well on a tablet or laptop, where the well runs the
 * card's full width; stacked on a phone and in the xl rail.
 * ────────────────────────────────────────────────────────────────────────── */
function HeroStanding({
  qualifierId,
  status,
  numRounds,
  className,
}: {
  qualifierId: string;
  status: string;
  numRounds: number;
  className?: string;
}) {
  const { leaderboard, loading, error } = useQualifierRealtime(qualifierId);
  // A refetch keeps the rows it has; only the first load shows the skeleton.
  const ready = !(loading && leaderboard.length === 0);
  const standings = useMemo(() => (ready ? deriveStandings(leaderboard) : null), [ready, leaderboard]);
  const failed = Boolean(error) && leaderboard.length === 0;
  const rounds = Math.max(1, numRounds);
  const progress = standings ? fieldProgress(standings, rounds) : null;

  return (
    <section
      aria-label="Where it stands"
      className={cn('min-w-0 rounded-fw-md bg-surface-sunken p-4 sm:p-5', className)}
    >
      {failed ? (
        <p className="font-fw-sans text-body-sm text-text-secondary">
          Live standings could not load. The leaderboard has the latest.
        </p>
      ) : (
        <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-x-8 xl:flex">
          <div className="min-w-0">
            {progress ? (
              <p className="font-fw-sans text-h3 text-text-primary">{progressHeadline(progress, status)}</p>
            ) : (
              <Skeleton className="h-6 w-44" />
            )}
            <QualifierRoundSegments
              perRound={progress?.perRound ?? null}
              numRounds={rounds}
              entrants={progress?.entrants ?? 0}
              track="surface"
            />
            {!progress ? (
              <Skeleton className="mt-3 h-5 w-40" />
            ) : progress.entrants > 0 ? (
              <p
                className="mt-3 flex items-baseline gap-1.5 font-fw-sans tabular-nums"
                data-testid="hero-cards-in"
              >
                <span className="text-h3 text-text-primary">{progress.cardsIn}</span>{' '}
                <span className="text-body-sm text-text-secondary">of {progress.cardsTotal} scorecards in</span>
              </p>
            ) : null}
          </div>

          <div className="min-w-0 border-t border-border-subtle pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0 xl:border-l-0 xl:border-t xl:pl-0 xl:pt-4">
            {!standings ? (
              <BoardSkeleton />
            ) : standings.some((s) => s.hasScore) ? (
              <TopOfBoard standings={standings} />
            ) : (
              <EnteredField standings={standings} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The first three places, then how many more are on the board. */
function TopOfBoard({ standings }: { standings: Standing[] }) {
  const top = standings.filter((s) => s.hasScore).slice(0, HERO_TOP);
  const more = standings.length - top.length;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">Top of the board</h3>
        <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          {standings.length} {standings.length === 1 ? 'player' : 'players'}
        </p>
      </div>
      <ol className="mt-1 divide-y divide-border-subtle">
        {top.map((s) => (
          <li key={s.playerId} className="flex min-h-12 items-center gap-3 py-2">
            <span className="w-7 shrink-0 font-fw-sans text-body-sm font-semibold tabular-nums text-text-secondary">
              {positionLabel(s)}
            </span>
            <Avatar name={s.playerName} identityKey={s.playerId} tone="identity" size="sm" decorative />
            <span className="min-w-0 flex-1 truncate font-fw-sans text-body font-medium text-text-primary">
              {s.playerName}
            </span>
            <span className={cn('shrink-0 font-fw-sans text-h3 tabular-nums', toParTone(s.totalToPar))}>
              {formatToPar(s.totalToPar)}
            </span>
          </li>
        ))}
      </ol>
      {more > 0 ? (
        <p className="mt-1.5 font-fw-sans text-caption tabular-nums text-text-secondary">
          +{more} more on the board
        </p>
      ) : null}
    </>
  );
}

/** Before anyone has scored: who is in the field, and when scores arrive. */
function EnteredField({ standings }: { standings: Standing[] }) {
  const count = standings.length;
  return (
    <>
      <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">The field</h3>
      {count === 0 ? (
        <p className="mt-1.5 font-fw-sans text-body-sm text-text-secondary">No players entered yet.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div aria-hidden="true">
              <AvatarGroup size="sm" max={5} ring="ring-surface-sunken">
                {standings.map((s) => (
                  <Avatar
                    key={s.playerId}
                    name={s.playerName}
                    identityKey={s.playerId}
                    tone="identity"
                    size="sm"
                    decorative
                  />
                ))}
              </AvatarGroup>
            </div>
            <p className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
              {count} {count === 1 ? 'player' : 'players'} entered
            </p>
          </div>
          <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">Scores post here once round 1 is in.</p>
        </>
      )}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div>
      <Skeleton className="h-5 w-32" />
      <div className="mt-3 flex flex-col gap-4">
        {Array.from({ length: HERO_TOP }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-5" />
            <Skeleton circle className="h-8 w-8" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * CARD — an active or concluded qualifier: title and status, the description,
 * the facts over a hairline, and a sunken footer carrying the action.
 * Identical for coach + player.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierCard({ qualifier }: { qualifier: GolfQualifier }) {
  const status = qualifier.status ?? 'upcoming';
  const cfg = qualifierStatusMeta(status);

  return (
    <Surface
      elevation="border"
      padding="none"
      interactive
      className="group flex h-full flex-col overflow-hidden"
      data-testid="qualifier-card"
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 min-w-0 font-fw-sans text-body-lg font-semibold text-text-primary">
            <CardLink href={detailHref(qualifier.id)}>{qualifierDisplayName(qualifier.name)}</CardLink>
          </h3>
          <StatusPill tone={cfg.tone} pulse={cfg.pulse} size="sm" className="mt-0.5 flex-shrink-0">
            {cfg.label}
          </StatusPill>
        </div>
        {qualifier.description ? (
          <p className="mt-1.5 line-clamp-2 font-fw-sans text-body-sm text-text-secondary">
            {qualifier.description}
          </p>
        ) : null}
        {/* mt-auto pins the facts to the card's foot; the padding keeps at
            least a 1rem gap under the description in the tallest card. */}
        <div className="mt-auto pt-4">
          <QualifierFacts qualifier={qualifier} className="border-t border-border-subtle pt-4" />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-sunken px-5 py-3 font-fw-sans text-body-sm font-semibold text-text-primary"
      >
        <span>{ctaLabel(status)}</span>
        <IconArrowRight
          size={16}
          className="text-text-secondary transition-[transform,color] [transition-duration:180ms] group-hover:translate-x-0.5 group-hover:text-text-primary motion-reduce:transition-none"
        />
      </div>
    </Surface>
  );
}
