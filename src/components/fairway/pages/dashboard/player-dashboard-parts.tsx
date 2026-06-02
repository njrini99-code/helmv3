'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayPlayerDashboard local sub-parts
 * ----------------------------------------------------------------------------
 * Presentation-only building blocks for the redesigned PLAYER dashboard. These
 * are page-local compositions of Fairway primitives (Surface / Inset / MetricCard
 * / Button / etc.) — they hold NO data fetching and NO business logic. All data
 * arrives as props derived from the UNCHANGED dashboard-data.ts payload.
 *
 * Per the redesign plan (dashboard-home.json player entry + _flow-dashboard-home
 * Dashboard-vs-Hub split):
 *   • Dashboard = the analytical overview (trend / standing / genome teasers).
 *   • The "today / action items" job belongs to the HUB — the Dashboard only
 *     shows a quiet "Today" summary card that links INTO the Hub instead of
 *     reproducing its tabs.
 *   • Honest insufficient-data everywhere (29/50 players have zero rounds and
 *     only 19 stats-cache rows) — never authoritative zeros.
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas`.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ChevronRight,
  ClipboardList,
  CalendarClock,
  Flag,
  AlertCircle,
  Compass,
} from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  GenomeRadar,
  type GenomeAxis,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import type {
  TodayEvent,
  ActionItem,
  StrokesGainedSnapshot,
} from '@/app/golf/actions/dashboard-data';

/* ─────────────────────────────────────────────────────────────────────────
 * Section heading — quiet General Sans h3 with an optional trailing link.
 * One consistent section-title voice across the page (no bespoke per-card
 * headers).
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">{children}</h2>
      {action ? (
        <Link
          href={action.href}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700',
            'rounded-full px-1 py-0.5 transition-colors duration-base',
            'hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          )}
        >
          {action.label}
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-base group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * "Today" summary card — DEMOTES the old TodayTimeline + ActionItemsCard.
 * ----------------------------------------------------------------------------
 * The plan: the Dashboard must NOT reproduce the Hub's today/tasks tabs. It
 * shows a single compact summary (the next event + the next/overdue task) and
 * links into the Hub, which is the canonical action surface. The counts read
 * off the SAME data the page already received from the payload — no second
 * source-table query here.
 * ──────────────────────────────────────────────────────────────────────── */

function formatEventTime(start: string, timezone?: string): string {
  try {
    return new Date(start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return '';
  }
}

export function TodayCard({
  events,
  actionItems,
  timezone,
}: {
  events: TodayEvent[];
  actionItems: ActionItem[];
  timezone?: string;
}) {
  const nextEvent = events[0] ?? null;
  const overdue = useMemo(
    () => actionItems.filter((a) => a.overdue),
    [actionItems],
  );
  const openTasks = useMemo(
    () => actionItems.filter((a) => a.type === 'task'),
    [actionItems],
  );
  const leadTask = overdue[0] ?? openTasks[0] ?? actionItems[0] ?? null;

  const nothingToday = !nextEvent && actionItems.length === 0;

  return (
    <Surface padding="md" className="flex h-full flex-col">
      <Surface.Header
        title="Today"
        subtitle={
          nothingToday
            ? "You're all caught up"
            : 'Your next event and task — manage everything in the Hub'
        }
      />

      <div className="flex flex-1 flex-col gap-2.5">
        {/* Next event row */}
        {nextEvent ? (
          <Inset padding="sm" className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
              <CalendarClock aria-hidden className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {nextEvent.title}
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                {formatEventTime(nextEvent.start_time, timezone)}
                {nextEvent.location ? ` · ${nextEvent.location}` : ''}
              </p>
            </div>
          </Inset>
        ) : null}

        {/* Lead task row (overdue first) */}
        {leadTask ? (
          <Inset padding="sm" className="flex items-center gap-3">
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-fw-md',
                leadTask.overdue
                  ? 'bg-fw-warning-bg text-fw-warning'
                  : 'bg-surface text-text-tertiary',
              )}
            >
              {leadTask.overdue ? (
                <AlertCircle aria-hidden className="h-4 w-4" />
              ) : (
                <ClipboardList aria-hidden className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {leadTask.title}
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                {leadTask.overdue ? 'Overdue' : 'Open'}
                {openTasks.length > 1 ? ` · ${openTasks.length} tasks total` : ''}
              </p>
            </div>
          </Inset>
        ) : null}

        {nothingToday ? (
          <Inset
            padding="md"
            className="flex flex-1 flex-col items-center justify-center gap-1 text-center"
          >
            <p className="font-fw-sans text-body-sm font-medium text-text-secondary">
              Nothing scheduled
            </p>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Check the Hub for trips and upcoming events.
            </p>
          </Inset>
        ) : null}
      </div>

      <Surface.Footer className="mt-3">
        <span className="font-fw-sans text-caption text-text-tertiary">
          {actionItems.length > 0
            ? `${actionItems.length} item${actionItems.length === 1 ? '' : 's'} to action`
            : 'Your action center'}
        </span>
        <Button asChild variant="ghost" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />}>
          <Link href="/golf/dashboard/hub">Open Hub</Link>
        </Button>
      </Surface.Footer>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Genome fingerprint teaser — a compact GenomeRadar that DEEP-LINKS to the
 * flagship My Game Profile surface (fixes the discoverability bug: the radar
 * was previously a dead-end). Degrades to insufficient-data honestly when the
 * SG vector is sparse.
 * ──────────────────────────────────────────────────────────────────────── */

export function GenomeFingerprintTeaser({
  strokesGained,
}: {
  strokesGained: StrokesGainedSnapshot;
}) {
  // Map the SG snapshot onto the radar's 0–100 axes. The mapping is purely
  // presentational (it does not change the source vector): we center 0 SG at 50
  // and scale ±3 SG to the full range so the shape reads as a fingerprint.
  const axes: GenomeAxis[] = useMemo(() => {
    const toPct = (sg: number | null) =>
      sg == null ? null : Math.max(0, Math.min(100, 50 + (sg / 3) * 50));
    const raw: Array<{ label: string; v: number | null }> = [
      { label: 'Off the Tee', v: toPct(strokesGained.sg_off_tee) },
      { label: 'Approach', v: toPct(strokesGained.sg_approach) },
      { label: 'Around Green', v: toPct(strokesGained.sg_around_green) },
      { label: 'Putting', v: toPct(strokesGained.sg_putting) },
    ];
    return raw
      .filter((r): r is { label: string; v: number } => r.v != null)
      .map((r) => ({ label: r.label, value: r.v }));
  }, [strokesGained]);

  // < 3 axes with data → GenomeRadar renders its own insufficient-data state.
  return (
    <Surface padding="md" className="flex h-full flex-col">
      <Surface.Header
        title="Your genome"
        subtitle="A shape of where your strokes come from"
        actions={
          <Button
            asChild
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            <Link href="/golf/dashboard/my-game-profile">Full profile</Link>
          </Button>
        }
      />
      <div className="-mt-2 flex-1">
        <GenomeRadar
          title={null as unknown as React.ReactNode}
          data={axes}
          seriesName="Strokes gained"
          height={220}
          takeaway={
            axes.length >= 3
              ? 'Your strokes-gained fingerprint across the four scoring zones.'
              : undefined
          }
          state={axes.length < 3 ? 'insufficient-data' : 'ready'}
        />
      </div>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Recent rounds — calm matte list (Inset rows). Replaces the divided Card.
 * ──────────────────────────────────────────────────────────────────────── */

function formatRoundDate(date: string): string {
  try {
    // round_date is a DATE column ('YYYY-MM-DD') → new Date() = UTC midnight.
    // Pin the formatter to UTC so SSR (server TZ) and hydration (client TZ) agree —
    // without this, west-of-UTC clients render the previous day (React #418 + off-by-one).
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return date;
  }
}

function toParLabel(toPar: number): { text: string; tone: string } {
  if (toPar === 0) return { text: 'E', tone: 'text-text-secondary' };
  if (toPar < 0) return { text: `${toPar}`, tone: 'text-fw-success' };
  return { text: `+${toPar}`, tone: 'text-text-secondary' };
}

export function RecentRoundsList({
  rounds,
}: {
  rounds: Array<{
    id: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
}) {
  return (
    <Surface padding="sm" className="flex flex-col">
      <ul className="flex flex-col gap-1.5">
        {rounds.map((round) => {
          const par = toParLabel(round.total_to_par);
          return (
            <li key={round.id}>
              <Link
                href={`/golf/dashboard/rounds/${round.id}/review`}
                className={cn(
                  'group flex items-center gap-3 rounded-fw-md px-3 py-3',
                  'transition-colors duration-base hover:bg-surface-sunken',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-tertiary">
                  <Flag aria-hidden className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {round.course_name}
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    {formatRoundDate(round.round_date)}
                  </p>
                </div>
                <div className="flex items-baseline gap-2 text-right">
                  <span
                    className="font-fw-mono text-body font-medium tabular-nums text-text-primary"
                    style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
                  >
                    {round.total_score}
                  </span>
                  <span
                    className={cn(
                      'w-9 font-fw-mono text-caption font-medium tabular-nums',
                      par.tone,
                    )}
                    style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
                  >
                    {par.text}
                  </span>
                </div>
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-base group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * "Where you stack up" card — the inbound link to My Standing (fixes the
 * discoverability bug). Honest: shows a calm prompt rather than a fake number.
 * ──────────────────────────────────────────────────────────────────────── */

export function StandingCard({ ready }: { ready: boolean }) {
  return (
    <Surface
      as={Link}
      // Surface spreads unknown props (incl. `href`) onto the `as` element; the
      // base SurfaceProps type doesn't model element-specific attrs.
      {...({ href: '/golf/dashboard/my-standing' } as { href: string })}
      interactive
      padding="md"
      className="flex h-full flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
          Where you stack up
        </span>
        <span className="shrink-0 text-text-tertiary">
          <Compass aria-hidden className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2">
        <p className="font-fw-sans text-h3 font-semibold text-text-primary">
          My Standing
        </p>
        <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
          {ready
            ? 'See every metric vs your team and the PGA percentile — and turn your biggest gaps into goals.'
            : 'Log a few rounds to compare your game against your team and the PGA baseline.'}
        </p>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700">
        View standing
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </span>
    </Surface>
  );
}
