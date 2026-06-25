'use client';

// =============================================================================
// src/components/lifting/readiness/ReadinessBoardClient.tsx
//
// Helm Lifting Lab — readiness board (staff view). Displays today's check-in
// status for every active athlete: band badge, sleep/energy/soreness/stress,
// soreness map indicators, availability status. Honest empty states for
// athletes who haven't checked in yet. Player-safe language (no clinical terms).
// =============================================================================

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { IconUsers, IconSearch, IconAlertCircle } from '@/components/icons';
import type { AthleteReadinessSummary } from '@/app/lifting/actions/readiness';
import type {
  HelmLiftingReadinessBand,
  HelmLiftingAvailabilityStatus,
} from '@/lib/types/helm-lifting-data';

interface Props {
  summaries: AthleteReadinessSummary[];
  orgId: string;
  date: string;
  canEdit: boolean;
  loading?: boolean;
}

function ReadinessBoardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-52 rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* Athlete rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-warm-100 glass-standard px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="w-44 shrink-0 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <div className="flex items-center gap-4 ml-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-16" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const BAND_META: Record<HelmLiftingReadinessBand, { label: string; cls: string; dot: string }> = {
  green:        { label: 'Ready',    cls: 'bg-primary-50 text-primary-700 border-primary-200', dot: 'bg-primary-500' },
  yellow:       { label: 'Caution',  cls: 'bg-amber-50 text-amber-700 border-amber-200',        dot: 'bg-amber-400' },
  orange_lower: { label: 'Limited',  cls: 'bg-orange-50 text-orange-700 border-orange-200',     dot: 'bg-orange-500' },
  orange_upper: { label: 'At risk',  cls: 'bg-orange-50 text-orange-700 border-orange-200',     dot: 'bg-orange-600' },
  red:          { label: 'Hold',     cls: 'bg-red-50 text-red-600 border-red-200',              dot: 'bg-red-500' },
  blue:         { label: 'Sick',     cls: 'bg-blue-50 text-blue-700 border-blue-200',           dot: 'bg-blue-500' },
};

const AVAIL_META: Record<HelmLiftingAvailabilityStatus, { label: string; cls: string }> = {
  available:      { label: 'Available',      cls: 'text-primary-600' },
  limited:        { label: 'Limited',        cls: 'text-amber-600' },
  hold:           { label: 'Hold',           cls: 'text-red-600' },
  return_to_play: { label: 'Return to play', cls: 'text-blue-600' },
  unavailable:    { label: 'Unavailable',    cls: 'text-warm-400' },
};

function ScaleDot({ value, max = 5, inverted = false }: { value: number | null; max?: number; inverted?: boolean }) {
  if (value == null) return <span className="text-warm-300 text-xs">—</span>;
  const norm = inverted ? (max + 1 - value) / max : value / max;
  const cls = norm >= 0.8 ? 'text-primary-600' : norm >= 0.5 ? 'text-amber-500' : 'text-red-500';
  return <span className={`text-xs font-medium ${cls}`}>{value}/{max}</span>;
}

