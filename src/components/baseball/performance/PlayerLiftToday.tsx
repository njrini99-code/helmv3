'use client';

// =============================================================================
// src/components/baseball/performance/PlayerLiftToday.tsx
//
// The PLAYER-facing lift card mounted by the Player Today slot
// (PlayerTodayClient). It is a clean DEFAULT export so the integration phase can
// drop it straight in without touching this file.
//
// UNIFIED STORAGE (V11): this card reads the SAME materialized
// baseball_lift_sessions rows that publishLiftDay writes — the identical source
// the dedicated player lift route (/baseball/dashboard/lift via getPlayerLiftHome)
// and the CoachHelm engine (loaders-v10) consume. The previous version read the
// legacy baseball_lift_assignments island, so a lift built+published through the
// V11 program builder never appeared here and the AI never analyzed it. That
// island is closed: publish -> materialized session -> set logging -> PRs is now
// one loop visible on Today, on the lift route, and to the engine.
//
// The card itself is an honest daily-loop SUMMARY + launcher: it lists today's
// (and overdue, not-yet-completed) sessions with status, and routes each to the
// dedicated session screen (/baseball/dashboard/lift/[sessionId]) where the full
// per-set logging surface already lives (one place for execution, not two). The
// daily readiness check-in writes the shared baseball_readiness_checkins table.
//
// Players can only ever see/log their OWN sessions and readiness — the RLS
// policies on baseball_lift_sessions / baseball_readiness_checkins make that
// structural; the client typing is loosened only because these tables are not in
// the generated database.ts yet.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconDumbbell,
  IconHeart,
  IconCheckCircle2,
  IconAlertCircle,
  IconChevronRight,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { submitReadinessCheckin } from '@/app/baseball/actions/lifting';
import { getPlayerLiftTodaySummary } from '@/app/baseball/actions/player-today-lift';
import type {
  BaseballReadinessCheckinRow,
  BaseballReadinessArmStatus,
} from '@/lib/types/baseball-lifting';
import type {
  BaseballLiftSessionRow,
  BaseballLiftSessionStatus,
} from '@/lib/types/baseball-lifting-v11';

