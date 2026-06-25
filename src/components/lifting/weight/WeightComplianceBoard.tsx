'use client';

// =============================================================================
// src/components/lifting/weight/WeightComplianceBoard.tsx
//
// Helm Lifting Lab — Coach weight check-in compliance board.
//
// Renders today's weight check-in summary for a coach:
//   • Summary pill row — completed / pending / missed / excused counts
//   • Athlete list — grouped by status with inline weight values
//   • Overuse/missed-streak flags from getCoachWeightDashboard
//   • Excuse action per pending/missed row
//
// Data comes in as props (loaded by a server component parent so the coach
// page can apply auth at the page level). The board calls
// excuseWeightCheckInRequest directly for inline mutations.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconActivity,
  IconSearch,
  IconUsers,
  IconWarning,
} from '@/components/icons';
import { excuseWeightCheckInRequest } from '@/app/lifting/actions/weight-checkins';
import type { CoachWeightDashboard, WeightRequestRow } from '@/app/lifting/actions/weight-checkins';
import type { WeightCheckinStatus } from '@/lib/types/helm-lifting-checkins';
import type { OveruseFlag } from '@/lib/lifting/overuse-rules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeightComplianceBoardProps {
  dashboard: CoachWeightDashboard;
  orgId: string;
  /** Refresh callback — parent re-fetches or router.refresh() */
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

const STATUS_META: Record<WeightCheckinStatus, { label: string; dotCls: string; rowCls: string }> = {
  completed: { label: 'Logged',  dotCls: 'bg-primary-500', rowCls: 'text-primary-700' },
  pending:   { label: 'Pending', dotCls: 'bg-amber-400',   rowCls: 'text-amber-700'   },
  missed:    { label: 'Missed',  dotCls: 'bg-red-500',     rowCls: 'text-red-700'     },
  excused:   { label: 'Excused', dotCls: 'bg-warm-400',    rowCls: 'text-warm-500'    },
};

type TabKey = 'all' | 'completed' | 'pending' | 'missed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function athleteName(row: WeightRequestRow): string {
  return [row.athleteFirstName, row.athleteLastName].filter(Boolean).join(' ') || 'Unnamed';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Flag card
// ---------------------------------------------------------------------------

