'use client';

// =============================================================================
// src/components/lifting/performance/PRTimeline.tsx
//
// Helm Lifting Lab — personal record vertical timeline.
// Premium glass card, warm amber accent, staggered entrance animation.
// Groups PRs by exercise for scanability. Honest empty state.
// =============================================================================

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAward, IconStar } from '@/components/icons';
import type { ExerciseProgression } from '@/app/lifting/actions/performance-profile';
import type { HelmLiftingPrType } from '@/lib/types/helm-lifting-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlatPR {
  exercise_id: string;
  exercise_name: string;
  pr_type: HelmLiftingPrType;
  value: number;
  unit: string;
  achieved_at: string; // YYYY-MM-DD or ISO timestamptz
}

interface Props {
  progressions: ExerciseProgression[];
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const ymd = iso.slice(0, 10);
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function prTypeLabel(t: HelmLiftingPrType): string {
  switch (t) {
    case 'load':          return 'Load PR';
    case 'estimated_1rm': return 'Est. 1RM';
    case 'reps':          return 'Rep Record';
    case 'volume':        return 'Volume PR';
    case 'velocity':      return 'Velocity PR';
    default:              return t;
  }
}

function prTypeBadgeClass(t: HelmLiftingPrType): string {
  switch (t) {
    case 'load':
    case 'estimated_1rm': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'reps':          return 'bg-primary-50 text-primary-700 border-primary-200';
    case 'volume':        return 'bg-blue-50 text-blue-700 border-blue-200';
    default:              return 'bg-warm-100 text-warm-600 border-warm-200';
  }
}

// Relative time label ("2 days ago", "3 months ago")
function relativeTime(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PRTimeline({ progressions, loading = false }: Props) {
  const prefersReduced = useReducedMotion();

  const allPRs = useMemo<FlatPR[]>(
    () =>
      progressions
        .flatMap((p) =>
          p.prMarkers.map((m) => ({
            exercise_id: p.exercise_id,
            exercise_name: p.exercise_name,
            pr_type: m.pr_type,
            value: m.value,
            unit: m.unit,
            achieved_at: m.achieved_at,
          })),
        )
        .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at)),
    [progressions],
  );

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-32 rounded-lg" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconAward size={18} className="text-amber-500" />
          <h3 className="font-semibold text-warm-900">PR Timeline</h3>
          {allPRs.length > 0 && (
            <span className="ml-auto rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {allPRs.length} record{allPRs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {allPRs.length === 0 ? (
          <EmptyState
            icon={<IconAward size={24} />}
            title="No PRs recorded yet"
            description="Personal records will appear here as your athlete completes sessions."
          />
        ) : (
          <ol
            className="relative space-y-0 pl-6 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:rounded-full before:bg-warm-100"
            aria-label="Personal record timeline"
          >
            {allPRs.map((pr, idx) => (
              <motion.li
                key={`${pr.exercise_id}-${pr.pr_type}-${pr.achieved_at}`}
                initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: idx * 0.045,
                  duration: 0.22,
                  ease: 'easeOut',
                }}
                className="relative pb-4 last:pb-0"
              >
                {/* Timeline node */}
                <span
                  className="absolute -left-[1.5rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 ring-2 ring-amber-200 shadow-sm"
                  aria-hidden="true"
                >
                  <IconStar size={10} className="text-amber-500" />
                </span>

                {/* Card */}
                <div className="rounded-2xl border border-white/30 bg-white/50 px-4 py-3 shadow-sm hover:bg-white/70 transition-colors duration-150">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {/* Left: exercise + date */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-warm-900">
                        {pr.exercise_name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <time
                          dateTime={pr.achieved_at.slice(0, 10)}
                          className="text-xs text-warm-400"
                        >
                          {fmtDate(pr.achieved_at)}
                        </time>
                        <span className="text-xs text-warm-300">·</span>
                        <span className="text-xs text-warm-400">{relativeTime(pr.achieved_at)}</span>
                      </div>
                    </div>

                    {/* Right: value + badge */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className="text-base font-bold text-warm-900">
                        {pr.value} {pr.unit}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${prTypeBadgeClass(pr.pr_type)}`}
                      >
                        {prTypeLabel(pr.pr_type)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
