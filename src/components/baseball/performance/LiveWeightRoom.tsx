'use client';

// =============================================================================
// src/components/baseball/performance/LiveWeightRoom.tsx
//
// V11 Live Weight Room mode (spec L522-573 + Packet G) — the flagship premium
// staff surface. ONE screen to run a room of 20-60 athletes:
//
//   * Full-width sticky top bar: team · lift day · group · completion · risk ·
//     live clock · group filter · refresh (spec L526-533).
//   * Athlete grid: name / position / station / exercise / prescribed vs actual
//     load / RPE / readiness badge / last-update (spec L538-549). Color PLUS label
//     everywhere (spec L568) — never color alone.
//   * Right rail (4 derived queues): needs-coach · readiness flags · load
//     changes · missing check-ins (spec L551-556).
//   * Bottom drawer: selected-athlete set logger + load adjust + substitute +
//     mark observed + mark limited + quick message + follow-up task (spec L558-566).
//
// WRITE MODEL: every coach action is OPTIMISTIC with ROLLBACK (spec L573). We
// apply the change to local state immediately, fire the capability-enforced
// server action, and on failure revert to the pre-action snapshot + surface a
// non-destructive error toast. A poll (or manual refresh) re-syncs from truth.
//
// Cream/green GolfHelm palette ONLY. Reuses Card / EmptyState. No navy/amber tale.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { getFullName } from '@/lib/utils';
import { readinessBandLabel, readinessBandTone } from '@/lib/baseball/lifting/readiness-compute';
import {
  logSetResult,
  modifySessionExercise,
  substituteSessionExercise,
  markExerciseObserved,
  sendLiftQuickMessage,
  createLiftFollowupTask,
  setAvailabilityStatus,
  getLiveWeightRoomSnapshot,
} from '@/app/baseball/actions/lifting-v11';
import { useLiveSetSync } from '@/lib/baseball/lifting/use-live-set-sync';
import type {
  BaseballLiveWeightRoomData,
  BaseballLiveAthleteRow,
  BaseballLiveExerciseRow,
  BaseballReadinessBand,
  BaseballLiftSessionStatus,
} from '@/lib/types/baseball-lifting-v11';

interface Props {
  initialData: BaseballLiveWeightRoomData;
  canViewReadiness: boolean;
  playerNameById: Record<string, string>;
  exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
  groupFilter: string | null;
  isLoading?: boolean;
}

const POLL_MS = 20_000;

const TONE_CLASS: Record<'success' | 'warning' | 'error' | 'info', string> = {
  success: 'bg-primary-50 text-primary-700 border-primary-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-warm-50 text-warm-700 border-warm-200',
};

const SESSION_STATUS: Record<BaseballLiftSessionStatus, { label: string; tone: keyof typeof TONE_CLASS }> = {
  assigned: { label: 'Not started', tone: 'info' },
  started: { label: 'In progress', tone: 'warning' },
  modified: { label: 'Modified', tone: 'warning' },
  completed: { label: 'Complete', tone: 'success' },
  missed: { label: 'Missed', tone: 'error' },
  excused: { label: 'Excused', tone: 'info' },
};

function BandChip({ band }: { band: BaseballReadinessBand | null }) {
  if (!band) {
    return (
      <span className="inline-flex items-center rounded-full border border-warm-200 bg-cream-100 px-2 py-0.5 text-xs font-medium text-warm-500">
        No check-in
      </span>
    );
  }
  const tone = readinessBandTone(band);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {readinessBandLabel(band)}
    </span>
  );
}

