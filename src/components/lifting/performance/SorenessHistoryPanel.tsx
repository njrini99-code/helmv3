'use client';

// =============================================================================
// src/components/lifting/performance/SorenessHistoryPanel.tsx
//
// Helm Lifting Lab — soreness history panel with:
//   • 7-day region heat summary (recurring-region chips)
//   • Today's check-in status banner
//   • Expandable timeline rows with read-only body-map overlay
//   • Coach language only: "Needs review", never medical diagnoses.
// =============================================================================

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconActivity,
  IconChevronDown,
  IconChevronUp,
  IconCheck,
  IconAlertCircle,
} from '@/components/icons';
import { SORENESS_REGIONS } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import type { SorenessStatus } from '@/lib/types/helm-lifting-checkins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SorenessMapEntry {
  region_id: SorenessRegionId;
  severity: number; // 0–10
}

export interface SorenessCheckinSummary {
  checkin_date: string; // YYYY-MM-DD
  soreness_status: SorenessStatus | null;
  soreness_overall: number | null; // 0–10
  notes: string | null;
  regions: SorenessMapEntry[];
}

interface Props {
  checkins: SorenessCheckinSummary[];
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Calm heat colors mapped from severity (NOT neon)
function severityBg(severity: number): string {
  if (severity <= 0) return 'bg-warm-100 text-warm-500';
  if (severity <= 2) return 'bg-primary-50 text-primary-700';
  if (severity <= 4) return 'bg-amber-50 text-amber-700';
  if (severity <= 6) return 'bg-orange-50 text-orange-700';
  if (severity <= 8) return 'bg-red-50 text-red-600';
  return 'bg-red-100 text-red-700';
}

function severityDot(severity: number): string {
  if (severity <= 0) return 'bg-warm-300';
  if (severity <= 2) return 'bg-primary-400';
  if (severity <= 4) return 'bg-amber-400';
  if (severity <= 6) return 'bg-orange-500';
  if (severity <= 8) return 'bg-red-400';
  return 'bg-red-600';
}

function overallDot(overall: number | null): string {
  if (overall === null) return 'bg-warm-300';
  if (overall <= 2) return 'bg-primary-500';
  if (overall <= 4) return 'bg-amber-400';
  if (overall <= 6) return 'bg-orange-500';
  return 'bg-red-500';
}

function severityLabel(s: number): string {
  if (s <= 2) return 'Light';
  if (s <= 4) return 'Noticeable';
  if (s <= 6) return 'Moderate';
  if (s <= 8) return 'High';
  return 'Needs review';
}

// ---------------------------------------------------------------------------
// 7-day heat summary — recurring region chips
// ---------------------------------------------------------------------------

interface RegionFrequency {
  region_id: SorenessRegionId;
  label: string;
  count: number;
  maxSeverity: number;
}

function SevenDayHeatSummary({ checkins }: { checkins: SorenessCheckinSummary[] }) {
  const cutoff = daysAgoYmd(7);
  const recent = checkins.filter((c) => c.checkin_date >= cutoff);

  const regionFreq = useMemo<RegionFrequency[]>(() => {
    const map = new Map<SorenessRegionId, { count: number; maxSeverity: number }>();
    for (const c of recent) {
      for (const r of c.regions) {
        const prev = map.get(r.region_id) ?? { count: 0, maxSeverity: 0 };
        map.set(r.region_id, {
          count: prev.count + 1,
          maxSeverity: Math.max(prev.maxSeverity, r.severity),
        });
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        region_id: id,
        label: SORENESS_REGIONS[id]?.label ?? id,
        count: v.count,
        maxSeverity: v.maxSeverity,
      }))
      .sort((a, b) => b.maxSeverity - a.maxSeverity || b.count - a.count);
  }, [recent]);