function FlagCard({ flag, athleteNames }: { flag: OveruseFlag; athleteNames?: Map<string, string> }) {
  const name = athleteNames?.get(flag.athleteId) ?? flag.athleteId;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
      <IconWarning size={15} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-800">{name}</p>
        <p className="mt-0.5 text-xs text-amber-700">{flag.label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Athlete row
// ---------------------------------------------------------------------------

interface AthleteRowProps {
  row: WeightRequestRow;
  orgId: string;
  onExcused: (id: string) => void;
}

function AthleteRow({ row, orgId, onExcused }: AthleteRowProps) {
  const [excusing, setExcusing] = useState(false);
  const meta = STATUS_META[row.status];
  const name = athleteName(row);

  async function handleExcuse() {
    if (excusing) return;
    setExcusing(true);
    try {
      await excuseWeightCheckInRequest({ requestId: row.id, orgId });
      onExcused(row.id);
    } finally {
      setExcusing(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dotCls}`} />

      {/* Name */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-warm-900">{name}</p>
        {row.scheduleTitle && (
          <p className="truncate text-xs text-warm-400">{row.scheduleTitle}</p>
        )}
      </div>

      {/* Weight or status */}
      <div className="flex shrink-0 items-center gap-2">
        {row.status === 'completed' && row.weightLbs != null ? (
          <span className="tabular-nums text-sm font-semibold text-warm-900">
            {row.weightLbs.toFixed(1)} lbs
          </span>
        ) : (
          <span className={`text-xs font-medium ${meta.rowCls}`}>{meta.label}</span>
        )}

        {/* Logged time */}
        {row.status === 'completed' && row.completedAt && (
          <span className="text-xs text-warm-400">{formatTime(row.completedAt)}</span>
        )}

        {/* Excuse action */}
        {(row.status === 'pending' || row.status === 'missed') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExcuse}
            isLoading={excusing}
            className="h-7 px-2 text-xs text-warm-500 hover:text-warm-700"
          >
            Excuse
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeightComplianceBoard({ dashboard, orgId, onRefresh }: WeightComplianceBoardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Local optimistic excused set — rows the coach just excused disappear from
  // the pending/missed list immediately without waiting for a server re-fetch.
  const [excusedIds, setExcusedIds] = useState<Set<string>>(new Set());

  const handleExcused = useCallback((id: string) => {
    setExcusedIds((prev) => new Set([...prev, id]));
    onRefresh?.();
  }, [onRefresh]);

  const allRows: WeightRequestRow[] = useMemo(
    () => [
      ...dashboard.completed,
      ...dashboard.pending.filter((r) => !excusedIds.has(r.id)),
      ...dashboard.missed.filter((r) => !excusedIds.has(r.id)),
    ],
    [dashboard, excusedIds],
  );

  // Build an athleteId → display name map for flag cards.
  const athleteNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      m.set(r.athleteId, athleteName(r));
    }
    return m;
  }, [allRows]);

  const displayRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? allRows.filter((r) => athleteName(r).toLowerCase().includes(q))
      : allRows;

    if (activeTab === 'all') return filtered;
    return filtered.filter((r) => r.status === activeTab);
  }, [allRows, search, activeTab]);

  // Counts for tab badges.
  const pendingCount = dashboard.pending.filter((r) => !excusedIds.has(r.id)).length;
  const missedCount = dashboard.missed.filter((r) => !excusedIds.has(r.id)).length;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Logged', count: dashboard.totals.completed },
    { key: 'pending',   label: 'Pending', count: pendingCount },
    { key: 'missed',    label: 'Missed',  count: missedCount },
  ];

  function formatBoardDate(ymd: string) {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconActivity size={20} className="text-primary-600" />
            <h1 className="text-xl font-semibold text-warm-900">Weight Check-Ins</h1>
          </div>
          <p className="mt-0.5 text-sm text-warm-500">{formatBoardDate(dashboard.date)}</p>
        </div>
        {/* Summary pills */}
        <div className="flex flex-wrap gap-2">
          <SummaryPill color="green"   value={dashboard.totals.completed} label="Logged"  />
          <SummaryPill color="amber"   value={pendingCount}               label="Pending" />
          <SummaryPill color="red"     value={missedCount}                label="Missed"  />
          <SummaryPill color="neutral" value={dashboard.totals.excused}   label="Excused" />
        </div>
      </div>

      {/* Overuse flags */}
      {dashboard.flags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-warm-400">
            Needs review
          </p>
          {dashboard.flags.map((flag, i) => (
            <FlagCard key={`${flag.athleteId}-${i}`} flag={flag} athleteNames={athleteNames} />
          ))}
        </div>
      )}

      {/* Board card */}
      <Card variant="glass">
        {/* Search + tab bar */}
        <CardHeader className="space-y-3 pb-0">
          <div className="relative w-full max-w-xs">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
            <Input
              className="pl-8 text-sm"
              placeholder="Search athletes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map(({ key, label, count }) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                onClick={() => setActiveTab(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-warm-300'
                }`}
              >
                {label}
                {count != null && count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums ${
                      activeTab === key
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-warm-100 text-warm-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {allRows.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={<IconUsers size={24} className="text-warm-300" />}
                title="No check-ins scheduled"
                description="Publish a weight check-in schedule to see compliance here."
              />
            </div>
          ) : displayRows.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState
                title="No matching athletes"
                description="Try a different filter or search term."
              />
            </div>
          ) : (
            <div className="divide-y divide-warm-100">
              {displayRows.map((row) => (
                <motion.div
                  key={row.id}
                  layout
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12 }}
                >
                  <AthleteRow row={row} orgId={orgId} onExcused={handleExcused} />
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary pill helper
// ---------------------------------------------------------------------------

interface SummaryPillProps {
  color: 'green' | 'amber' | 'red' | 'neutral';
  value: number;
  label: string;
}

const PILL_CLS: Record<SummaryPillProps['color'], string> = {
  green:   'bg-primary-50 text-primary-700 border-primary-200',
  amber:   'bg-amber-50  text-amber-700  border-amber-200',
  red:     'bg-red-50    text-red-700    border-red-200',
  neutral: 'bg-warm-50   text-warm-600   border-warm-200',
};

function SummaryPill({ color, value, label }: SummaryPillProps) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${PILL_CLS[color]}`}>
      <span className="tabular-nums font-semibold">{value}</span>
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton export (for server component Suspense boundaries)
// ---------------------------------------------------------------------------

export function WeightComplianceBoardSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48 rounded-xl" />
          <Skeleton className="h-4 w-36 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-9 w-56 rounded-xl" />
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
