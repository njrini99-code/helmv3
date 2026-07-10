'use client';

/**
 * ============================================================================
 * RoundIntelligence — the "what today's round says" CoachHelm panel
 * ----------------------------------------------------------------------------
 * The round review computes two pieces of CoachHelm intelligence that the page
 * barely surfaces:
 *   • review.strokesToGain[] — a ranked list of this round's biggest stroke
 *     leaks (Putting / Short Game / Approach / Course Mgmt) with an estimated
 *     savings each. Today it only leaks out as ONE buried text recommendation.
 *   • review.coachHelm — the per-round practice priority + focus areas, of
 *     which only the primary takeaway bubbles up as the hero.
 *
 * This additive, redesign-gated panel renders both honestly:
 *   1. WHERE TODAY'S STROKES WENT — a ranked opportunity board (biggest leak
 *      first). NOT a diverging strokes-gained tornado: these are all-positive
 *      "could-have-saved" estimates, not signed SG-vs-Tour, so a single-tone
 *      magnitude bar + an explicit "estimates — directional, not exact" caveat
 *      is the truthful encoding.
 *   2. TAKE TO THE RANGE — the practice priority + focus-area chips + an honest
 *      confidence read.
 *
 * Decoupled by design: takes plain shapes (no import from the server-action
 * module). Renders nothing when neither piece has content.
 * ========================================================================== */

import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { InsightCallout } from '@/components/golf/coachhelm/insights/InsightCallout';

interface RoundOpportunity {
  category: string;
  potentialStrokes: number;
  description: string;
}

interface RoundCoachHelm {
  summary?: string;
  primaryTakeaway?: string;
  practicePriority?: string;
  focusAreas?: string[];
  confidence?: number;
}

export interface RoundIntelligenceProps {
  strokesToGain?: RoundOpportunity[];
  coachHelm?: RoundCoachHelm | null;
  className?: string;
}

export function RoundIntelligence({ strokesToGain = [], coachHelm, className }: RoundIntelligenceProps) {
  const opps = [...strokesToGain]
    .filter((o) => o.potentialStrokes > 0)
    .sort((a, b) => b.potentialStrokes - a.potentialStrokes)
    .slice(0, 4);
  const maxStrokes = opps.reduce((m, o) => Math.max(m, o.potentialStrokes), 0) || 1;
  const totalGain = opps.reduce((s, o) => s + o.potentialStrokes, 0);
  const hasOpps = opps.length > 0;

  const priority = coachHelm?.practicePriority || coachHelm?.primaryTakeaway || '';
  const focusAreas = coachHelm?.focusAreas ?? [];
  const hasCoach = Boolean(priority || focusAreas.length);

  if (!hasOpps && !hasCoach) return null;

  return (
    <InstrumentPanel
      depth="base"
      className={className}
      eyebrow="CoachHelm · this round"
      header="Where today's strokes went"
    >
      <div className="space-y-5">
        {hasOpps ? (
          <div className="space-y-3">
            <p className="text-body-sm text-text-secondary">
              An estimated{' '}
              <span className="font-medium text-text-primary">~{totalGain.toFixed(1)} strokes</span> were
              left on the table — biggest first.
            </p>
            <div className="space-y-2.5">
              {opps.map((o) => (
                <div key={o.category} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-sm font-medium text-text-primary">{o.category}</span>
                    <span className="shrink-0 font-fw-mono text-body-sm tabular-nums text-fw-warning">
                      ~{o.potentialStrokes.toFixed(1)} str
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-fw-warning"
                      style={{ width: `${((o.potentialStrokes / maxStrokes) * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <p className="text-caption text-text-tertiary">{o.description}</p>
                </div>
              ))}
            </div>
            <p className="text-caption text-text-tertiary">
              Estimates from this round&rsquo;s shot data — directional, not exact.
            </p>
          </div>
        ) : null}

        {hasCoach ? (
          <InsightCallout label="Take to the range">
            {priority ? <p className="text-body-sm text-text-primary">{priority}</p> : null}
            {focusAreas.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {focusAreas.slice(0, 3).map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-caption text-text-secondary"
                  >
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
            {typeof coachHelm?.confidence === 'number' ? (
              <p className="mt-2 text-caption text-text-tertiary">
                CoachHelm read · {Math.round(coachHelm.confidence * 100)}% confidence
              </p>
            ) : null}
          </InsightCallout>
        ) : null}
      </div>
    </InstrumentPanel>
  );
}
