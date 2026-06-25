'use client';

// =============================================================================
// src/components/lifting/soreness/HighPrioritySorenessList.tsx
//
// Coach-facing "Needs Review" list — athletes with overuse flags.
// Uses coach language, NOT medical language (spec §13).
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertCircle, IconCheckCircle2 } from '@/components/icons';
import type { AthleteRequestSummary } from '@/app/lifting/actions/soreness';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  athletes: AthleteRequestSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(max: number | null): string {
  if (max === null) return 'text-warm-400';
  if (max >= 7) return 'text-red-600';
  if (max >= 5) return 'text-amber-600';
  return 'text-yellow-600';
}

function SeverityPill({ severity }: { severity: number }) {
  const cls =
    severity >= 7 ? 'bg-red-100 text-red-700' :
    severity >= 5 ? 'bg-amber-100 text-amber-700' :
    severity >= 3 ? 'bg-yellow-100 text-yellow-700' :
    'bg-warm-100 text-warm-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {severity}/10
    </span>
  );
}

function AthleteCard({ summary }: { summary: AthleteRequestSummary }) {
  const name = [summary.firstName, summary.lastName].filter(Boolean).join(' ') || 'Athlete';
  const topRegions = summary.regions
    .slice()
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4">
      {/* Name + position */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-warm-900">{name}</p>
          {summary.position && (
            <p className="text-xs text-warm-500 mt-0.5">{summary.position}</p>
          )}
        </div>
        {summary.maxSeverity !== null && (
          <SeverityPill severity={summary.maxSeverity} />
        )}
      </div>

      {/* Flags */}
      <div className="space-y-1">
        {summary.flags.map((flag, i) => (
          <div key={i} className="flex items-start gap-2">
            <IconAlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">{flag.label}</p>
          </div>
        ))}
      </div>

      {/* Top regions */}
      {topRegions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topRegions.map((r, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-0.5 text-eyebrow font-medium ${severityColor(r.severity)} bg-cream-50 border border-warm-200`}
            >
              {r.body_region.replace(/_/g, ' ')} · {r.severity}/10
            </span>
          ))}
        </div>
      )}

      {/* Coach actions */}
      <p className="text-xs text-warm-400 italic">
        Soreness pattern worth checking before today&apos;s session.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HighPrioritySorenessList({ athletes }: Props) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="space-y-3"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <IconAlertCircle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-warm-900">Needs Review</h3>
        {athletes.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {athletes.length}
          </span>
        )}
      </div>

      {athletes.length === 0 ? (
        <Card variant="flat">
          <CardContent className="py-8">
            <EmptyState
              icon={<IconCheckCircle2 size={28} className="text-primary-400" />}
              title="No athletes flagged today"
              description="All check-ins look good — no overuse patterns detected."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {athletes.map((a) => (
            <AthleteCard key={a.athleteId} summary={a} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