interface PlayerLiftTodayProps {
  /** Optional — the integration phase may pass these; otherwise resolved here. */
  playerId?: string;
  teamId?: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Sessions a player still owes attention to: today's, plus overdue + open. */
const OPEN_STATUSES: BaseballLiftSessionStatus[] = ['assigned', 'started', 'modified'];

function statusBadge(status: BaseballLiftSessionStatus): {
  label: string;
  className: string;
} {
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

export default function PlayerLiftToday({
  playerId: playerIdProp,
  teamId: teamIdProp,
}: PlayerLiftTodayProps) {
  const { player } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const playerId = playerIdProp ?? player?.id ?? null;
  const teamId = teamIdProp ?? selectedTeamId ?? null;

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<BaseballLiftSessionRow[]>([]);
  const [checkin, setCheckin] = useState<BaseballReadinessCheckinRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Readiness form
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState('');
  const [soreness, setSoreness] = useState('');
  const [arm, setArm] = useState<BaseballReadinessArmStatus | ''>('');
  const [readinessNotes, setReadinessNotes] = useState('');
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [readinessDone, setReadinessDone] = useState(false);

  const load = useCallback(async () => {
    if (!playerId || !teamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Use the server action (withBaseballAction wrapper) instead of a raw
      // client-side Supabase query. This closes gap #7: the old pattern used
      // `createClient()` from '@/lib/supabase/client' with an `as any` cast,
      // bypassing the auth wrapper and producing untyped rows. The server action
      // resolves the player id server-side and enforces auth + active-context.
      const result = await getPlayerLiftTodaySummary();
      if (!result.success) {
        setError(result.error ?? 'Could not load your lifts. Please try again.');
        setSessions([]);
        return;
      }
      setSessions(result.sessions);
      const existing = result.checkin
        ? (result.checkin as BaseballReadinessCheckinRow)
        : null;
      setCheckin(existing);
      if (existing) {
        setSleep(existing.sleep_hours?.toString() ?? '');
        setEnergy(existing.energy_level?.toString() ?? '');
        setSoreness(existing.soreness_level?.toString() ?? '');
        setArm((existing.arm_status as BaseballReadinessArmStatus) ?? '');
        setReadinessNotes(existing.notes ?? '');
      }
    } catch {
      setError('Could not load your lifts. Pull to refresh or try again.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [playerId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReadiness() {
    if (!playerId || !teamId) return;
    setError(null);
    setSavingReadiness(true);
    try {
      const res = await submitReadinessCheckin({
        checkDate: todayStr(),
        sleepHours: sleep ? Number(sleep) : null,
        energyLevel: energy ? Number(energy) : null,
        sorenessLevel: soreness ? Number(soreness) : null,
        armStatus: arm || null,
        notes: readinessNotes || null,
      });
      if (!res.success) {
        setError(res.error ?? 'Could not save your check-in.');
        return;
      }
      setReadinessDone(true);
      setCheckin((prev) => ({
        id: res.id ?? prev?.id ?? '',
        team_id: teamId,
        player_id: playerId,
        check_date: todayStr(),
        sleep_hours: sleep ? Number(sleep) : null,
        energy_level: energy ? Number(energy) : null,
        soreness_level: soreness ? Number(soreness) : null,
        arm_status: arm || null,
        mood: prev?.mood ?? null,
        notes: readinessNotes || null,
        created_at: prev?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      setTimeout(() => setReadinessDone(false), 3000);
    } catch {
      setError('Something went wrong saving your check-in.');
    } finally {
      setSavingReadiness(false);
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

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <h2 className="font-semibold text-warm-900">Today&apos;s Lift</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!playerId || !teamId) {
    return null; // Nothing to show for a non-player / no active team.
  }

  const today = todayStr();

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <IconAlertCircle size={16} />
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

      {/* Today's lift sessions (materialized V11 path). */}
      <Card variant="glass">
        <CardHeader>
          <h2 className="font-semibold text-warm-900">Today&apos;s Lift</h2>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<IconDumbbell size={24} />}
                title="No lift assigned"
                description="When your strength coach publishes a lift, it'll show up here to log."
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
                // A coach-initiated modification (e.g. converted from a Signal)
                // carries the WHY in coach_note. Surfacing it inline turns a bare
                // "Adjusted" badge into a real coach->player message so the player
                // knows why their lift changed instead of guessing.
                const coachNote =
                  s.status === 'modified' && s.coach_note?.trim()
                    ? s.coach_note.trim()
                    : null;
                return (
                  <Link
                    key={s.id}
                    href={`/baseball/dashboard/lift/${s.id}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-warm-50 lg:px-6"
                  >
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100">
                      <IconDumbbell size={18} className="text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-warm-900">
                        {s.title || 'Lift'}
                      </p>
                      <p className="text-sm text-warm-500">
                        {dateLabel}
                        {s.estimated_minutes ? ` · ~${s.estimated_minutes} min` : ''}
                      </p>
                      {coachNote && (
                        <p className="mt-1.5 rounded-lg border-l-2 border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-sm text-warm-700">
                          <span className="font-medium text-amber-700">
                            Coach adjusted this:
                          </span>{' '}
                          {coachNote}
                        </p>
                      )}
                    </div>
                    <Badge className={`mt-0.5 flex-shrink-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                    <IconChevronRight
                      size={16}
                      className="mt-2.5 flex-shrink-0 text-warm-400"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily readiness check-in (shared baseball_readiness_checkins). */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconHeart size={18} className="text-primary-600" />
            <h2 className="font-semibold text-warm-900">Daily Check-in</h2>
          </div>
          <p className="text-sm text-warm-500">
            How are you feeling today? Your coach uses this to plan your load.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field label="Sleep (h)">
              <Input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
              />
            </Field>
            <Field label="Energy">
              <Select value={energy} onChange={setEnergy} options={level5} />
            </Field>
            <Field label="Soreness">
              <Select value={soreness} onChange={setSoreness} options={level5} />
            </Field>
            <Field label="Arm">
              <Select
                value={arm}
                onChange={(v) => setArm(v as BaseballReadinessArmStatus | '')}
                options={[
                  { value: '', label: '—' },
                  { value: 'fresh', label: 'Fresh' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'tight', label: 'Tight' },
                  { value: 'sore', label: 'Sore' },
                  { value: 'pain', label: 'Pain' },
                ]}
              />
            </Field>
          </div>
          <Textarea
            placeholder="Anything else? (optional)"
            value={readinessNotes}
            onChange={(e) => setReadinessNotes(e.target.value)}
            rows={2}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleReadiness} isLoading={savingReadiness}>
              {checkin ? 'Update check-in' : 'Submit check-in'}
            </Button>
            {readinessDone && (
              <span className="flex items-center gap-1 text-sm text-primary-700">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-label font-medium uppercase tracking-wide text-warm-500">
        {label}
      </label>
      {children}
    </div>
  );
}
