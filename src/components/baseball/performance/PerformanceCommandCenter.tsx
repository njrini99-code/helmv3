'use client';

// =============================================================================
// src/components/baseball/performance/PerformanceCommandCenter.tsx
//
// V11 Performance Command Center (spec L39-79). The strength-coach first viewport:
//   * KPI strip (spec L54-60): completion / missed / readiness risk / new PRs /
//     pitcher red flags / load mods pending / bodyweight alerts.
//   * Today Weight Room board (spec L82-117): dense table of today's sessions.
//   * Readiness & availability queue (spec L119-150): turns check-ins into
//     decisions with transparent, NON-MEDICAL bands + reasons.
//
// Cream/green GolfHelm palette ONLY — reuses Card / Button / EmptyState verbatim,
// status tones map to existing success/warning/error tokens. No navy/amber.
// Every chart-equivalent has a table; status uses color PLUS label (spec L568).
// =============================================================================

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getFullName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { readinessBandLabel, readinessBandTone } from '@/lib/baseball/lifting/readiness-compute';
import { PlayerInspectorPanel } from './PlayerInspectorPanel';
import type { ActionRailAction } from '@/components/baseball/ui/ActionRail';
import type {
  BaseballPerformanceKpis,
  BaseballWeightRoomBoardRow,
  BaseballReadinessComputation,
  BaseballReadinessBand,
} from '@/lib/types/baseball-lifting-v11';

interface Props {
  teamName: string;
  trainingWeekLabel: string;
  kpis: BaseballPerformanceKpis;
  board: BaseballWeightRoomBoardRow[];
  readiness: BaseballReadinessComputation[];
  readinessWithheld: boolean;
  playerNameById: Record<string, string>;
  isLoading?: boolean;
  /** Whether the current coach can modify lift prescriptions (can_manage_lifting). */
  canManageLifting?: boolean;
  /** Whether the current coach can set availability status (can_modify_availability). */
  canModifyAvailability?: boolean;
}

const TONE_CLASS: Record<'success' | 'warning' | 'error' | 'info', string> = {
  success: 'bg-primary-50 text-primary-700 border-primary-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-warm-50 text-warm-700 border-warm-200',
};

