'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayPlayerDashboard local sub-parts
 * ----------------------------------------------------------------------------
 * Presentation-only building blocks for the PLAYER Home field sheet. They hold
 * NO data fetching and NO business logic; every value arrives as a prop from
 * the dashboard-data.ts payload.
 *
 * W9 field-sheet pass (2026-09-24, DASH-01/02, OD-08):
 *   • Tasks and Recent rounds are hairline ledger rows, not cards holding
 *     insets. Titles and course names wrap; nothing is ellipsized.
 *   • The strokes-gained radar teaser and the "Where you stack up" card are
 *     gone (OD-08: the radar was unreadable at phone size). `GameLinks` keeps
 *     both destinations one tap away as plain rows.
 *   • Numbers go through the display registry and SF tabular numerals.
 *
 * Renders inside a `.fairway-ds` scope on `bg-canvas`.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronRight, ClipboardList, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { cleanCourseName } from '@/lib/golf/course-name';
import { formatMetric } from '@/lib/golf/metrics/display-registry';
import { formatStripDate } from '@/components/fairway/modules/RoundStrip';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

/* ─────────────────────────────────────────────────────────────────────────
 * Section heading — one quiet h2 voice with an optional trailing link.
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionTitle({
  children,
  action,
  id,
}: {
  children: React.ReactNode;
  action?: { label: string; href: string };
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="font-fw-sans text-h3 font-semibold text-text-primary">
        {children}
      </h2>
      {action ? (
        <Link
          href={action.href}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-ink',
            // 44pt hit area (HIG) without moving the row: the padding grows
            // the target and the negative margin gives the height back.
            'rounded-full px-1 -my-2.5 min-h-11 py-2.5 transition-colors duration-base',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
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

/** One hairline-divided list, shared by every ledger section on Home. */
const LEDGER_LIST = 'm-0 flex list-none flex-col divide-y divide-border-subtle border-y border-border-subtle p-0';

/* ─────────────────────────────────────────────────────────────────────────
 * Tasks — the one open task that matters most, as a ledger row.
 * ----------------------------------------------------------------------------
 * This section used to be a second "Today" (next event + lead task) under the
 * schedule card's own "Today". With no event it read "Nothing scheduled, a
 * clear day" up top and an overdue task down here, under the same heading.
 * The schedule card owns the day's events; this section owns tasks only: the
 * overdue one first, else the next open one, and a link to the full list.
 * ──────────────────────────────────────────────────────────────────────── */

export function TasksCard({ actionItems }: { actionItems: ActionItem[] }) {
  // Overdue tasks arrive as type 'deadline'. Announcements are not tasks.
  const tasks = useMemo(
    () => actionItems.filter((a) => a.type === 'task' || a.type === 'deadline'),
    [actionItems],
  );
  const leadTask = tasks.find((t) => t.overdue) ?? tasks[0] ?? null;

  return (
    <section aria-labelledby="home-tasks-title" className="flex flex-col">
      <SectionTitle id="home-tasks-title" action={{ label: 'All tasks', href: '/golf/dashboard/tasks' }}>
        Tasks
      </SectionTitle>

      {leadTask ? (
        <ul className={LEDGER_LIST}>
          <li className="flex items-start gap-3 py-3">
            {leadTask.overdue ? (
              <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fw-warning-text" />
            ) : (
              <ClipboardList aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-fw-sans text-body-sm font-medium text-text-primary">
                {leadTask.title}
              </p>
              <p className="font-fw-sans text-caption text-text-secondary">
                {leadTask.overdue ? 'Overdue' : 'Open'}
                {tasks.length > 1 ? ` · ${tasks.length} open tasks` : ''}
              </p>
            </div>
          </li>
        </ul>
      ) : (
        // One line, no reserved height: no tasks should not hold a box open.
        <p className="border-y border-border-subtle py-3 font-fw-sans text-body-sm text-text-secondary">
          <span className="font-medium text-text-primary">No open tasks</span>
          {' · '}Tasks from your coach show up here.
        </p>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Recent rounds — a hairline table: date, course (wraps), score, to par.
 * ──────────────────────────────────────────────────────────────────────── */

export interface RecentRoundRow {
  id: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
  round_date: string;
}

export function RecentRoundsList({ rounds }: { rounds: RecentRoundRow[] }) {
  return (
    <ul className={LEDGER_LIST}>
      {rounds.map((round) => {
        const toPar = formatMetric('round_to_par', round.total_to_par);
        return (
          <li key={round.id}>
            <Link
              href={`/golf/dashboard/rounds/${round.id}/review`}
              className={cn(
                'group flex items-center gap-3 py-3',
                'transition-colors duration-base',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              )}
            >
              <span className="w-12 shrink-0 font-fw-sans text-caption text-text-secondary tabular-nums">
                {formatStripDate(round.round_date)}
              </span>
              <span className="min-w-0 flex-1 font-fw-sans text-body-sm font-medium text-text-primary line-clamp-2">
                {cleanCourseName(round.course_name) || 'Unknown course'}
              </span>
              <span className="w-9 text-right font-fw-sans text-body font-medium text-text-primary tabular-nums">
                {round.total_score}
              </span>
              <span
                className={cn(
                  'w-9 text-right font-fw-sans text-caption font-medium tabular-nums',
                  toPar.tone === 'good' ? 'text-accent-ink' : toPar.tone === 'bad' ? 'text-fw-warning-text' : 'text-text-secondary',
                )}
              >
                <span className="sr-only">{toPar.ariaLabel}</span>
                <span aria-hidden="true">{toPar.text}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-base group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Your game — where the strokes-gained radar and the standing card used to
 * sit (OD-08). Plain rows into the surfaces that hold the full picture.
 * ──────────────────────────────────────────────────────────────────────── */

export function GameLinks({ links }: { links: Array<{ href: string; title: string; detail: string }> }) {
  return (
    <ul className={LEDGER_LIST}>
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            className={cn(
              'group flex items-center gap-3 py-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-fw-sans text-body-sm font-medium text-text-primary">{l.title}</span>
              <span className="block font-fw-sans text-caption text-text-secondary">{l.detail}</span>
            </span>
            <ChevronRight
              aria-hidden
              className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-base group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