function StatusChip({ status }: { status: BaseballLiftSessionStatus }) {
  const s = SESSION_STATUS[status] ?? { label: status, tone: 'info' as const };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[s.tone]}`}>
      {s.label}
    </span>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'now';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function LiveWeightRoom({
  initialData,
  canViewReadiness,
  playerNameById,
  exerciseLibrary,
  groupFilter,
  isLoading = false,
}: Props) {
  const [data, setData] = useState<BaseballLiveWeightRoomData>(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Offline-safe set capture. Set logging is the highest-frequency entry on this
  // surface and the one where a dropped network LOSES real work — so it does NOT
  // go through runOptimistic's rollback path. Instead it buffers durably and
  // replays on reconnect (logSetResult upserts on (exercise,set) → safe replay).
  const setSync = useLiveSetSync(
    useCallback(
      (input) =>
        logSetResult({
          sessionId: input.sessionId,
          sessionExerciseId: input.sessionExerciseId,
          setNumber: input.setNumber,
          actualReps: input.actualReps,
          actualLoad: input.actualLoad,
          loadUnit: input.loadUnit,
          rpe: input.rpe,
        }),
      [],
    ),
  );

  // Live clock (spec L532).
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Refresh the snapshot from the server (manual + polling). Never clobbers an
  // in-flight optimistic write: we always re-fetch the authoritative truth.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await getLiveWeightRoomSnapshot({ groupId: groupFilter });
      if (r.success && r.data) setData(r.data);
    } catch {
      // Polling failure is silent (transient); the next tick retries.
    } finally {
      setRefreshing(false);
    }
  }, [groupFilter]);

  // Polling fallback (spec L572). Pauses while the drawer is open so a coach
  // mid-edit isn't yanked out from under by a refresh.
  useEffect(() => {
    if (selectedId) {
      if (pollRef.current) clearInterval(pollRef.current);
      return undefined;
    }
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, refresh]);

  const selected = useMemo(
    () => data.athletes.find((a) => a.session_id === selectedId) ?? null,
    [data.athletes, selectedId],
  );

  // ---- Optimistic helpers -------------------------------------------------
  // Apply a local mutation to an athlete's row, fire the server action, and on
  // failure restore the pre-action snapshot. The whole athletes array is the unit
  // of rollback so any derived field (queues read from props) stays consistent.
  const runOptimistic = useCallback(
    (
      mutate: (athletes: BaseballLiveAthleteRow[]) => BaseballLiveAthleteRow[],
      action: () => Promise<{ success: boolean; error?: string }>,
      okMsg: string,
    ) => {
      const snapshot = data;
      setData((prev) => ({ ...prev, athletes: mutate(prev.athletes) }));
      startTransition(async () => {
        try {
          const r = await action();
          if (!r.success) {
            setData(snapshot); // rollback
            toast.error(r.error ?? 'That change did not save.');
            return;
          }
          toast.success(okMsg);
          await refresh(); // re-sync from truth (PRs, derived queues, etc.)
        } catch {
          setData(snapshot);
          toast.error('That change did not save.');
        }
      });
    },
    [data, refresh],
  );

  // ---- Offline-safe set logging (NOT rollback) ----------------------------
  // Apply the optimistic grid mutation AND durably buffer the set. The buffer —
  // not the live request — is what guarantees the set survives: it replays on
  // reconnect and is only cleared on a confirmed server upsert. A flaky-network
  // failure therefore keeps the logged set on screen instead of yanking it away.
  const applyLoggedSet = useCallback(
    (
      mutate: (athletes: BaseballLiveAthleteRow[]) => BaseballLiveAthleteRow[],
      set: Parameters<typeof setSync.queueAndFlush>[0],
    ) => {
      setData((prev) => ({ ...prev, athletes: mutate(prev.athletes) }));
      setSync.queueAndFlush(set);
    },
    [setSync],
  );

  const tb = data.top_bar;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50" aria-busy="true" aria-label="Loading weight room…">
        {/* Sticky top bar skeleton */}
        <div className="sticky top-0 z-30 border-b border-warm-200 bg-cream-50/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Skeleton className="h-7 w-32 rounded-lg" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
            <div className="ml-auto flex items-center gap-3">
              <Skeleton className="h-8 w-28 rounded-xl" />
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          </div>
        </div>
        {/* Main layout skeleton */}
        <div className="mx-auto max-w-[1600px] flex gap-5 p-4">
          {/* Athlete grid */}
          <div className="flex-1 space-y-3">
            {/* Grid header */}
            <div className="grid grid-cols-7 gap-3 px-3 py-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-3" />
              ))}
            </div>
            {/* Athlete rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-7 gap-3 rounded-2xl border border-warm-100 glass-standard px-3 py-3 items-center"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center gap-2 col-span-2">
                  <Skeleton variant="circular" className="w-8 h-8 flex-shrink-0" />
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
          {/* Right rail */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-warm-100 glass-standard p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton variant="circular" className="w-6 h-6 flex-shrink-0" />
                    <Skeleton className="flex-1 h-3.5" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50">
      {/* ===== Full-width sticky top bar (spec L526-533) ===== */}
      <div className="sticky top-0 z-30 border-b border-warm-200 bg-cream-50/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/baseball/dashboard/performance"
              className="rounded-lg border border-warm-200 glass-standard px-2.5 py-1 text-xs font-medium text-warm-600 transition-colors hover:bg-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              ← Command center
            </Link>
            <div>
              <p className="text-eyebrow uppercase text-primary-700">Live</p>
              <h1 className="text-lg font-semibold leading-tight text-warm-900">Live Weight Room</h1>
              <p className="text-xs text-warm-500">
                {tb.team_name} · {tb.lift_day_label}
                {tb.active_group ? ` · ${tb.active_group}` : ''}
              </p>
            </div>
          </div>

          {/* Live stats */}
          <div className="flex items-center gap-4 text-sm">
            <Stat label="On the floor" value={tb.total} />
            <Stat label="Complete" value={`${tb.completed}/${tb.total}`} tone={tb.completed === tb.total && tb.total > 0 ? 'success' : undefined} />
            <Stat label="In progress" value={tb.in_progress} />
            {canViewReadiness && (
              <Stat label="At risk" value={tb.risk_count} tone={tb.risk_count > 0 ? 'error' : 'success'} />
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Group filter (top-bar "active group") */}
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="group" className="sr-only">Filter by group</label>
              <NativeSelect
                id="group"
                name="group"
                defaultValue={groupFilter ?? ''}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="rounded-lg border border-warm-200 px-2 py-1.5 text-sm text-warm-700 transition-colors focus-visible:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <option value="">All groups</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </NativeSelect>
            </form>
            <SyncPill pending={setSync.pending} isOnline={setSync.isOnline} onRetry={setSync.flushNow} />
            <span className="tabular-nums text-sm font-medium text-warm-700" aria-label="Current time">
              {clock.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              className="rounded-lg border border-warm-200 glass-standard px-3 py-1.5 text-sm font-medium text-warm-700 hover:bg-cream-50 disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Body: grid + right rail ===== */}
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        {/* Athlete grid */}
        <div>
          {data.athletes.length === 0 ? (
            <Card>
              <CardContent className="py-10">
                <EmptyState
                  title="No athletes on the floor"
                  description={
                    groupFilter
                      ? 'No athletes in this group have a lift scheduled today. Clear the group filter or publish a session.'
                      : 'Publish a training day from a program to materialize today’s weight-room board.'
                  }
                  action={{ label: 'Open programs', href: '/baseball/dashboard/performance/programs' }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-warm-200 glass-standard shadow-glass">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="sticky top-[57px] z-10 bg-cream-100/95 backdrop-blur">
                  <tr className="border-b border-warm-200 text-left text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
                    <th className="px-3 py-2.5">Athlete</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Station / exercise</th>
                    <th className="px-3 py-2.5 text-right">Prescribed</th>
                    <th className="px-3 py-2.5 text-right">Actual</th>
                    <th className="px-3 py-2.5 text-right">RPE</th>
                    {canViewReadiness && <th className="px-3 py-2.5">Readiness</th>}
                    <th className="px-3 py-2.5 text-right">Updated</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.athletes.map((a) => {
                    const isSel = a.session_id === selectedId;
                    return (
                      <tr
                        key={a.session_id}
                        className={`border-b border-warm-100 transition-colors ${
                          isSel ? 'bg-primary-50/60' : a.needs_coach ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-cream-100/60'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {a.needs_coach && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Needs coach" />
                            )}
                            <div>
                              <div className="font-medium text-warm-900">{getFullName(a.first_name, a.last_name)}</div>
                              <div className="text-eyebrow text-warm-400">
                                {a.primary_position ?? '—'}
                                {a.group_names[0] ? ` · ${a.group_names[0]}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusChip status={a.session_status} />
                          <div className="mt-0.5 text-eyebrow text-warm-400">
                            {a.completed_exercises}/{a.total_exercises} lifts
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-warm-800">{a.current_exercise ?? '—'}</div>
                          <div className="text-eyebrow text-warm-400">{a.current_station ?? '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-warm-700">
                          {a.prescribed_load != null ? `${a.prescribed_load} lb` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.actual_load != null ? (
                            <span className={a.prescribed_load != null && a.actual_load < a.prescribed_load ? 'text-amber-700' : 'text-warm-900'}>
                              {a.actual_load} lb
                            </span>
                          ) : (
                            <span className="text-warm-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-warm-700">
                          {a.rpe != null ? a.rpe.toFixed(1) : '—'}
                        </td>
                        {canViewReadiness && (
                          <td className="px-3 py-2.5"><BandChip band={a.readiness_band} /></td>
                        )}
                        <td className="px-3 py-2.5 text-right text-eyebrow text-warm-400">{relTime(a.last_update)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => setSelectedId(isSel ? null : a.session_id)}
                            aria-expanded={isSel}
                            aria-label={isSel ? `Close ${getFullName(a.first_name, a.last_name)}` : `Manage ${getFullName(a.first_name, a.last_name)}`}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isSel ? 'bg-primary-700' : ''}`}
                          >
                            {isSel ? 'Close' : 'Manage'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== Right rail: 4 derived queues (spec L551-556) ===== */}
        <aside className="space-y-4">
          <QueueCard
            title="Needs coach"
            empty="Nobody flagged right now."
            tone="error"
            items={data.queues.needs_coach.map((q) => ({
              key: q.player_id,
              name: playerNameById[q.player_id] ?? 'Player',
              detail: q.reason,
              athleteId: data.athletes.find((a) => a.player_id === q.player_id)?.session_id ?? null,
            }))}
            onSelect={setSelectedId}
          />
          {canViewReadiness && (
            <QueueCard
              title="Readiness flags"
              empty="No red or modify bands today."
              tone="warning"
              items={data.queues.readiness_flags.map((q) => ({
                key: q.player_id,
                name: playerNameById[q.player_id] ?? 'Player',
                detail: readinessBandLabel(q.band),
                athleteId: data.athletes.find((a) => a.player_id === q.player_id)?.session_id ?? null,
              }))}
              onSelect={setSelectedId}
            />
          )}
          <QueueCard
            title="Load changes"
            empty="No load adjustments today."
            tone="info"
            items={data.queues.load_changes.map((q) => ({
              key: q.player_id,
              name: playerNameById[q.player_id] ?? 'Player',
              detail: q.reason,
              athleteId: data.athletes.find((a) => a.player_id === q.player_id)?.session_id ?? null,
            }))}
            onSelect={setSelectedId}
          />
          {canViewReadiness && (
            <QueueCard
              title="Missing check-ins"
              empty="Everyone lifting has checked in."
              tone="warning"
              items={data.queues.missing_checkins.map((pid) => ({
                key: pid,
                name: playerNameById[pid] ?? 'Player',
                detail: 'No check-in today',
                athleteId: data.athletes.find((a) => a.player_id === pid)?.session_id ?? null,
              }))}
              onSelect={setSelectedId}
            />
          )}
        </aside>
      </div>

      {/* ===== Bottom drawer: selected-athlete logger + actions (spec L558-566) ===== */}
      {selected && (
        <AthleteDrawer
          key={selected.session_id}
          athlete={selected}
          playerName={getFullName(selected.first_name, selected.last_name)}
          exerciseLibrary={exerciseLibrary}
          onClose={() => setSelectedId(null)}
          runOptimistic={runOptimistic}
          applyLoggedSet={applyLoggedSet}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'error' }) {
  const color = tone === 'error' ? 'text-red-700' : tone === 'success' ? 'text-primary-700' : 'text-warm-900';
  return (
    <div className="leading-tight">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-micro font-medium uppercase tracking-wide text-warm-400">{label}</div>
    </div>
  );
}