// KPI card accent: left-border color mirrors tone without full-bleed tint.
const KPI_BORDER_CLASS: Record<'success' | 'warning' | 'error' | 'info', string> = {
  success: 'border-l-4 border-l-primary-400',
  warning: 'border-l-4 border-l-amber-400',
  error: 'border-l-4 border-l-red-400',
  info: 'border-l-4 border-l-warm-300',
};
const KPI_VALUE_CLASS: Record<'success' | 'warning' | 'error' | 'info', string> = {
  success: 'text-primary-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
  info: 'text-warm-700',
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

const SESSION_STATUS_LABEL: Record<string, string> = {
  assigned: 'Not started',
  started: 'In progress',
  completed: 'Complete',
  modified: 'Modified',
  missed: 'Missed',
  excused: 'Excused',
};

export function PerformanceCommandCenter({
  teamName,
  trainingWeekLabel,
  kpis,
  board,
  readiness,
  readinessWithheld,
  playerNameById,
  isLoading = false,
  canManageLifting = false,
  canModifyAvailability = false,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();

  // ── Inspector selection helpers ─────────────────────────────────────────
  const handleRowClick = useCallback((playerId: string) => {
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedPlayerId(null);
  }, []);

  // ── Action routing from inspector ───────────────────────────────────────
  const handleInspectorAction = useCallback(
    (action: ActionRailAction, playerId: string) => {
      const profileBase = `/baseball/dashboard/players/${playerId}`;
      const performBase = `/baseball/dashboard/performance/players/${playerId}`;
      switch (action) {
        case 'modify_lift':
          router.push(performBase);
          break;
        case 'add_note':
          router.push(profileBase);
          break;
        case 'add_followup':
          router.push(profileBase);
          break;
        default:
          router.push(profileBase);
      }
      setSelectedPlayerId(null);
    },
    [router],
  );

  const handleMarkLimited = useCallback(
    (playerId: string) => {
      router.push(`/baseball/dashboard/players/${playerId}`);
      setSelectedPlayerId(null);
    },
    [router],
  );

  // ── Selected player data ────────────────────────────────────────────────
  const selectedBoardRow = useMemo(
    () => (selectedPlayerId ? (board.find((b) => b.player_id === selectedPlayerId) ?? null) : null),
    [board, selectedPlayerId],
  );

  const selectedReadiness = useMemo(
    () => (selectedPlayerId ? (readiness.find((r) => r.player_id === selectedPlayerId) ?? null) : null),
    [readiness, selectedPlayerId],
  );

  // ── KPI / board / queue derivations (hoisted above early return per Rules of Hooks) ──
  const kpiItems = useMemo(
    () => [
      { label: 'Today completion', value: `${kpis.today_completion_pct}%`, sub: `${kpis.today_completed}/${kpis.today_total} sessions`, tone: kpis.today_completion_pct >= 80 ? 'success' : 'warning' as const },
      { label: 'Missed lifts', value: kpis.missed_lifts, tone: kpis.missed_lifts ? 'error' : 'success' as const },
      { label: 'Readiness risk', value: kpis.readiness_risk, tone: kpis.readiness_risk ? 'warning' : 'success' as const },
      { label: 'New PRs', value: kpis.new_prs, tone: 'success' as const },
      { label: 'Pitcher red flags', value: kpis.pitcher_red_flags, tone: kpis.pitcher_red_flags ? 'error' : 'success' as const },
      { label: 'Load mods pending', value: kpis.load_modifications_pending, tone: kpis.load_modifications_pending ? 'warning' : 'success' as const },
      { label: 'Bodyweight alerts', value: kpis.bodyweight_alerts, tone: kpis.bodyweight_alerts ? 'warning' : 'success' as const },
    ],
    [kpis],
  );

  const filteredBoard = useMemo(
    () => (statusFilter === 'all' ? board : board.filter((b) => b.session.status === statusFilter)),
    [board, statusFilter],
  );

  // Readiness queue: only the rows that need a decision (not green / no-checkin).
  const queue = useMemo(
    () =>
      readiness
        .filter((r) => r.band !== 'green')
        .sort((a, b) => bandRank(b.band) - bandRank(a.band)),
    [readiness],
  );

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 lg:p-8" aria-busy="true" aria-label="Loading command center…">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-4 space-y-2 border-l-4 border-l-warm-200"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))}
        </div>
        {/* Board skeleton */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
          <div className="px-6 py-4 border-b border-warm-100">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="divide-y divide-warm-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3" style={{ animationDelay: `${i * 50}ms` }}>
                <Skeleton variant="circular" className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Readiness queue skeleton */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
          <div className="px-6 py-4 border-b border-warm-100">
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="divide-y divide-warm-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3" style={{ animationDelay: `${i * 50}ms` }}>
                <Skeleton variant="circular" className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-primary-700">Weight room</p>
          <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-warm-900">Performance</h1>
          <p className="mt-1 text-sm text-warm-500">
            {teamName} · {trainingWeekLabel} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/baseball/dashboard/performance/live"
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Live Weight Room
          </Link>
          <Link
            href="/baseball/dashboard/performance/programs"
            className="rounded-xl border border-warm-200 bg-white/70 px-4 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Programs
          </Link>
          <Link
            href="/baseball/dashboard/performance/groups"
            className="rounded-xl border border-warm-200 bg-white/70 px-4 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Groups
          </Link>
          <Link
            href="/baseball/dashboard/performance/builder"
            className="rounded-xl border border-warm-200 bg-white/70 px-4 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
          >
            Builder
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpiItems.map((k, i) => (
          <motion.li
            key={k.label}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : i * 0.04 }}
            className="last:col-span-2 sm:last:col-span-1"
          >
            <Card
              className={`p-4 transition-shadow duration-200 hover:shadow-card-hover ${KPI_BORDER_CLASS[k.tone as keyof typeof KPI_BORDER_CLASS]}`}
            >
              <div
                className={`text-2xl font-semibold tabular-nums ${KPI_VALUE_CLASS[k.tone as keyof typeof KPI_VALUE_CLASS]}`}
                aria-label={`${k.value} ${k.label}`}
              >
                {k.value}
              </div>
              <div className="mt-1 text-xs font-medium text-warm-500">{k.label}</div>
              {k.sub ? <div className="mt-0.5 text-[11px] text-warm-400">{k.sub}</div> : null}
            </Card>
          </motion.li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today Weight Room board */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-warm-900">Today Weight Room</h2>
                <p className="text-xs text-warm-500">Who is lifting, status, readiness, and the main lift.</p>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-warm-200 bg-white px-2 py-1 text-sm text-warm-700 transition-colors focus-visible:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                aria-label="Filter board by session status"
              >
                <option value="all">All statuses</option>
                {Object.entries(SESSION_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </CardHeader>
            <CardContent>
              {board.length === 0 ? (
                <EmptyState
                  title="No lifts scheduled today"
                  description="Publish a training day from a program to materialize today's weight-room board."
                  action={{ label: 'Open programs', href: '/baseball/dashboard/performance/programs' }}
                />
              ) : filteredBoard.length === 0 ? (
                <EmptyState
                  title="No athletes match this status"
                  description={`Nothing on today's board is "${SESSION_STATUS_LABEL[statusFilter] ?? statusFilter}". Clear the filter to see everyone.`}
                  action={{ label: 'Show all statuses', onClick: () => setStatusFilter('all') }}
                />
              ) : (
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-warm-100 text-left text-xs font-medium uppercase tracking-wide text-warm-400">
                        <th className="px-2 py-2">Athlete</th>
                        <th className="px-2 py-2">Group</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Readiness</th>
                        <th className="px-2 py-2">Main lift</th>
                        <th className="px-2 py-2 text-right">BW Δ7d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBoard.map((b) => (
                        <tr key={b.session.id} className="border-b border-warm-50 transition-colors hover:bg-cream-100/50">
                          <td className="px-2 py-2">
                            <Link
                              href={`/baseball/dashboard/performance/players/${b.player_id}`}
                              className="rounded font-medium text-warm-900 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                            >
                              {getFullName(b.first_name, b.last_name)}
                            </Link>
                            <div className="text-[11px] text-warm-400">{b.primary_position ?? '—'}</div>
                          </td>
                          <td className="px-2 py-2 text-warm-600">{b.group_names[0] ?? '—'}</td>
                          <td className="px-2 py-2">
                            <span className="text-warm-700">{SESSION_STATUS_LABEL[b.session.status] ?? b.session.status}</span>
                          </td>
                          <td className="px-2 py-2">
                            {readinessWithheld ? <span className="text-xs text-warm-400">Gated</span> : <BandChip band={b.readiness_band} />}
                          </td>
                          <td className="px-2 py-2 text-warm-700">
                            {b.prescribed_main_lift ?? '—'}
                            {b.actual_main_load != null ? <span className="ml-1 text-warm-400">· {b.actual_main_load} lb</span> : null}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {b.bodyweight_delta_7d == null ? (
                              <span className="text-warm-300">—</span>
                            ) : (
                              <span className={b.bodyweight_delta_7d <= -3 ? 'text-amber-700' : 'text-warm-600'}>
                                {b.bodyweight_delta_7d > 0 ? '+' : ''}{b.bodyweight_delta_7d}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Readiness & availability queue */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-warm-900">Readiness queue</h2>
              <p className="text-xs text-warm-500">
                Operational review only — not a medical assessment.
                {!readinessWithheld && queue.length > 0 && (
                  <span className="ml-1 text-warm-400">Click a row to inspect.</span>
                )}
              </p>
            </CardHeader>
            <CardContent>
              {readinessWithheld ? (
                <EmptyState
                  title="Readiness is gated"
                  description="You need the readiness-view capability to see soreness, sleep, and availability."
                />
              ) : queue.length === 0 ? (
                <EmptyState title="All clear" description="No athletes flagged for review today." />
              ) : (
                <ul className="space-y-3">
                  {queue.map((r) => {
                    const isSelected = selectedPlayerId === r.player_id;
                    return (
                      <li key={r.player_id}>
                        <button
                          type="button"
                          onClick={() => handleRowClick(r.player_id)}
                          aria-pressed={isSelected}
                          aria-label={`Inspect ${playerNameById[r.player_id] ?? 'player'}`}
                          className={cn(
                            'w-full rounded-xl border p-3 text-left transition-all duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1',
                            isSelected
                              ? 'border-primary-300 bg-primary-50/60 shadow-sm ring-1 ring-primary-200'
                              : 'border-warm-100 bg-white/60 hover:border-warm-200 hover:bg-white/80',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                isSelected ? 'text-primary-800' : 'text-warm-900',
                              )}
                            >
                              {playerNameById[r.player_id] ?? 'Player'}
                            </span>
                            <BandChip band={r.band} />
                          </div>
                          {r.reasons.length > 0 && (
                            <ul className="mt-1 list-inside list-disc text-xs text-warm-500">
                              {r.reasons.slice(0, 3).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          )}
                          {r.suggested_action && (
                            <p className="mt-1.5 text-xs font-medium text-warm-700">
                              → {r.suggested_action}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-warm-400">
                            <span>Confidence: {r.confidence}</span>
                            {r.stale && <span className="text-amber-600">· stale data</span>}
                            {r.missing_inputs.length > 0 && (
                              <span>· missing: {r.missing_inputs.join(', ')}</span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Player Inspector panel (slide-in drawer) ─────────────────────── */}
      <AnimatePresence>
        {selectedPlayerId && (
          <PlayerInspectorPanel
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            playerName={playerNameById[selectedPlayerId] ?? 'Player'}
            position={selectedBoardRow?.primary_position ?? null}
            boardRow={selectedBoardRow}
            readiness={selectedReadiness}
            readinessWithheld={readinessWithheld}
            canManageLifting={canManageLifting}
            canModifyAvailability={canModifyAvailability}
            onClose={handleCloseInspector}
            onAction={handleInspectorAction}
            onMarkLimited={handleMarkLimited}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function bandRank(band: BaseballReadinessBand): number {
  switch (band) {
    case 'red': return 5;
    case 'orange_lower':
    case 'orange_upper': return 4;
    case 'blue': return 3;
    case 'yellow': return 2;
    case 'green': return 1;
  }
}
