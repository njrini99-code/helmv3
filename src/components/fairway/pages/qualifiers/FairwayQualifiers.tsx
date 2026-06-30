'use client';

/**
 * ============================================================================
 * Fairway · pages/qualifiers · FairwayQualifiers  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/qualifiers
 * route — the team's "lineup decisions" surface. It re-skins the legacy
 * GolfQualifiersPage onto the warm-matte Fairway design system WITHOUT changing
 * the data: the page fetches the SAME `golf_qualifiers` list (verbatim legacy
 * query, filtered by team_id) and passes it through with the resolved role.
 *
 * ── ROLE FORK (the ONLY thing role changes) ────────────────────────────────
 *   Coaches and players see the SAME qualifier list and the SAME cards. Role
 *   ONLY toggles (1) the coach-only "Create Qualifier" CTA (masthead + empty
 *   state) and (2) the empty / subtitle copy. Cards link to /qualifiers/[id]
 *   for both. The player sibling route (/my-qualifiers) is separate + out of
 *   scope.
 *
 * ── MENTAL-MODEL ORDER (triage → is-it-working → what's-next) ───────────────
 *   1. HERO  — the single active/upcoming qualifier as a focal Card at top.
 *   2. ACTIVE — upcoming / in_progress qualifiers as a matte Surface/Card list.
 *   3. CONCLUDED — completed qualifiers; honest `subtle` EmptyState when none
 *      (NEVER fabricate a past event).
 *
 * ── CRITICAL HONESTY ────────────────────────────────────────────────────────
 *   The legacy time-based "progress" bar is DROPPED entirely — it implied play
 *   that hasn't happened. No fabricated "entered" counts are shown (there is no
 *   real golf_qualifier_entries count query in this view). Numbers tabular-nums.
 *
 * Tokens ONLY (cream-not-white, SF-not-serif): bg-canvas/surface/sunken,
 * text-text-*, font-fw-display/sans, rounded-card, shadow-soft/flat,
 * bg-accent-*, border-border-subtle. No glass / backdrop-blur / emoji dots.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * qualifiers/page.tsx (by DIRECT PATH). Renders inside the `.fairway-ds` scope
 * on a `bg-canvas` page.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  ViewHeader,
  Surface,
  StatusPill,
  Button,
  EmptyState,
  FilterPill,
  SearchField,
  type FwStatusTone,
} from '@/components/fairway';
import { IconCalendar, IconMapPin, IconGolf, IconArrowRight, IconPlus } from '@/components/icons';
import type { GolfQualifier } from '@/lib/types/golf';

const CREATE_HREF = '/golf/dashboard/qualifiers/create';
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

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the page resolves role + fetches the SAME golf_qualifiers list and
 * passes it straight through. No data work happens in here.
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayQualifiersProps {
  /** Whether the current viewer is a coach (gates the Create CTA + copy only). */
  isCoach: boolean;
  /** The team's qualifiers (legacy query verbatim: team_id, start_date desc). */
  qualifiers: GolfQualifier[];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Status → Fairway StatusPill config. Token tones only (accent for live /
 * upcoming, neutral for completed). `pulse` is the calm "live" ping (it honors
 * reduced-motion inside StatusPill) — never animate-pulse glass.
 * ────────────────────────────────────────────────────────────────────────── */
