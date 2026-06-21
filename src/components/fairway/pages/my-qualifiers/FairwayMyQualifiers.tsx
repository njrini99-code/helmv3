'use client';

/**
 * ============================================================================
 * Fairway · pages/my-qualifiers · FairwayMyQualifiers  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the PLAYER /golf/dashboard/my-qualifiers route — the
 * player's own qualifier scorecard. Mirrors the FairwayQualifiers vocabulary
 * (ViewHeader masthead, statusConfig→StatusPill, Surface cards, Active/Concluded
 * buckets with honest-empty) but surfaces the PLAYER'S OWN progress per qualifier
 * (rounds posted, cumulative total + to-par) and the working deep-link CTA to
 * start the next qualifying round.
 *
 * DATA: reuses the PlayerQualifierInfo[] computed verbatim in
 * my-qualifiers/page.tsx (name/courseName/dates/status/roundsCompleted/
 * completedRoundNumbers/totalScore/totalToPar). No data work happens here.
 *
 * HONESTY (DESIGN-SYSTEM §0 #8):
 *   • numRounds is INFERRED (roundsCompleted+1), so we NEVER show a fake "X/N"
 *     denominator — we show "thru R1, R2" from completedRoundNumbers instead.
 *   • A player who hasn't posted a round shows em-dash totals + "Not started",
 *     never "E" / 0.
 *   • Concluded section shows an honest subtle EmptyState; never a fabricated
 *     past qualifier.
 *
 * The "Start qualifying round" CTA deep-links to rounds/new?qualifier=<id> — the
 * already-wired entry path that auto-selects the qualifier + sets round_type.
 *
 * Tokens ONLY: bg-canvas, text-text-*, font-fw-display/sans/mono, rounded-card,
 * shadow-soft, border-border-subtle, tabular-nums. No glass / warm-* / blur.
 * ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flag, AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  StatusPill,
  Button,
  EmptyState,
  type FwStatusTone,
} from '@/components/fairway';
import { IconCalendar, IconMapPin, IconArrowRight, IconGolf } from '@/components/icons';
import type { PlayerQualifierInfo } from '@/app/golf/actions/golf';

const detailHref = (id: string) => `/golf/dashboard/qualifiers/${id}`;
const startRoundHref = (id: string) => `/golf/dashboard/rounds/new?qualifier=${id}`;

export interface FairwayMyQualifiersProps {
  qualifiers: PlayerQualifierInfo[];
  /** Present only on the coach-bounce path. */
  error?: string;
  /**
   * P182: TRUE when the entries fetch actually FAILED (Supabase error), as
   * opposed to the player simply having no qualifiers. A fetch failure must read
   * as a recoverable error ("Couldn't load…" + retry), NOT the cheerful
   * "No qualifiers yet" empty state — a DB hiccup is not the same as "you have
   * none". Mutually exclusive with the happy path; takes precedence over empty.
   */
  loadError?: boolean;
}

function statusConfig(status: string): { tone: FwStatusTone; label: string; pulse: boolean } {
  switch (status) {
    case 'in_progress':
      return { tone: 'accent', label: 'Live', pulse: true };
    case 'completed':
      return { tone: 'neutral', label: 'Completed', pulse: false };
    case 'upcoming':
      // Distinct from the green 'Live' pill so the two lifecycle states are
      // separable without relying on the pulse dot (which vanishes in a
      // grayscale/squint screenshot and under reduced-motion). Matches
      // FairwayQualifierDetail's STATUS_META mapping for 'upcoming'.
      return { tone: 'warning', label: 'Upcoming', pulse: false };
    default:
      return { tone: 'neutral', label: status.replace(/_/g, ' '), pulse: false };
  }
}

/**
 * Format a bare ISO date ("YYYY-MM-DD") for display. We parse it as **local**
 * midnight rather than `new Date(dateStr)` (which treats date-only strings as
 * UTC midnight and reads as the prior calendar day in US timezones).
 */