  if (recent.length === 0 || regionFreq.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/30 glass-standard px-4 py-3 space-y-2">
      <p className="text-micro font-semibold uppercase tracking-widest text-warm-400">
        7-day recurring regions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {regionFreq.map((rf) => (
          <span
            key={rf.region_id}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${severityBg(rf.maxSeverity)}`}
            title={`${rf.count} check-in${rf.count !== 1 ? 's' : ''} · max severity ${rf.maxSeverity}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${severityDot(rf.maxSeverity)}`}
              aria-hidden="true"
            />
            {rf.label}
            {rf.count > 1 && (
              <span className="opacity-60">×{rf.count}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's status banner
// ---------------------------------------------------------------------------

function TodayStatusBanner({ checkins }: { checkins: SorenessCheckinSummary[] }) {
  const t = todayYmd();
  const todayCheckin = checkins.find((c) => c.checkin_date === t);

  if (!todayCheckin) return null;

  const isReady = todayCheckin.soreness_status === 'ready_to_go';

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${
        isReady
          ? 'border-primary-200 bg-primary-50/60'
          : 'border-amber-200 bg-amber-50/60'
      }`}
      role="status"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isReady ? 'bg-primary-100' : 'bg-amber-100'
        }`}
      >
        {isReady ? (
          <IconCheck size={15} className="text-primary-600" />
        ) : (
          <IconAlertCircle size={15} className="text-amber-600" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isReady ? 'text-primary-800' : 'text-amber-800'}`}>
          {isReady ? 'Ready to go today' : "Today's soreness reported"}
        </p>
        {!isReady && todayCheckin.soreness_overall != null && (
          <p className="text-xs text-amber-700 opacity-80">
            Overall {todayCheckin.soreness_overall}/10 · {severityLabel(todayCheckin.soreness_overall)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only body-map region chips (expanded detail)
// ---------------------------------------------------------------------------

function SorenessBodyMapHistory({ regions }: { regions: SorenessMapEntry[] }) {
  if (regions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {regions.map((r) => {
        const label = SORENESS_REGIONS[r.region_id]?.label ?? r.region_id;
        return (
          <span
            key={r.region_id}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${severityBg(r.severity)}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${severityDot(r.severity)}`}
              aria-hidden="true"
            />
            {label}
            <span className="opacity-60">· {r.severity}</span>
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual check-in row (expandable)
// ---------------------------------------------------------------------------

function CheckinRow({ checkin }: { checkin: SorenessCheckinSummary }) {
  const prefersReduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const isReady = checkin.soreness_status === 'ready_to_go';
  const hasDetail = checkin.regions.length > 0 || !!checkin.notes;

  return (
    <div className="border-b border-warm-100 last:border-0">
      <Button
        type="button"
        variant="ghost"
        onClick={() => hasDetail && setExpanded((p) => !p)}
        disabled={!hasDetail}
        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors lg:px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 whitespace-normal ${
          hasDetail ? 'hover:bg-warm-50/60 cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        {/* Status dot */}
        <div
          className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-offset-1 ring-white ${overallDot(checkin.soreness_overall)}`}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-warm-900">
              {fmtDate(checkin.checkin_date)}
            </span>
            {isReady ? (
              <Badge className="bg-primary-50 text-primary-700 text-micro px-2 py-0.5">
                <IconCheck size={9} className="mr-1" />
                Ready to go
              </Badge>
            ) : (
              <Badge className="bg-amber-50 text-amber-700 text-micro px-2 py-0.5">
                Soreness reported
              </Badge>
            )}
          </div>
          {checkin.soreness_overall !== null && !isReady && (
            <p className="mt-0.5 text-xs text-warm-500">
              {checkin.soreness_overall}/10 · {severityLabel(checkin.soreness_overall)}
            </p>
          )}
          {!expanded && checkin.regions.length > 0 && (
            <p className="mt-0.5 text-xs text-warm-400">
              {checkin.regions.length} area{checkin.regions.length !== 1 ? 's' : ''} flagged
            </p>
          )}
        </div>

        {hasDetail && (
          <span className="mt-1 shrink-0 text-warm-300" aria-hidden="true">
            {expanded ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </span>
        )}
      </Button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pb-3 pl-11 pr-4 lg:pr-6">
              <SorenessBodyMapHistory regions={checkin.regions} />
              {checkin.notes && (
                <p className="rounded-xl border-l-2 border-warm-200 bg-warm-50/80 px-3 py-2 text-xs text-warm-600 italic">
                  &ldquo;{checkin.notes}&rdquo;
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function SorenessHistoryPanel({ checkins, loading = false }: Props) {
  const sorted = useMemo(
    () => [...checkins].sort((a, b) => b.checkin_date.localeCompare(a.checkin_date)),
    [checkins],
  );

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded-lg" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full rounded-2xl" />
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconActivity size={18} className="text-primary-600" />
          <h3 className="font-semibold text-warm-900">Soreness History</h3>
          <span className="ml-auto text-xs text-warm-400">
            {checkins.length} check-in{checkins.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {checkins.length === 0 ? (
          <EmptyState
            icon={<IconActivity size={24} />}
            title="No soreness check-ins yet"
            description="When your athlete completes soreness checks, their history will appear here."
          />
        ) : (
          <>
            {/* Today status */}
            <TodayStatusBanner checkins={checkins} />

            {/* 7-day recurring heat summary */}
            <SevenDayHeatSummary checkins={checkins} />

            {/* Timeline */}
            <div className="overflow-hidden rounded-2xl border border-white/30 glass-standard">
              {sorted.map((c) => (
                <CheckinRow key={c.checkin_date} checkin={c} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