export function ReadinessBoardClient({ summaries, date, loading = false }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('all');

  const filteredBands: HelmLiftingReadinessBand[] = useMemo(() => {
    if (bandFilter === 'all') return [];
    if (bandFilter === 'flagged') return ['red', 'orange_lower', 'orange_upper', 'blue'];
    return [bandFilter as HelmLiftingReadinessBand];
  }, [bandFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return summaries.filter((s) => {
      const name = [s.athlete.first_name, s.athlete.last_name].filter(Boolean).join(' ').toLowerCase();
      const matchSearch = !q || name.includes(q);
      const band = s.checkin?.readiness_band as HelmLiftingReadinessBand | null | undefined;
      const matchBand =
        filteredBands.length === 0 ||
        (band ? filteredBands.includes(band) : bandFilter === 'no_checkin');
      return matchSearch && matchBand;
    });
  }, [summaries, search, filteredBands, bandFilter]);

  // Summary counts.
  const counts = useMemo(() => {
    const checked = summaries.filter((s) => s.checkin).length;
    const flagged = summaries.filter((s) => {
      const b = s.checkin?.readiness_band as HelmLiftingReadinessBand | null | undefined;
      return b && ['red', 'orange_lower', 'orange_upper', 'blue'].includes(b);
    }).length;
    return { total: summaries.length, checked, flagged };
  }, [summaries]);

  if (loading) return <ReadinessBoardSkeleton />;

  function formatDate(ymd: string) {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-warm-900">Readiness Board</h1>
          <p className="mt-0.5 text-sm text-warm-500">{formatDate(date)}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-warm-500">
            <span className="font-semibold text-warm-900">{counts.checked}</span>/{counts.total} checked in
          </span>
          {counts.flagged > 0 && (
            <span className="flex items-center gap-1 font-medium text-red-600">
              <IconAlertCircle size={14} /> {counts.flagged} flagged
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-52">
          <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search athletes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', 'green', 'yellow', 'flagged', 'no_checkin'] as const).map((f) => (
          <Button
            key={f}
            type="button"
            variant="ghost"
            onClick={() => setBandFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              bandFilter === f
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-warm-300'
            }`}
          >
            {f === 'all' ? 'All' : f === 'flagged' ? 'Flagged' : f === 'no_checkin' ? 'No check-in' : BAND_META[f as HelmLiftingReadinessBand]?.label ?? f}
          </Button>
        ))}
      </div>

      {/* Board */}
      <AnimatePresence mode="wait">
        {summaries.length === 0 ? (
          <motion.div
            key="empty-athletes"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <EmptyState
              icon={<IconUsers size={32} className="text-warm-300" />}
              title="No athletes"
              description="No active athletes found for this org."
            />
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            key="empty-filter"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <EmptyState title="No matching athletes" description="Try a different filter." />
          </motion.div>
        ) : (
          <motion.div
            key="athlete-list"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-2"
          >
        {filtered.map((summary, summaryIdx) => {
            const { athlete, checkin, soreness, availabilityStatus, session_today } = summary;
            const name = [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') || 'Unnamed';
            const band = checkin?.readiness_band as HelmLiftingReadinessBand | null | undefined;
            const bandInfo = band ? BAND_META[band] : null;
            const availInfo = availabilityStatus ? AVAIL_META[availabilityStatus] : null;

            return (
              <motion.div
                key={athlete.id}
                layout
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: prefersReducedMotion ? 0 : summaryIdx * 0.03, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Card variant="flat" className="overflow-hidden">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    {/* Name + availability */}
                    <div className="w-44 shrink-0">
                      <p className="font-medium text-warm-900 truncate">{name}</p>
                      <p className="text-xs text-warm-400">
                        {athlete.position ?? '—'}
                        {availInfo ? (
                          <span className={`ml-1.5 ${availInfo.cls}`}>· {availInfo.label}</span>
                        ) : null}
                      </p>
                    </div>

                    {/* Band badge */}
                    <div className="w-24 shrink-0">
                      {bandInfo ? (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${bandInfo.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${bandInfo.dot}`} />
                          {bandInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-warm-300 italic">No check-in</span>
                      )}
                    </div>

                    {/* Scale values */}
                    {checkin ? (
                      <div className="flex items-center gap-4 text-xs text-warm-500 flex-wrap">
                        <span>Sleep <ScaleDot value={checkin.sleep_quality} /></span>
                        <span>Energy <ScaleDot value={checkin.energy_level} /></span>
                        <span>Soreness <ScaleDot value={checkin.soreness_overall} inverted /></span>
                        <span>Stress <ScaleDot value={checkin.stress_level} inverted /></span>
                        {checkin.lower_body_status != null && (
                          <span>Lower <ScaleDot value={checkin.lower_body_status} /></span>
                        )}
                        {checkin.illness_flag && (
                          <span className="text-blue-600 font-medium">Illness flag</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-warm-300">No readiness data for today</span>
                    )}

                    {/* Soreness map indicators */}
                    {soreness.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-auto">
                        {soreness.slice(0, 4).map((s) => (
                          <span key={s.id} className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-micro text-orange-600">
                            {s.body_region}{s.side !== 'center' ? ` (${s.side})` : ''} {s.severity}/5
                          </span>
                        ))}
                        {soreness.length > 4 && (
                          <span className="rounded border border-warm-200 bg-warm-50 px-2 py-0.5 text-micro text-warm-500">
                            +{soreness.length - 4} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Today's session status */}
                    {session_today && (
                      <div className="shrink-0 ml-auto">
                        <span className="text-eyebrow text-warm-400">
                          {session_today.title ?? 'Session'} · {session_today.status}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