// Connectivity + offline-buffer indicator. Honest about state: green "Synced"
// when nothing is queued and online; amber "Offline — N saved" while sets are
// buffered locally (they are NOT lost — they replay on reconnect). Clickable to
// force a retry. This is the premium reassurance a dugout-side coach needs.
function SyncPill({ pending, isOnline, onRetry }: { pending: number; isOnline: boolean; onRetry: () => void }) {
  if (pending === 0 && isOnline) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
        aria-label="All sets synced"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden />
        Synced
      </span>
    );
  }
  const label = pending > 0 ? `${pending} set${pending === 1 ? '' : 's'} saved locally` : 'Offline';
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onRetry}
      title={pending > 0 ? 'Saved on this device — tap to sync now.' : 'No connection — tap to retry.'}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
      {isOnline ? `Syncing · ${label}` : `Offline · ${label}`}
    </Button>
  );
}

interface QueueItem { key: string; name: string; detail: string; athleteId: string | null }

function QueueCard({
  title,
  empty,
  tone,
  items,
  onSelect,
}: {
  title: string;
  empty: string;
  tone: keyof typeof TONE_CLASS;
  items: QueueItem[];
  onSelect: (sessionId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="text-sm font-semibold text-warm-900">{title}</h2>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
          {items.length}
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-warm-400">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li key={it.key}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => it.athleteId && onSelect(it.athleteId)}
                  disabled={!it.athleteId}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream-100/70 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="font-medium text-warm-800">{it.name}</span>
                  <span className="truncate text-right text-eyebrow text-warm-500">{it.detail}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Bottom drawer — the per-athlete command surface. Houses the set logger and the
// seven live actions, each optimistic-with-rollback via runOptimistic.
// ----------------------------------------------------------------------------

type RunOptimistic = (
  mutate: (athletes: BaseballLiveAthleteRow[]) => BaseballLiveAthleteRow[],
  action: () => Promise<{ success: boolean; error?: string }>,
  okMsg: string,
) => void;

interface BufferedSetInput {
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  loadUnit: string | null;
  rpe: number | null;
}

type ApplyLoggedSet = (
  mutate: (athletes: BaseballLiveAthleteRow[]) => BaseballLiveAthleteRow[],
  set: BufferedSetInput,
) => void;

function AthleteDrawer({
  athlete,
  playerName,
  exerciseLibrary,
  onClose,
  runOptimistic,
  applyLoggedSet,
}: {
  athlete: BaseballLiveAthleteRow;
  playerName: string;
  exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
  onClose: () => void;
  runOptimistic: RunOptimistic;
  applyLoggedSet: ApplyLoggedSet;
}) {
  const [activeExId, setActiveExId] = useState<string | null>(
    athlete.exercises.find((e) => e.exercise_name === athlete.current_exercise)?.session_exercise_id
      ?? athlete.exercises[0]?.session_exercise_id
      ?? null,
  );
  const activeEx = athlete.exercises.find((e) => e.session_exercise_id === activeExId) ?? null;
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={`Manage ${playerName}`}
      initial={prefersReducedMotion ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-warm-200 glass-standard shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-4">
        {/* Drawer header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-warm-900">{playerName}</h2>
            <span className="text-xs text-warm-400">{athlete.primary_position ?? '—'}</span>
            <StatusChip status={athlete.session_status} />
            <BandChip band={athlete.readiness_band} />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-warm-600 hover:bg-cream-100"
          >
            Close
          </Button>
        </div>

        {athlete.readiness_reasons.length > 0 && (
          <p className="mt-1 text-eyebrow text-warm-500">{athlete.readiness_reasons.slice(0, 2).join(' · ')}</p>
        )}

        <div className="mt-3 grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Exercise list (stations) */}
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-warm-100 bg-cream-50/60 p-2">
            {athlete.exercises.length === 0 ? (
              <p className="px-2 py-4 text-xs text-warm-400">No exercises in this session.</p>
            ) : (
              athlete.exercises.map((ex) => (
                <Button
                  type="button"
                  key={ex.session_exercise_id}
                  variant="ghost"
                  onClick={() => setActiveExId(ex.session_exercise_id)}
                  aria-pressed={ex.session_exercise_id === activeExId}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                    ex.session_exercise_id === activeExId ? 'bg-primary-100 text-primary-800' : 'hover:bg-cream-50'
                  }`}
                >
                  <span className="truncate">
                    <span className="font-medium text-warm-800">{ex.exercise_name}</span>
                    {ex.was_modified && <span className="ml-1 text-micro text-amber-600">· adj</span>}
                  </span>
                  <span className="shrink-0 text-eyebrow text-warm-400">
                    {ex.sets_logged}/{ex.prescribed_sets ?? '—'}
                  </span>
                </Button>
              ))
            )}
          </div>

          {/* Active exercise: set logger + load/sub actions */}
          <div>
            {activeEx ? (
              <ExercisePanel
                key={activeEx.session_exercise_id}
                athlete={athlete}
                ex={activeEx}
                exerciseLibrary={exerciseLibrary}
                runOptimistic={runOptimistic}
                applyLoggedSet={applyLoggedSet}
              />
            ) : (
              <p className="text-sm text-warm-400">Select an exercise to log sets.</p>
            )}
          </div>
        </div>

        {/* Athlete-level actions (mark limited / message / task) */}
        <AthleteActions athlete={athlete} playerName={playerName} runOptimistic={runOptimistic} onClose={onClose} />
      </div>
    </motion.div>
  );
}

function ExercisePanel({
  athlete,
  ex,
  exerciseLibrary,
  runOptimistic,
  applyLoggedSet,
}: {
  athlete: BaseballLiveAthleteRow;
  ex: BaseballLiveExerciseRow;
  exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
  runOptimistic: RunOptimistic;
  applyLoggedSet: ApplyLoggedSet;
}) {
  const nextSet = (ex.sets.at(-1)?.set_number ?? 0) + 1;
  const [reps, setReps] = useState<string>(ex.prescribed_reps != null ? String(ex.prescribed_reps) : '');
  const [load, setLoad] = useState<string>(ex.prescribed_load != null ? String(ex.prescribed_load) : '');
  const [rpe, setRpe] = useState<string>('');
  const [adjLoad, setAdjLoad] = useState<string>(ex.prescribed_load != null ? String(ex.prescribed_load) : '');
  const [adjReason, setAdjReason] = useState('');
  const [subOpen, setSubOpen] = useState(false);
  const [subId, setSubId] = useState('');
  const [subReason, setSubReason] = useState('');

  function logSet() {
    const repsN = reps ? Number(reps) : null;
    const loadN = load ? Number(load) : null;
    const rpeN = rpe ? Number(rpe) : null;
    if (repsN == null && loadN == null) {
      toast.error('Enter reps or load before logging.');
      return;
    }
    // Offline-safe: the set is applied optimistically AND durably buffered. It
    // is NOT rolled back on a network failure — the buffer replays it on
    // reconnect (logSetResult upserts on (exercise,set), so replay is safe).
    applyLoggedSet(
      (athletes) =>
        athletes.map((a) =>
          a.session_id !== athlete.session_id
            ? a
            : {
                ...a,
                last_update: new Date().toISOString(),
                actual_load: loadN != null ? Math.max(a.actual_load ?? 0, loadN) : a.actual_load,
                rpe: rpeN ?? a.rpe,
                exercises: a.exercises.map((e) =>
                  e.session_exercise_id !== ex.session_exercise_id
                    ? e
                    : {
                        ...e,
                        sets_logged: e.sets_logged + 1,
                        sets: [
                          ...e.sets,
                          {
                            set_number: nextSet,
                            prescribed_reps: e.prescribed_reps,
                            actual_reps: repsN,
                            prescribed_load: e.prescribed_load,
                            actual_load: loadN,
                            load_unit: e.prescribed_load_unit ?? 'lb',
                            rpe: rpeN,
                            velocity: null,
                            coach_observed: true,
                            completed_at: new Date().toISOString(),
                            player_note: null,
                          },
                        ],
                      },
                ),
              },
        ),
      {
        sessionId: athlete.session_id,
        sessionExerciseId: ex.session_exercise_id,
        setNumber: nextSet,
        actualReps: repsN,
        actualLoad: loadN,
        loadUnit: ex.prescribed_load_unit ?? 'lb',
        rpe: rpeN,
      },
    );
    setRpe('');
  }

  function adjustLoad() {
    const loadN = adjLoad ? Number(adjLoad) : null;
    if (loadN == null) {
      toast.error('Enter the new load.');
      return;
    }
    if (!adjReason.trim()) {
      toast.error('Add a reason for the change.');
      return;
    }
    runOptimistic(
      (athletes) =>
        athletes.map((a) =>
          a.session_id !== athlete.session_id
            ? a
            : {
                ...a,
                has_load_change: true,
                exercises: a.exercises.map((e) =>
                  e.session_exercise_id !== ex.session_exercise_id
                    ? e
                    : { ...e, prescribed_load: loadN, was_modified: true, modification_reason: adjReason },
                ),
              },
        ),
      () =>
        modifySessionExercise({
          sessionExerciseId: ex.session_exercise_id,
          prescribedLoad: loadN,
          reason: adjReason,
        }),
      'Load adjusted.',
    );
    setAdjReason('');
  }

  function substitute() {
    if (!subId) {
      toast.error('Pick a substitute exercise.');
      return;
    }
    if (!subReason.trim()) {
      toast.error('Add a reason for the substitution.');
      return;
    }
    const subName = exerciseLibrary.find((e) => e.id === subId)?.name ?? 'Exercise';
    runOptimistic(
      (athletes) =>
        athletes.map((a) =>
          a.session_id !== athlete.session_id
            ? a
            : {
                ...a,
                has_load_change: true,
                exercises: a.exercises.map((e) =>
                  e.session_exercise_id !== ex.session_exercise_id
                    ? e
                    : { ...e, exercise_name: subName, exercise_id: subId, status: 'substituted', was_modified: true, modification_reason: `Substituted: ${subReason}` },
                ),
              },
        ),
      () =>
        substituteSessionExercise({
          sessionExerciseId: ex.session_exercise_id,
          newExerciseId: subId,
          reason: subReason,
        }),
      `Swapped to ${subName}.`,
    );
    setSubOpen(false);
    setSubReason('');
    setSubId('');
  }

  function markObserved() {
    if (ex.sets_logged === 0) {
      toast.error('No logged set to mark observed yet.');
      return;
    }
    runOptimistic(
      (athletes) => athletes, // no visible field change; truth re-syncs on refresh
      () => markExerciseObserved({ sessionExerciseId: ex.session_exercise_id }),
      'Marked form observed.',
    );
  }

  return (
    <div className="space-y-3">
      {/* Prescription summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-warm-100 bg-cream-50/60 px-3 py-2 text-sm">
        <span className="font-semibold text-warm-900">{ex.exercise_name}</span>
        <span className="text-warm-500">
          {ex.prescribed_sets ?? '—'}×{ex.prescribed_reps ?? '—'}
          {ex.prescribed_load != null ? ` @ ${ex.prescribed_load} ${ex.prescribed_load_unit ?? 'lb'}` : ''}
          {ex.prescribed_rpe != null ? ` · RPE ${ex.prescribed_rpe}` : ''}
        </span>
        {ex.was_modified && ex.modification_reason && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700">
            {ex.modification_reason}
          </span>
        )}
      </div>

      {/* Logged sets */}
      {ex.sets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ex.sets.map((s) => (
            <span
              key={s.set_number}
              className="inline-flex items-center gap-1 rounded-lg border border-warm-200 bg-cream-50 px-2 py-1 text-eyebrow text-warm-700"
            >
              <span className="font-medium">#{s.set_number}</span>
              {s.actual_reps ?? '—'}×{s.actual_load ?? '—'}
              {s.rpe != null ? ` @${s.rpe}` : ''}
              {s.coach_observed && <span className="text-primary-600" title="Coach observed">✓</span>}
            </span>
          ))}
        </div>
      )}

      {/* Set logger (spec L564) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={`Set ${nextSet} reps`} value={reps} onChange={setReps} placeholder="reps" />
        <Field label="Load (lb)" value={load} onChange={setLoad} placeholder="load" />
        <Field label="RPE" value={rpe} onChange={setRpe} placeholder="0–10" />
        <Button
          type="button"
          variant="primary"
          onClick={logSet}
          className="mt-auto h-[42px] rounded-xl px-4 text-sm font-medium"
        >
          Log set
        </Button>
      </div>

      {/* Adjust next-set load + substitute + observe */}
      <div className="flex flex-wrap items-end gap-2 border-t border-warm-100 pt-3">
        <Field label="Adjust load" value={adjLoad} onChange={setAdjLoad} placeholder="new lb" />
        <div className="min-w-[140px] flex-1">
          <Input
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            placeholder="reason"
            aria-label="Reason for load adjustment"
            className="h-[42px] rounded-xl border border-warm-200 bg-cream-50 px-3 text-sm text-warm-800 placeholder:text-warm-400 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
          />
        </div>
        <Button type="button" variant="outline" onClick={adjustLoad} className="h-[42px] rounded-xl px-3 text-sm font-medium text-warm-700 hover:bg-cream-100">
          Adjust
        </Button>
        <Button type="button" variant="outline" onClick={() => setSubOpen((v) => !v)} aria-expanded={subOpen} className="h-[42px] rounded-xl px-3 text-sm font-medium text-warm-700 hover:bg-cream-100">
          Substitute
        </Button>
        <Button type="button" variant="outline" onClick={markObserved} className="h-[42px] rounded-xl px-3 text-sm font-medium text-warm-700 hover:bg-cream-100">
          Mark observed
        </Button>
      </div>

      {subOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-warm-100 bg-cream-50/60 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="lwr-sub-exercise" className="text-eyebrow font-medium text-warm-500">Swap to</label>
            <NativeSelect
              id="lwr-sub-exercise"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              className="h-[42px] min-w-[200px] rounded-xl border border-warm-200 px-3 text-sm text-warm-800 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <option value="">Select exercise…</option>
              {exerciseLibrary.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="min-w-[160px] flex-1">
            <Input
              value={subReason}
              onChange={(e) => setSubReason(e.target.value)}
              placeholder="reason (e.g. shoulder soreness)"
              aria-label="Reason for substitution"
              className="h-[42px] rounded-xl border border-warm-200 bg-cream-50 px-3 text-sm text-warm-800 placeholder:text-warm-400 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
            />
          </div>
          <Button type="button" variant="primary" onClick={substitute} className="h-[42px] rounded-xl px-4 text-sm font-medium">
            Confirm swap
          </Button>
        </div>
      )}
    </div>
  );
}

function AthleteActions({
  athlete,
  playerName,
  runOptimistic,
  onClose,
}: {
  athlete: BaseballLiveAthleteRow;
  playerName: string;
  runOptimistic: RunOptimistic;
  onClose: () => void;
}) {
  const [msgOpen, setMsgOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');

  function markLimited() {
    runOptimistic(
      (athletes) =>
        athletes.map((a) =>
          a.session_id === athlete.session_id ? { ...a, availability_status: 'limited', needs_coach: true } : a,
        ),
      () => setAvailabilityStatus({ playerId: athlete.player_id, status: 'limited', reasonCategory: 'soreness' }),
      `${playerName} marked limited.`,
    );
  }

  function sendMessage() {
    if (!msg.trim()) {
      toast.error('Type a message first.');
      return;
    }
    runOptimistic(
      (athletes) => athletes,
      () => sendLiftQuickMessage({ playerId: athlete.player_id, message: msg }),
      'Message sent.',
    );
    setMsg('');
    setMsgOpen(false);
  }

  function createTask() {
    if (!taskTitle.trim()) {
      toast.error('Add a task title.');
      return;
    }
    runOptimistic(
      (athletes) => athletes,
      () =>
        createLiftFollowupTask({
          title: taskTitle,
          description: `Follow-up for ${playerName} from the weight room.`,
        }),
      'Follow-up task created.',
    );
    setTaskTitle('');
    setTaskOpen(false);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warm-100 pt-3">
      <Button type="button" variant="ghost" onClick={markLimited} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100">
        Mark limited
      </Button>
      <Button type="button" variant="outline" onClick={() => setMsgOpen((v) => !v)} aria-expanded={msgOpen} className="rounded-xl px-3 py-1.5 text-sm font-medium text-warm-700 hover:bg-cream-100">
        Quick message
      </Button>
      <Button type="button" variant="outline" onClick={() => setTaskOpen((v) => !v)} aria-expanded={taskOpen} className="rounded-xl px-3 py-1.5 text-sm font-medium text-warm-700 hover:bg-cream-100">
        Follow-up task
      </Button>
      <Link
        href={`/baseball/dashboard/performance/players/${athlete.player_id}`}
        className="ml-auto rounded-xl border border-warm-200 bg-cream-50 px-3 py-1.5 text-sm font-medium text-warm-600 transition-colors hover:bg-cream-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        onClick={onClose}
      >
        Full profile →
      </Link>

      {msgOpen && (
        <div className="flex w-full items-end gap-2 rounded-xl border border-warm-100 bg-cream-50/60 p-3">
          <div className="flex-1">
            <Input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`Message to ${playerName}…`}
              aria-label={`Quick message to ${playerName}`}
              className="h-[42px] rounded-xl border border-warm-200 bg-cream-50 px-3 text-sm text-warm-800 placeholder:text-warm-400 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
          </div>
          <Button type="button" variant="primary" onClick={sendMessage} className="h-[42px] rounded-xl px-4 text-sm font-medium">
            Send
          </Button>
        </div>
      )}

      {taskOpen && (
        <div className="flex w-full items-end gap-2 rounded-xl border border-warm-100 bg-cream-50/60 p-3">
          <div className="flex-1">
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={`e.g. Re-test ${playerName}'s back squat next week`}
              aria-label="Follow-up task title"
              className="h-[42px] rounded-xl border border-warm-200 bg-cream-50 px-3 text-sm text-warm-800 placeholder:text-warm-400 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
              onKeyDown={(e) => e.key === 'Enter' && createTask()}
            />
          </div>
          <Button type="button" variant="primary" onClick={createTask} className="h-[42px] rounded-xl px-4 text-sm font-medium">
            Create
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const fieldId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-eyebrow font-medium text-warm-500">{label}</label>
      <Input
        id={fieldId}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[42px] rounded-xl border border-warm-200 bg-cream-50 px-3 text-sm text-warm-800 placeholder:text-warm-400 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
      />
    </div>
  );
}
