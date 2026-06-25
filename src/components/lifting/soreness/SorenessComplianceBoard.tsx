'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessComplianceBoard.tsx
//
// Coach compliance board for today's soreness checks.
// Shows count tiles (ready/reported/pending/missed) + athlete list with status.
// =============================================================================

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconHeart, IconCheckCircle2 } from '@/components/icons';
import type {
  CoachSorenessDashboard,
  AthleteRequestSummary,
} from '@/app/lifting/actions/soreness';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  dashboard: CoachSorenessDashboard;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilterKey = 'all' | 'ready_to_go' | 'completed' | 'pending' | 'missed';

function statusLabel(status: string): string {
  switch (status) {
    case 'ready_to_go': return 'Ready to Go';
    case 'completed': return 'Reported soreness';
    case 'pending': return 'Pending';
    case 'missed': return 'Missed';
    case 'excused': return 'Excused';
    default: return status;
  }
}

function statusDot(status: string): string {
  switch (status) {
    case 'ready_to_go': return 'bg-primary-500';
    case 'completed': return 'bg-amber-400';
    case 'pending': return 'bg-warm-300';
    case 'missed': return 'bg-red-400';
    case 'excused': return 'bg-blue-300';
    default: return 'bg-warm-200';
  }
}

function maxSeverityBadge(max: number | null): React.ReactNode {
  if (max === null) return null;
  const cls =
    max >= 7 ? 'bg-red-100 text-red-700' :
    max >= 5 ? 'bg-amber-100 text-amber-700' :
    max >= 3 ? 'bg-yellow-100 text-yellow-700' :
    'bg-warm-100 text-warm-500';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-eyebrow font-semibold ${cls}`}>
      {max}/10
    </span>
  );
}

function AthleteRow({ summary }: { summary: AthleteRequestSummary }) {
  const name = [summary.firstName, summary.lastName].filter(Boolean).join(' ') || 'Athlete';
  const hasFlags = summary.flags.length > 0;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-warm-50 last:border-0 ${
      hasFlags ? 'bg-amber-50/50' : ''
    }`}>
      {/* Status dot */}
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot(summary.request.status)}`}
        aria-hidden
      />

      {/* Name + position */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate">
          {name}
          {summary.position && (
            <span className="ml-1.5 text-xs text-warm-400">{summary.position}</span>
          )}
        </p>
        {hasFlags && (
          <p className="text-xs text-amber-700 mt-0.5">
            {summary.flags[0]?.label}
          </p>
        )}
      </div>

      {/* Regions count + max severity */}
      <div className="flex items-center gap-2 shrink-0">
        {summary.regions.length > 0 && (
          <span className="text-xs text-warm-500">
            {summary.regions.length} area{summary.regions.length !== 1 ? 's' : ''}
          </span>
        )}
        {maxSeverityBadge(summary.maxSeverity)}
      </div>

      {/* Status label */}
      <span className="text-xs text-warm-500 shrink-0">{statusLabel(summary.request.status)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SorenessComplianceBoard({ dashboard }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [filter, setFilter] = useState<FilterKey>('all');
  const { compliance, allRequests, date } = dashboard;

  const filtered = useMemo(() => {
    if (filter === 'all') return allRequests;
    return allRequests.filter((s) => s.request.status === filter);
  }, [allRequests, filter]);

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const tiles: Array<{ key: FilterKey; label: string; count: number; cls: string }> = [
    { key: 'ready_to_go', label: 'Ready to Go', count: compliance.readyToGo, cls: 'text-primary-700 bg-primary-50 border-primary-200' },
    { key: 'completed', label: 'Reported', count: compliance.reportedSoreness, cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    { key: 'pending', label: 'Pending', count: compliance.pending, cls: 'text-warm-600 bg-warm-50 border-warm-200' },
    { key: 'missed', label: 'Missed', count: compliance.missed, cls: 'text-red-700 bg-red-50 border-red-200' },
  ];

  return (
    <motion.div
      className="space-y-4"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconHeart size={18} className="text-primary-600" />
          <div>
            <h2 className="text-base font-semibold text-warm-900">Soreness Checks</h2>
            <p className="text-xs text-warm-500">{dateLabel}</p>
          </div>
        </div>
        <span className="text-sm text-warm-500">{compliance.total} due</span>
      </div>

      {/* Count tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Button
            key={t.key}
            variant="ghost"
            onClick={() => setFilter(filter === t.key ? 'all' : t.key)}
            className={`rounded-2xl border px-4 py-3 text-left transition-all ${t.cls} ${
              filter === t.key ? 'ring-2 ring-offset-1 ring-primary-400' : 'hover:opacity-80'
            }`}
          >
            <p className="text-2xl font-bold tabular-nums">{t.count}</p>
            <p className="text-xs font-medium mt-0.5">{t.label}</p>
          </Button>
        ))}
      </div>

      {/* Athlete list */}
      <Card variant="flat">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle2 size={28} className="text-primary-400" />}
              title="No athletes match this filter"
              description="Try selecting a different status."
              className="py-8"
            />
          ) : (
            <ul aria-label="Athlete soreness statuses">
              {filtered.map((s) => (
                <li key={s.request.id}>
                  <AthleteRow summary={s} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
