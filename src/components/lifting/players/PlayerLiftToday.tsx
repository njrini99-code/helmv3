'use client';

// =============================================================================
// src/components/lifting/players/PlayerLiftToday.tsx
//
// LIFTING LAB — Player-facing "Today" card. Reads helm_lifting_sessions for
// the currently-authenticated athlete (resolved via helm_lifting_is_my_athlete
// RLS — the athlete's existing login is the access key; no Lab sign-up).
//
// Mirrors the baseball/performance/PlayerLiftToday.tsx pattern but reads from
// helm_lifting_* tables and uses the Lab's readiness checkin structure
// (sleep_quality, energy_level, soreness_overall — no baseball-specific arm_status).
//
// Sessions are fetched via a server action so the RLS-enforced identity check
// is done server-side. Links route to /lifting/dashboard/lift/[sessionId].
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconDumbbell,
  IconHeart,
  IconCheckCircle2,
  IconAlertCircle,
  IconChevronRight,
} from '@/components/icons';
import type { HelmLiftingSessionRow, HelmLiftingSessionStatus, HelmLiftingReadinessCheckinRow } from '@/lib/types';
import { getMyLiftToday, submitLiftReadiness } from '@/app/lifting/actions/player-sessions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => new Date().toISOString().slice(0, 10);
const OPEN_STATUSES: HelmLiftingSessionStatus[] = ['assigned', 'started', 'modified'];

function statusBadge(status: HelmLiftingSessionStatus): { label: string; className: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', className: 'bg-primary-100 text-primary-700' };
    case 'started':
      return { label: 'In progress', className: 'bg-amber-100 text-amber-700' };
    case 'modified':
      return { label: 'Adjusted', className: 'bg-amber-100 text-amber-700' };
    case 'missed':
      return { label: 'Missed', className: 'bg-red-100 text-red-700' };
    case 'excused':
      return { label: 'Excused', className: 'bg-warm-100 text-warm-600' };
    default:
      return { label: 'Assigned', className: 'bg-warm-100 text-warm-700' };
  }
}

const level5 = [
  { value: '', label: '—' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerLiftToday() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<HelmLiftingSessionRow[]>([]);
  const [checkin, setCheckin] = useState<HelmLiftingReadinessCheckinRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Readiness form state
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState('');
  const [soreness, setSoreness] = useState('');
  const [notes, setNotes] = useState('');
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [readinessDone, setReadinessDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMyLiftToday();
      if (!result.success) {
        setError(result.error ?? 'Could not load your lifts.');
        setSessions([]);
        return;
      }
      setSessions(result.sessions);
      const existing = result.checkin ?? null;
      setCheckin(existing);
      if (existing) {
        setSleep(existing.sleep_quality?.toString() ?? '');
        setEnergy(existing.energy_level?.toString() ?? '');
        setSoreness(existing.soreness_overall?.toString() ?? '');
        setNotes(existing.notes ?? '');
      }
    } catch {
      setError('Could not load your lifts. Try refreshing.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReadiness() {
    setError(null);
    setSavingReadiness(true);
    try {
      const res = await submitLiftReadiness({
        sleepQuality: sleep ? Number(sleep) : null,
        energyLevel: energy ? Number(energy) : null,
        sorenessOverall: soreness ? Number(soreness) : null,
        notes: notes || null,
      });
      if (!res.success) {
        setError(res.error ?? 'Could not save your check-in.');
        return;
      }
      setReadinessDone(true);
      setTimeout(() => setReadinessDone(false), 3500);
    } catch {
      setError('Something went wrong saving your check-in.');
    } finally {
      setSavingReadiness(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading today's lift">
        <Card variant="glass">
          <CardHeader>
            <h2 className="font-semibold text-warm-900">Today&apos;s Lift</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconHeart size={18} className="text-primary-600" />
              <h2 className="font-semibold text-warm-900">Daily Check-in</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <Skeleton className="h-10 w-32 rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = todayStr();

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <IconAlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="font-medium text-red-700 hover:text-red-800"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Session list */}
      <Card variant="glass">
        <CardHeader>
          <h2 className="font-semibold text-warm-900">Today&apos;s Lift</h2>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<IconDumbbell size={24} />}
                title="No lift today"
                description="When your strength coach publishes a session, it will appear here."
              />
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {sessions.map((s) => {
                const badge = statusBadge(s.status);
                const isOverdue =
                  OPEN_STATUSES.includes(s.status) &&
                  s.scheduled_date != null &&
                  s.scheduled_date < today;
                const dateLabel =
                  s.scheduled_date === today
                    ? 'Today'
                    : isOverdue
                      ? `Overdue · ${s.scheduled_date}`
                      : s.scheduled_date;
                const coachNote =
                  s.status === 'modified' && s.coach_note?.trim()
                    ? s.coach_note.trim()
                    : null;
                return (
                  <Link
                    key={s.id}
                    href={`/lifting/dashboard/lift/${s.id}`}
                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 lg:px-6"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100">
                      <IconDumbbell size={18} className="text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-warm-900">{s.title ?? 'Lift'}</p>
                      <p className="text-sm text-warm-500">
                        {dateLabel}
                        {s.estimated_minutes ? ` · ~${s.estimated_minutes} min` : ''}
                      </p>
                      {coachNote && (
                        <p className="mt-1.5 rounded-lg border-l-2 border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-sm text-warm-700">
                          <span className="font-medium text-amber-700">Coach adjusted:</span>{' '}
                          {coachNote}
                        </p>
                      )}
                    </div>
                    <Badge className={`mt-0.5 shrink-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                    <IconChevronRight
                      size={16}
                      className="mt-2.5 shrink-0 text-warm-400 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily readiness check-in */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconHeart size={18} className="text-primary-600" />
            <h2 className="font-semibold text-warm-900">Daily Check-in</h2>
          </div>
          <p className="text-sm text-warm-500">
            How are you feeling? Your coach uses this to plan your load.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Field label="Sleep (1–5)">
              <select
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                aria-label="Sleep quality"
              >
                {level5.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Energy (1–5)">
              <select
                value={energy}
                onChange={(e) => setEnergy(e.target.value)}
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                aria-label="Energy level"
              >
                {level5.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Soreness (1–5)">
              <select
                value={soreness}
                onChange={(e) => setSoreness(e.target.value)}
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                aria-label="Soreness level"
              >
                {level5.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <textarea
            placeholder="Anything else? (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          <div className="flex items-center gap-3" aria-live="polite">
            <Button onClick={handleReadiness} isLoading={savingReadiness}>
              {checkin ? 'Update check-in' : 'Submit check-in'}
            </Button>
            {readinessDone && (
              <span className="flex items-center gap-1 text-sm font-medium text-primary-700">
                <IconCheckCircle2 size={16} /> Saved
              </span>
            )}
            {checkin && !readinessDone && (
              <span className="text-sm text-warm-500">You checked in today.</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wide text-warm-500">
        {label}
      </label>
      {children}
    </div>
  );
}
