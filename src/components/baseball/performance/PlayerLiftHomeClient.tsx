'use client';

// =============================================================================
// src/components/baseball/performance/PlayerLiftHomeClient.tsx
//
// V11 Player Lift Home (spec L467-477). Fast, obvious: today's lift title +
// status + a Start button, a readiness check-in prompt, and a history preview.
// Cream/green palette, reuses Card / EmptyState. No staff data shown.
// =============================================================================

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { BaseballLiftSessionRow } from '@/lib/types/baseball-lifting-v11';

interface Props {
  upcoming: BaseballLiftSessionRow[];
  recent: BaseballLiftSessionRow[];
  readinessSubmittedToday: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Not started',
  started: 'In progress',
  modified: 'Modified by coach',
  completed: 'Complete',
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

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
      <div>
        <h1 className="text-3xl font-semibold text-warm-900">Lift</h1>
        <p className="text-sm text-warm-500">What to do today, log your sets, and track progress.</p>
      </div>

      {/* Readiness prompt */}
      {!readinessSubmittedToday && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium text-warm-900">Daily check-in</p>
              <p className="text-xs text-warm-500">Tell the staff how you feel before training.</p>
            </div>
            <Link href="/baseball/dashboard/readiness" className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              Check in
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Today's lift */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-warm-900">Today</h2>
        </CardHeader>
        <CardContent>
          {todaysSession ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-medium text-warm-900">{todaysSession.title ?? 'Lift'}</p>
                <p className="text-xs text-warm-500">
                  {STATUS_LABEL[todaysSession.status] ?? todaysSession.status}
                  {todaysSession.estimated_minutes ? ` · ~${todaysSession.estimated_minutes} min` : ''}
                </p>
              </div>
              <Link
                href={`/baseball/dashboard/lift/${todaysSession.id}`}
                className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {todaysSession.status === 'started' ? 'Continue' : 'Start'}
              </Link>
            </div>
          ) : (
            <EmptyState title="No lift today" description="You have no scheduled lift today. Rest up." />
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      {upcoming.filter((s) => s.scheduled_date !== today).length > 0 && (
        <Card>
          <CardHeader><h2 className="text-xl font-semibold text-warm-900">Upcoming</h2></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcoming.filter((s) => s.scheduled_date !== today).map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-warm-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-warm-800">{s.title ?? 'Lift'}</p>
                    <p className="text-xs text-warm-400">{formatDate(s.scheduled_date)}</p>
                  </div>
                  <Link href={`/baseball/dashboard/lift/${s.id}`} className="text-sm text-primary-700 hover:underline">View</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader><h2 className="text-xl font-semibold text-warm-900">Recent</h2></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState title="No completed lifts yet" description="Your finished sessions will show up here." />
          ) : (
            <ul className="space-y-2">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-warm-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-warm-700">{s.title ?? 'Lift'}</p>
                    <p className="text-xs text-warm-400">{s.completed_at ? formatDate(s.completed_at.slice(0, 10)) : formatDate(s.scheduled_date)}</p>
                  </div>
                  <Link href={`/baseball/dashboard/lift/${s.id}`} className="text-sm text-warm-500 hover:text-primary-700">Review</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