function formatDate(dateStr: string): string {
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Honest to-par: scored only. null → em-dash. */
function formatToPar(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/**
 * "thru R1, R2" — never a fabricated X/N denominator. For 3+ posted rounds we
 * collapse to "thru R4 (4)" so the 1/3-width cell never wraps/distorts the
 * 3-up score row on the narrowest single-column card.
 */
function thruLabel(rounds: number[]): string {
  if (rounds.length === 0) return 'Not started';
  if (rounds.length > 2) {
    const last = rounds[rounds.length - 1];
    return `thru R${last} (${rounds.length})`;
  }
  return `thru ${rounds.map((n) => `R${n}`).join(', ')}`;
}

export function FairwayMyQualifiers({ qualifiers, error, loadError }: FairwayMyQualifiersProps) {
  const router = useRouter();
  const active = qualifiers.filter(
    (q) => (q.status ?? 'upcoming') === 'upcoming' || q.status === 'in_progress',
  );
  const concluded = qualifiers.filter((q) => q.status === 'completed');
  const activeCount = active.length;
  const concludedCount = concluded.length;

  const meta =
    activeCount > 0 || concludedCount > 0 ? (
      <>
        {activeCount > 0 && <span className="tabular-nums">{activeCount} active</span>}
        {activeCount > 0 && concludedCount > 0 && <span aria-hidden="true">·</span>}
        {concludedCount > 0 && <span className="tabular-nums">{concludedCount} concluded</span>}
      </>
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="My Qualifiers"
        title="Your qualifier scorecard."
        description="Qualifier entries your coach posts appear here — post the rounds, climb the board."
        meta={meta}
      />

      {error ? (
        <div className="mt-8">
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={Flag}
              title="Players only"
              description={error}
              action={
                <Button variant="primary" size="sm" asChild>
                  <Link href="/golf/dashboard/qualifiers">
                    <span>Go to qualifiers</span>
                    <IconArrowRight size={15} />
                  </Link>
                </Button>
              }
            />
          </Surface>
        </div>
      ) : loadError ? (
        <div className="mt-8">
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load your qualifiers"
              description="Something went wrong loading your qualifier entries. This is usually temporary — try again in a moment."
              action={
                <Button variant="primary" size="sm" onClick={() => router.refresh()}>
                  <span>Try again</span>
                </Button>
              }
            />
          </Surface>
        </div>
      ) : qualifiers.length === 0 ? (
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Flag}
              title="No qualifiers yet"
              description="No qualifiers have been posted by your coach yet. When one is, it shows up here so you can post your rounds."
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/golf/dashboard/rounds">
                    <IconGolf size={15} />
                    <span>View your rounds</span>
                  </Link>
                </Button>
              }
            />
          </Surface>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {/* ── ACTIVE / UPCOMING — the focal list ──────────────────────────── */}
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeading>Active</SectionHeading>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {active.map((q) => (
                  <MyQualifierCard key={q.id} qualifier={q} />
                ))}
              </div>
            </section>
          )}

          {/* ── CONCLUDED — honest-empty when none ──────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeading>Concluded</SectionHeading>
            {concluded.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {concluded.map((q) => (
                  <MyQualifierCard key={q.id} qualifier={q} />
                ))}
              </div>
            ) : (
              <Surface elevation="border" padding="none">
                <EmptyState
                  variant="subtle"
                  icon={Flag}
                  title="No concluded qualifiers yet"
                  description="Qualifiers move here once your coach closes them."
                />
              </Surface>
            )}
          </section>

          {/* ── How qualifiers work — quiet footer note ─────────────────────── */}
          <Surface elevation="border" padding="md">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              How qualifiers work
            </p>
            <p className="mt-1.5 max-w-[70ch] font-fw-sans text-body-sm text-text-secondary">
              Your coach posts a qualifier; you post rounds against it with{' '}
              <span className="font-medium text-text-primary">Start qualifying round</span>. Every round
              counts toward your cumulative score, and{' '}
              <span className="font-medium text-text-primary">View leaderboard</span> ranks the team by
              total to-par, lowest first.
            </p>
          </Surface>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  // <h2>: keeps a strict h1 (ViewHeader) → h2 (section) → h3 (card title)
  // outline so assistive-tech rotor navigation can tell a section apart from
  // the items inside it. Visual size is governed by the classes, not the tag.
  return (
    <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </h2>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * CARD — the player's own scorecard for one qualifier. Shows their progress
 * (thru / total / to-par) + two actions: start the next qualifying round, and
 * view the live leaderboard. NOT a full-card link (it owns two real actions).
 * ────────────────────────────────────────────────────────────────────────── */
function MyQualifierCard({ qualifier: q }: { qualifier: PlayerQualifierInfo }) {
  const cfg = statusConfig(q.status ?? 'upcoming');
  const hasEnd = q.endDate && q.endDate !== q.startDate;
  const canEnterRound = q.status !== 'completed';
  const hasScore = q.totalScore !== null && q.roundsCompleted > 0;

  return (
    <Surface elevation="border" padding="md" className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate font-fw-sans text-body-lg font-medium text-text-primary">{q.name}</h3>
          {q.description && (
            <p className="line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">{q.description}</p>
          )}
        </div>
        <StatusPill tone={cfg.tone} pulse={cfg.pulse} size="sm" className="flex-shrink-0">
          {cfg.label}
        </StatusPill>
      </div>

      {/* Dates + course */}
      <div className="grid grid-cols-1 gap-2 font-fw-sans text-body-sm text-text-secondary sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <IconCalendar size={15} className="flex-shrink-0 text-text-tertiary" />
          <span className="tabular-nums">
            {formatDate(q.startDate)}
            {hasEnd ? <> &ndash; {formatDate(q.endDate as string)}</> : null}
          </span>
        </div>
        {q.courseName && (
          <div className="flex items-center gap-2">
            <IconMapPin size={15} className="flex-shrink-0 text-text-tertiary" />
            <span className="truncate">{q.courseName}</span>
          </div>
        )}
        {q.holesPerRound > 0 && (
          <div className="flex items-center gap-2">
            <IconGolf size={15} className="flex-shrink-0 text-text-tertiary" />
            <span className="tabular-nums">{q.holesPerRound} holes/round</span>
          </div>
        )}
      </div>

      {/* The player's own scorecard — thru / total / to-par */}
      <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
        <ScoreCell label="Thru">
          <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {thruLabel(q.completedRoundNumbers)}
          </span>
        </ScoreCell>
        <ScoreCell label="Total">
          <span className="font-fw-mono text-body-lg font-medium tabular-nums text-text-primary">
            {hasScore ? q.totalScore : '—'}
          </span>
        </ScoreCell>
        <ScoreCell label="To par">
          <span
            className={cn(
              'font-fw-mono text-body-lg font-medium tabular-nums',
              hasScore && q.totalToPar !== null && q.totalToPar < 0 ? 'text-accent-700' : 'text-text-primary',
            )}
          >
            {hasScore ? formatToPar(q.totalToPar) : '—'}
          </span>
        </ScoreCell>
      </div>

      {/* Actions — start next qualifying round + view board */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {canEnterRound && (
          <Button variant="primary" size="sm" asChild>
            <Link href={startRoundHref(q.id)}>
              <IconGolf size={15} />
              <span>Start qualifying round</span>
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link href={detailHref(q.id)}>
            <span>View leaderboard</span>
            <IconArrowRight size={15} />
          </Link>
        </Button>
      </div>
    </Surface>
  );
}

function ScoreCell({ label, children }: { label: string; children: React.ReactNode }) {
  // min-w-0 lets the (grid) cell shrink below its content width so a long Thru
  // label truncates instead of pushing the other two cells out of the 3-up row.
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      {children}
    </div>
  );
}

export default FairwayMyQualifiers;