function statusConfig(status: string): { tone: FwStatusTone; label: string; pulse: boolean } {
  switch (status) {
    case 'in_progress':
      return { tone: 'accent', label: 'Live', pulse: true };
    case 'completed':
      return { tone: 'neutral', label: 'Completed', pulse: false };
    case 'upcoming':
      return { tone: 'accent', label: 'Upcoming', pulse: false };
    default:
      return { tone: 'neutral', label: status.replace(/_/g, ' '), pulse: false };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  const activeCount = allActive.length;
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
    if (active.length === 0) return null;
    const live = active.find((q) => q.status === 'in_progress');
    if (live) return live;
    // No live qualifier — choose the upcoming with the minimum start_date.
    return active.reduce((soonest, q) =>
      new Date(q.start_date).getTime() < new Date(soonest.start_date).getTime() ? q : soonest,
    );
  }, [active]);
  // Everything else in the active bucket renders in the "Active" list below the
  // hero — keep the original start_date-desc order for the remainder.
  const restActive = useMemo(
    () => (hero ? active.filter((q) => q.id !== hero.id) : active),
    [hero, active],
  );

  // The ONE coach-only primary action — a Button wrapping next/link (asChild).
  const createCta = isCoach ? (
    <Button variant="primary" asChild>
      <Link href={CREATE_HREF}>
        <IconPlus size={16} />
        <span>Create qualifier</span>
      </Link>
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
                    <Link href={CREATE_HREF}>
                      <IconPlus size={16} />
                      <span>Create qualifier</span>
                    </Link>
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
              {hero && <QualifierHero qualifier={hero} />}

              {/* ── 2 · ACTIVE — remaining upcoming / in_progress qualifiers ── */}
              {restActive.length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Active</SectionHeading>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {restActive.map((q) => (
                      <QualifierCard key={q.id} qualifier={q} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── 3 · CONCLUDED — bounded; honest-empty when none ─────────── */}
              {showConcludedBucket && (
                <section className="flex flex-col gap-3">
                  <SectionHeading>Concluded</SectionHeading>
                  {concluded.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
 * Section heading — quiet uppercase overline (matches the stats-page sections).
 * ────────────────────────────────────────────────────────────────────────── */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </h3>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Shared detail rows (dates · course · spots). tabular-nums on the dates/spots.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierMeta({ qualifier }: { qualifier: GolfQualifier }) {
  const { start_date, end_date, course_name, spots_available } = qualifier;
  const hasEnd = end_date && end_date !== start_date;

  return (
    <div className="grid grid-cols-1 gap-2 font-fw-sans text-body-sm text-text-secondary sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <IconCalendar size={15} className="flex-shrink-0 text-text-tertiary" />
        <span className="tabular-nums">
          {formatDate(start_date)}
          {hasEnd ? <> &ndash; {formatDate(end_date as string)}</> : null}
        </span>
      </div>

      {spots_available != null && (
        <div className="flex items-center gap-2">
          <IconGolf size={15} className="flex-shrink-0 text-text-tertiary" />
          <span className="tabular-nums">
            {spots_available} {spots_available === 1 ? 'spot' : 'spots'}
          </span>
        </div>
      )}

      {course_name && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <IconMapPin size={15} className="flex-shrink-0 text-text-tertiary" />
          <span className="truncate">{course_name}</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * HERO — the focal active/upcoming qualifier. A soft-lit shadow Surface (the
 * ONE hero), interactive, linking to its leaderboard/detail with a quiet CTA.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierHero({ qualifier }: { qualifier: GolfQualifier }) {
  const status = qualifier.status ?? 'upcoming';
  const cfg = statusConfig(status);

  return (
    <Surface
      as={Link}
      // Surface spreads unknown props (incl. `href`) onto the `as` element; the
      // base SurfaceProps type doesn't model element-specific attrs.
      {...({ href: detailHref(qualifier.id) } as { href: string })}
      interactive
      elevation="shadow"
      padding="lg"
      className="group block"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <StatusPill tone={cfg.tone} pulse={cfg.pulse} size="md">
              {cfg.label}
            </StatusPill>
            <h2 className="font-fw-display text-h2 font-medium tracking-[-0.01em] text-text-primary">
              {qualifier.name}
            </h2>
            {qualifier.description && (
              <p className="max-w-[60ch] font-fw-sans text-body text-text-secondary">
                {qualifier.description}
              </p>
            )}
          </div>
        </div>

        <QualifierMeta qualifier={qualifier} />

        <span className="inline-flex items-center gap-1.5 font-fw-sans text-label font-medium text-accent-700 transition-colors [transition-duration:180ms] group-hover:text-accent-600 motion-reduce:transition-none">
          {ctaLabel(status)}
          <IconArrowRight size={16} className="transition-transform [transition-duration:180ms] group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </div>
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * CARD — a matte list-row qualifier (cream, rounded-card, border at rest; lifts
 * to shadow-raise on hover). Identical for coach + player; links to detail.
 * ────────────────────────────────────────────────────────────────────────── */
function QualifierCard({ qualifier }: { qualifier: GolfQualifier }) {
  const status = qualifier.status ?? 'upcoming';
  const cfg = statusConfig(status);

  return (
    <Surface
      as={Link}
      // Surface spreads unknown props (incl. `href`) onto the `as` element; the
      // base SurfaceProps type doesn't model element-specific attrs.
      {...({ href: detailHref(qualifier.id) } as { href: string })}
      interactive
      elevation="border"
      padding="md"
      className="group flex h-full flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate font-fw-sans text-body-lg font-medium text-text-primary transition-colors [transition-duration:180ms] group-hover:text-accent-700 motion-reduce:transition-none">
            {qualifier.name}
          </h3>
          {qualifier.description && (
            <p className="line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">
              {qualifier.description}
            </p>
          )}
        </div>
        <StatusPill tone={cfg.tone} pulse={cfg.pulse} size="sm" className="flex-shrink-0">
          {cfg.label}
        </StatusPill>
      </div>

      <QualifierMeta qualifier={qualifier} />

      <span className="mt-auto inline-flex items-center gap-1.5 font-fw-sans text-label font-medium text-text-tertiary transition-colors [transition-duration:180ms] group-hover:text-accent-700 motion-reduce:transition-none">
        {ctaLabel(status)}
        <IconArrowRight size={15} className="transition-transform [transition-duration:180ms] group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Surface>
  );
}

export default FairwayQualifiers;
