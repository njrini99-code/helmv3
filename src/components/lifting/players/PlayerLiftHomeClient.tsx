'use client';

// =============================================================================
// src/components/lifting/players/PlayerLiftHomeClient.tsx
//
// LIFTING LAB — Player Lift Home (session listing surface).
// Shows today's session (with Start/Continue CTA), upcoming scheduled sessions,
// and recent history. Reads helm_lifting_sessions via the athlete-self RLS path.
//
// Props are server-assembled (the page server component fetches data and passes
// it down, so the client stays interaction-only).
//
// Routes link to /lifting/dashboard/lift/[sessionId] for execution.
// =============================================================================

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconHeart, IconDumbbell, IconChevronRight } from '@/components/icons';
import type { HelmLiftingSessionRow } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  upcoming: HelmLiftingSessionRow[];
  recent: HelmLiftingSessionRow[];
  /** True if the athlete has submitted a readiness check-in today. */
  readinessSubmittedToday: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Not started',
  started: 'In progress',
  modified: 'Modified by coach',
  completed: 'Completed',
  missed: 'Missed',
  excused: 'Excused',
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlayerLiftHomeClient({ upcoming, recent, readinessSubmittedToday }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysSession = upcoming.find((s) => s.scheduled_date === today) ?? null;
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="space-y-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Page heading */}
      <div>
        <p className="text-eyebrow uppercase text-primary-700">Strength &amp; conditioning</p>
        <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-warm-900">Lift</h1>
        <p className="mt-1 text-sm text-warm-500">
          Log your sets, track your progress, and stay ready.
        </p>
      </div>

      {/* Readiness prompt (if not checked in) */}
      {!readinessSubmittedToday && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"
                aria-hidden
              >
                <IconHeart size={18} />
              </span>
              <div>
                <p className="text-sm font-medium text-warm-900">Daily check-in</p>
                <p className="text-xs text-warm-500">
                  Tell the staff how you feel before training.
                </p>
              </div>
            </div>
            <Link
              href="/lifting/dashboard/readiness"
              className="shrink-0 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              Check in
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Today's session */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-warm-900">Today</h2>
        </CardHeader>
        <CardContent>
          {todaysSession ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-medium text-warm-900">
                  {todaysSession.title ?? 'Lift'}
                </p>
                <p className="text-xs text-warm-500">
                  {STATUS_LABEL[todaysSession.status] ?? todaysSession.status}
                  {todaysSession.estimated_minutes
                    ? ` · ~${todaysSession.estimated_minutes} min`
                    : ''}
                </p>
                {todaysSession.status === 'modified' && todaysSession.coach_note && (
                  <p className="mt-1 rounded-lg border-l-2 border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-xs text-warm-600">
                    <span className="font-medium text-amber-700">Coach note:</span>{' '}
                    {todaysSession.coach_note}
                  </p>
                )}
              </div>
              <Link
                href={`/lifting/dashboard/lift/${todaysSession.id}`}
                className="shrink-0 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
              >
                {todaysSession.status === 'started' ? 'Continue' : 'Start'}
              </Link>
            </div>
          ) : (
            <EmptyState
              icon={<IconDumbbell size={28} />}
              title="No lift today"
              description="Rest up — your coach will publish your next session here when it's ready."
            />
          )}
        </CardContent>
      </Card>

      {/* Upcoming sessions (excluding today's) */}
      {upcoming.filter((s) => s.scheduled_date !== today).length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-warm-900">Upcoming</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcoming
                .filter((s) => s.scheduled_date !== today)
                .map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/lifting/dashboard/lift/${s.id}`}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-warm-100 px-3 py-2 transition-colors hover:border-primary-200 hover:bg-cream-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-warm-800">
                          {s.title ?? 'Lift'}
                        </p>
                        <p className="text-xs text-warm-400">{formatDate(s.scheduled_date)}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700">
                        View
                        <IconChevronRight
                          size={15}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent history */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-warm-900">Recent</h2>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={<IconDumbbell size={28} />}
              title="No completed lifts yet"
              description="Finish a session and it will show up here so you can review what you logged."
            />
          ) : (
            <ul className="space-y-2">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/lifting/dashboard/lift/${s.id}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-warm-50 px-3 py-2 transition-colors hover:border-warm-200 hover:bg-cream-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-warm-700">
                        {s.title ?? 'Lift'}
                      </p>
                      <p className="text-xs text-warm-400">
                        {s.completed_at
                          ? formatDate(s.completed_at.slice(0, 10))
                          : formatDate(s.scheduled_date)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-warm-500 transition-colors group-hover:text-primary-700">
                      Review
                      <IconChevronRight
                        size={15}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
