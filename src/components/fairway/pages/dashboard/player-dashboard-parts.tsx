'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayPlayerDashboard local sub-parts
 * ----------------------------------------------------------------------------
 * Presentation-only building blocks for the redesigned PLAYER dashboard. These
 * are page-local compositions of Fairway primitives — they hold NO data
 * fetching and NO business logic. All data arrives as props derived from the
 * UNCHANGED dashboard-data.ts payload.
 *
 * player-home.v2.md (the owner's bar: a stage that answers the player's first
 * question with a real instrument, seam sections rather than boxes):
 *   • PlayerStage — the score trajectory as a Ribbon with the LAST round
 *     marked and the player's own scoring average as the dashed benchmark;
 *     the panel headline is the verdict sentence derived from the SAME
 *     five-round series the form strip's delta hint uses.
 *   • SgFacetsPanel — the four strokes-gained zones as a diverging tornado
 *     (x = 0 is the field average the SG vector is already computed against);
 *     replaces the single-series radar teaser, which showed a shape when the
 *     question is "which zone leaks".
 *   • TodayTasks — the player's action items as seam rows under the schedule
 *     (the old Today card restated the schedule's next event beside them).
 *   • RecentRoundsList — unchanged rows.
 *
 * Honest insufficient-data everywhere (29/50 players have zero rounds and
 * only 19 stats-cache rows) — never authoritative zeros, never a fabricated
 * series: the Ribbon dims below three rounds, the tornado needs three of four
 * zones.
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas`.
 * ========================================================================== */

import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ChevronRight, ClipboardList, Flag, AlertCircle, Megaphone, CalendarClock } from 'lucide-react';

import { Surface } from '@/components/fairway/surfaces/surface';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Ribbon, type RibbonPoint } from '@/components/fairway/charts/Ribbon';
import type { SGCategory } from '@/components/fairway/charts/StrokesGainedTornado';
import type { SeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { cleanCourseName } from '@/lib/golf/course-name';
import { cn } from '@/lib/utils';
import type { ActionItem, StrokesGainedSnapshot } from '@/app/golf/actions/dashboard-data';

// visx stays out of the server render path / first paint (same load contract
// the page's TrendChart had): the tornado mounts client-side, chart-shaped
// skeleton until then.
const StrokesGainedTornado = nextDynamic(
  () =>
    import('@/components/fairway/charts/StrokesGainedTornado').then((m) => ({
      default: m.StrokesGainedTornado,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full rounded-card" />,
  },
);

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
            'hover:text-fw-success-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
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
 * The stage — score trajectory with the last round marked.
 * ----------------------------------------------------------------------------
 * The player's first question is "am I getting better". The Ribbon answers it
 * with the trace itself (every scored round the payload carries, oldest to
 * newest), the LAST round marked and named in the corner readout, and the
 * player's own scoring average as the dashed benchmark, so the newest score
 * reads above or below their norm at a glance. The headline is the verdict
 * sentence, derived from the same `computeSeriesTrend` call the form strip's
 * "last 5 rounds" delta hint uses (one series, one verdict, never two
 * independently computed deltas).
 * ──────────────────────────────────────────────────────────────────────── */

export interface PlayerStageRound {
  id: string;
  course_name: string;
  round_date: string;
}

export interface PlayerStageProps {
  /** Chronological scores, oldest to newest (finite y only is plotted). */
  points: ReadonlyArray<RibbonPoint>;
  /** The newest scored round, for the corner readout label. */
  lastRound: PlayerStageRound | null;
  scoringAverage: number | null;
  /** Split-half trend over the five-round scoring-average series. */
  trend: SeriesTrend | null;
  className?: string;
}

/**
 * The verdict sentence. Scores are lower-is-better: `computeSeriesTrend`
 * with `goodDirection: 'down'` already classifies a falling average as
 * "improving", so the words follow the classification and the magnitude
 * follows the value.
 */
export function scoringVerdict(trend: SeriesTrend | null, scoringAverage: number | null): string {
  if (trend) {
    const magnitude = Math.abs(trend.value).toFixed(1);
    const span = `over your last ${trend.points} rounds`;
    if (trend.direction === 'improving') return `Down ${magnitude} ${span}.`;
    if (trend.direction === 'declining') return `Up ${magnitude} ${span}.`;
    return scoringAverage != null
      ? `Holding around ${scoringAverage.toFixed(1)}.`
      : `Holding steady ${span}.`;
  }
  if (scoringAverage != null) return `Scoring around ${scoringAverage.toFixed(1)}.`;
  return 'Your trend draws after a few more rounds.';
}

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

export function PlayerStage({ points, lastRound, scoringAverage, trend, className }: PlayerStageProps) {
  const lastLabel = lastRound
    ? [cleanCourseName(lastRound.course_name) || 'Last round', formatRoundDate(lastRound.round_date)]
        .filter(Boolean)
        .join(' · ')
    : 'Last round';

  return (
    <Ribbon
      title={scoringVerdict(trend, scoringAverage)}
      data={points}
      seriesName="Score"
      goodDirection="down"
      valueFormatter={(v) => String(Math.round(v))}
      benchmark={
        scoringAverage != null
          ? { value: scoringAverage, label: `Avg ${scoringAverage.toFixed(1)}` }
          : undefined
      }
      minPoints={3}
      markLast
      height={180}
      // Stacked under the headline (never beside it): the bezel row is one
      // column on a phone and the readout would otherwise split left/right.
      readoutPlacement="below"
      readoutLabels={(first) => ({
        value: lastLabel,
        delta: `vs ${String(first.x)}`,
      })}
      takeaway={
        lastRound
          ? `Your scores by round, newest last; the dashed line is your average.`
          : undefined
      }
      className={className}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Where your strokes go — the four scoring zones as a diverging tornado.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The four zones with a finite SG value, in course order. Row labels are the
 * app's own SG abbreviations (the CoachHelm home uses the same set) because
 * the tornado's label gutter is 56 px at phone width; the takeaway sentence
 * spells each zone out.
 */
const SG_ZONE_PHRASE: Record<string, string> = {
  Tee: 'off the tee',
  App: 'on approach',
  ATG: 'around the green',
  Putt: 'on the greens',
};

export function sgFacetRows(sg: StrokesGainedSnapshot | null | undefined): SGCategory[] {
  if (!sg) return [];
  const raw: Array<{ label: string; value: number | null }> = [
    { label: 'Tee', value: sg.sg_off_tee },
    { label: 'App', value: sg.sg_approach },
    { label: 'ATG', value: sg.sg_around_green },
    { label: 'Putt', value: sg.sg_putting },
  ];
  return raw.filter((r): r is SGCategory => r.value != null && Number.isFinite(r.value));
}

/** One sentence naming the best and the worst zone; undefined below three zones. */
export function sgTakeaway(rows: ReadonlyArray<SGCategory>): string | undefined {
  if (rows.length < 3) return undefined;
  const best = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = rows.reduce((a, b) => (b.value < a.value ? b : a));
  const phrase = (label: string) => SG_ZONE_PHRASE[label] ?? label.toLowerCase();
  if (worst.value >= 0) {
    return `Gaining in every zone; the thinnest edge is ${phrase(worst.label)}.`;
  }
  return `Gaining most ${phrase(best.label)}, leaking most ${phrase(worst.label)}.`;
}

export function SgFacetsPanel({
  strokesGained,
  className,
}: {
  strokesGained: StrokesGainedSnapshot | null | undefined;
  className?: string;
}) {
  const rows = useMemo(() => sgFacetRows(strokesGained), [strokesGained]);
  const ready = rows.length >= 3;
  // The heading and the My Standing link are the page's SectionTitle, not
  // ChartFrame's header row: with a link AND the table toggle in that row the
  // title cluster was squeezed to "Wher…" at 390 px. The frame keeps its
  // subtitle and toggle (title null, the pattern the scoring chart used).
  return (
    <div className={cn('min-w-0', className)}>
      <SectionTitle action={{ label: 'My Standing', href: '/golf/dashboard/my-standing' }}>
        Where your strokes go
      </SectionTitle>
      <StrokesGainedTornado
        title={null}
        subtitle="Strokes gained per zone vs the field average. Tee, approach, around the green, putting."
        data={rows}
        state={ready ? 'ready' : 'insufficient-data'}
        stateMessage="Log a few more rounds with hole-by-hole stats and your four zones fill in."
        takeaway={sgTakeaway(rows)}
        height={220}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Today's tasks — seam rows under the schedule.
 * ----------------------------------------------------------------------------
 * The old Today card restated the schedule's next event (DayScheduleSwipe sits
 * directly above) beside the lead task. Only the tasks are new information:
 * overdue first, then open tasks, then everything else, three at most, and a
 * "Full calendar" row that is always there while the group renders. Nothing
 * renders when there are no items (the schedule already says what is on).
 * ──────────────────────────────────────────────────────────────────────── */

export function sortActionItems(items: ReadonlyArray<ActionItem>): ActionItem[] {
  const rank = (a: ActionItem) => (a.overdue ? 0 : a.type === 'task' ? 1 : a.type === 'deadline' ? 2 : 3);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function actionItemStatus(item: ActionItem): { text: string; warn: boolean } {
  if (item.overdue) return { text: 'Overdue', warn: true };
  if (item.type === 'deadline') return { text: 'Deadline', warn: false };
  if (item.type === 'announcement') return { text: 'Announcement', warn: false };
  return { text: 'Open', warn: false };
}

function ActionItemIcon({ item }: { item: ActionItem }) {
  if (item.overdue) return <AlertCircle aria-hidden className="text-fw-warning-ink" />;
  if (item.type === 'deadline') return <CalendarClock aria-hidden />;
  if (item.type === 'announcement') return <Megaphone aria-hidden />;
  return <ClipboardList aria-hidden />;
}

export function TodayTasks({
  actionItems,
  className,
}: {
  actionItems: ReadonlyArray<ActionItem>;
  className?: string;
}) {
  const items = useMemo(() => sortActionItems(actionItems).slice(0, 3), [actionItems]);
  if (items.length === 0) return null;

  return (
    <section aria-label="Needs you" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2 px-1">
        <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary">
          Needs you
        </h2>
        <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
          {actionItems.length}
        </span>
      </div>
      <InsetGroup variant="matte">
        {items.map((item) => {
          const status = actionItemStatus(item);
          return (
            <InsetGroup.Row key={item.id} align="start" icon={<ActionItemIcon item={item} />}>
              <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {item.title}
              </span>
              <span
                className={cn(
                  'block font-fw-sans text-caption',
                  status.warn ? 'text-fw-warning-ink' : 'text-text-tertiary',
                )}
              >
                {status.text}
              </span>
            </InsetGroup.Row>
          );
        })}
        <InsetGroup.Row
          as={Link}
          href="/golf/dashboard/calendar"
          trailing={<ChevronRight aria-hidden />}
          align="center"
        >
          <span className="block font-fw-sans text-body-sm font-medium text-text-primary">Full calendar</span>
        </InsetGroup.Row>
      </InsetGroup>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Recent rounds — calm matte list (Inset rows). Replaces the divided Card.
 * ──────────────────────────────────────────────────────────────────────── */

function toParLabel(toPar: number): { text: string; tone: string } {
  if (toPar === 0) return { text: 'E', tone: 'text-text-secondary' };
  if (toPar < 0) return { text: `${toPar}`, tone: 'text-fw-success-ink' };
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
