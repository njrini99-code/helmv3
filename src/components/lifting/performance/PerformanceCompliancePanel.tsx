'use client';

// =============================================================================
// src/components/lifting/performance/PerformanceCompliancePanel.tsx
//
// Helm Lifting Lab — compliance summary panel for player profiles.
// Premium: SVG radial rings + animated progress bars for each compliance
// category (lift / soreness / weight / readiness). Large overall ring.
// Honest empty state.
// =============================================================================

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IconChart, IconTarget } from '@/components/icons';
import type {
  PlayerPerformanceCompliance,
  ComplianceRate,
} from '@/app/lifting/actions/performance-profile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  compliance: PlayerPerformanceCompliance | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-warm-300';
  if (pct >= 80) return 'text-primary-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-500';
}

function pctBarColor(pct: number | null): string {
  if (pct === null) return 'bg-warm-200';
  if (pct >= 80) return 'bg-primary-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function pctRingStroke(pct: number | null): string {
  if (pct === null) return '#e7e5e4';
  if (pct >= 80) return '#16a34a';
  if (pct >= 50) return '#f59e0b';
  return '#f87171';
}

function fmtDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Radial progress ring (SVG)
// ---------------------------------------------------------------------------

interface RadialRingProps {
  pct: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

function RadialRing({
  pct,
  size = 80,
  strokeWidth = 7,
  label,
  sublabel,
}: RadialRingProps) {
  const prefersReduced = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = pct != null ? Math.min(Math.max(pct, 0), 100) : 0;
  const dashOffset = circ * (1 - progress / 100);
  const stroke = pctRingStroke(pct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f5f5f4"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: prefersReduced ? dashOffset : dashOffset }}
            transition={{ duration: prefersReduced ? 0 : 0.8, ease: 'easeOut', delay: 0.1 }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-bold leading-none ${pctColor(pct)}`}>
            {pct != null ? `${pct}%` : '—'}
          </span>
        </div>
      </div>
      {label && (
        <p className="max-w-[70px] text-center text-[10px] font-medium leading-tight text-warm-600">
          {label}
        </p>
      )}
      {sublabel && (
        <p className="text-[10px] text-warm-400">{sublabel}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Large overall ring
// ---------------------------------------------------------------------------

function OverallRing({ pct }: { pct: number | null }) {
  const prefersReduced = useReducedMotion();
  const size = 96;
  const sw = 9;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const progress = pct != null ? Math.min(Math.max(pct, 0), 100) : 0;
  const dashOffset = circ * (1 - progress / 100);
  const stroke = pctRingStroke(pct);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f5f5f4"
          strokeWidth={sw}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: prefersReduced ? 0 : 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold leading-none ${pctColor(pct)}`}>
          {pct != null ? `${pct}%` : '—'}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-warm-400">
          Overall
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single compliance bar row
// ---------------------------------------------------------------------------

interface MeterProps {
  label: string;
  rate: ComplianceRate;
}

function ComplianceMeter({ label, rate }: MeterProps) {
  const prefersReduced = useReducedMotion();
  const pct = rate.completionPct;
  const barWidth = pct !== null ? `${pct}%` : '0%';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-warm-700">{label}</span>
        <span className={`shrink-0 text-sm font-bold ${pctColor(pct)}`}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>

      {/* Bar track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-warm-100" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className={`h-full rounded-full ${pctBarColor(pct)}`}
          initial={{ width: 0 }}
          animate={{ width: barWidth }}
          transition={{ duration: prefersReduced ? 0 : 0.7, ease: 'easeOut' }}
        />
      </div>

      {/* Sub-label */}
      <div className="flex items-center gap-2 text-xs text-warm-400">
        {rate.total > 0 ? (
          <span>
            {rate.completed}/{rate.total} completed
            {rate.missed > 0 && (
              <span className="ml-1.5 text-red-400">· {rate.missed} missed</span>
            )}
            {rate.pending > 0 && (
              <span className="ml-1.5 text-warm-400">· {rate.pending} pending</span>
            )}
          </span>
        ) : (
          <span className="text-warm-300">No data in this window</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function PerformanceCompliancePanel({ compliance, loading = false }: Props) {
  const overallPct = useMemo(() => {
    if (!compliance) return null;
    const rates = [
      compliance.liftCompliance.completionPct,
      compliance.sorenessCompliance.completionPct,
      compliance.weightCompliance.completionPct,
      compliance.readinessCompliance.completionPct,
    ].filter((p): p is number => p !== null);
    if (rates.length === 0) return null;
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  }, [compliance]);

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded-lg" />
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Ring skeletons */}
          <div className="flex justify-around">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-20 rounded-full" />
            ))}
          </div>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!compliance) {
    return (
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconTarget size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Compliance</h3>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<IconChart size={24} />}
            title="No compliance data"
            description="Schedule check-ins and sessions to track compliance."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconTarget size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Compliance</h3>
          </div>
          <p className="text-xs text-warm-400">
            {fmtDate(compliance.windowFrom)} – {fmtDate(compliance.windowTo)}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Ring summary row */}
        <div className="flex items-center justify-around gap-2 overflow-x-auto py-1">
          <OverallRing pct={overallPct} />
          <RadialRing
            pct={compliance.liftCompliance.completionPct}
            label="Lift Sessions"
          />
          <RadialRing
            pct={compliance.sorenessCompliance.completionPct}
            label="Soreness"
          />
          <RadialRing
            pct={compliance.weightCompliance.completionPct}
            label="Weight"
          />
          <RadialRing
            pct={compliance.readinessCompliance.completionPct}
            label="Readiness"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-warm-100" />

        {/* Detail bars */}
        <div className="space-y-5">
          <ComplianceMeter label="Lift sessions" rate={compliance.liftCompliance} />
          <ComplianceMeter label="Soreness check-ins" rate={compliance.sorenessCompliance} />
          <ComplianceMeter label="Weight check-ins" rate={compliance.weightCompliance} />
          <ComplianceMeter label="Daily readiness" rate={compliance.readinessCompliance} />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-warm-400 border-t border-warm-100 pt-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
            ≥80% on-track
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            50–79% needs attention
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            &lt;50% follow up
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
