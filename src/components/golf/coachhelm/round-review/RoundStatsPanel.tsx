'use client';

/**
 * ============================================================================
 * Round Review · full per-round stat panel
 * ----------------------------------------------------------------------------
 * Coach report (2026-08-13), verbatim: "If i go to my roster and click on a
 * player, I can see all 75 or so stats we are tracking, but that is all their
 * rounds combined. If I try to look at a specific round, it does not give all
 * the stats." He then listed exactly what Round Review was missing:
 *
 *     putts per hole · putts per GIR · proximity to the hole · all the
 *     efficiencies for approach · make % of putts based on break · GIR based
 *     on lie · FW % par 4 vs par 5 · GIR par 3/4/5
 *
 * Seven of those eight already existed as real fields on `GolfStats`, and
 * `getDetailedStats(playerId, roundId)` has always been able to compute the
 * whole set for a SINGLE round — the round-scoping parameter was fully
 * implemented and simply never called with a real round id. Nothing here
 * recomputes anything; this component only renders what that call returns.
 *
 * The eighth — make % by break — is NOT rendered, deliberately. The only break
 * data in the model is `putt_break` / `firstPuttBreak`, raw per-putt strings
 * on individual shots. There is no make-rate-by-break aggregate to read, and
 * inventing one here would put a number on screen that no calculator produced.
 * It is called out in the panel footer instead of quietly omitted.
 *
 * HONEST EMPTY STATES. One round is a tiny sample: a player who never found a
 * bunker has no sand-save rate, and that is not zero. Every metric renders
 * through `Readout state="awaiting"` when its value is null, so a missing
 * sample reads as "—" rather than a fabricated 0%. This is the same rule the
 * stats page follows (see .claude/rules/golf-review.md: "honest empty/error
 * states (no fabricated zeros)").
 * ========================================================================== */

import { Surface, Readout, InlineNotice, Skeleton, Button } from '@/components/fairway';
import { RotateCw } from 'lucide-react';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

export interface RoundStatsPanelProps {
  stats: GolfStats | null;
  loading: boolean;
  /** True when the fetch FAILED — distinct from "this round has no shot detail". */
  error: boolean;
  onRetry: () => void;
  className?: string;
}

type Metric = { label: string; value: number | null; unit?: string; decimals?: number };

function MetricGrid({ title, note, metrics }: { title: string; note?: string; metrics: Metric[] }) {
  // A group with nothing measurable is hidden rather than rendered as a row of
  // dashes — an all-empty card is noise, but a single empty metric beside
  // populated siblings is information.
  if (metrics.every((m) => m.value === null)) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="text-fw-xs uppercase tracking-wide text-text-tertiary">{title}</h4>
        {note ? <p className="mt-0.5 text-fw-xs text-text-tertiary">{note}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <Readout
            key={m.label}
            label={m.label}
            size="sm"
            state={m.value === null ? 'awaiting' : 'live'}
            display={
              m.value === null
                ? undefined
                : `${m.value.toFixed(m.decimals ?? (m.unit === '%' ? 0 : 1))}${m.unit ?? ''}`
            }
          />
        ))}
      </div>
    </div>
  );
}

export function RoundStatsPanel({ stats, loading, error, onRetry, className }: RoundStatsPanelProps) {
  if (loading) {
    return (
      <Surface padding="lg" className={className}>
        <Skeleton className="h-[280px] rounded-fw-lg" />
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice
          tone="danger"
          title="Couldn't load this round's stats"
          action={
            <Button variant="secondary" size="sm" leftIcon={<RotateCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>
              Try again
            </Button>
          }
        >
          The review above is unaffected — only the full stat breakdown failed to load.
        </InlineNotice>
      </Surface>
    );
  }

  if (!stats) return null;

  const groups: { title: string; note?: string; metrics: Metric[] }[] = [
    {
      title: 'Putting',
      metrics: [
        { label: 'Putts / hole', value: stats.puttsPerHole },
        { label: 'Putts / GIR', value: stats.puttsPerGir },
        { label: '3-putts', value: stats.threePuttsTotal, decimals: 0 },
        { label: 'Make 0–3ft', value: stats.puttMakePct0_3, unit: '%' },
        { label: 'Make 3–5ft', value: stats.puttMakePct3_5, unit: '%' },
        { label: 'Make 5–10ft', value: stats.puttMakePct5_10, unit: '%' },
        { label: 'Make 10–15ft', value: stats.puttMakePct10_15, unit: '%' },
        { label: 'Make 15–20ft', value: stats.puttMakePct15_20, unit: '%' },
      ],
    },
    {
      title: 'Approach — proximity',
      note: 'Average distance to the hole after the approach shot, in feet.',
      metrics: [
        { label: 'All approaches', value: stats.approachProximityAvg },
        { label: 'When green hit', value: stats.approachProximityWhenHitGreen },
        { label: 'When missed', value: stats.approachProximityWhenMissedGreen },
        { label: 'From fairway', value: stats.approachProximityFairway },
        { label: 'From rough', value: stats.approachProximityRough },
        { label: 'From sand', value: stats.approachProximitySand },
      ],
    },
    {
      title: 'Approach — GIR by distance',
      note: 'Greens hit in regulation, split by approach distance in yards.',
      metrics: [
        { label: '50–75y', value: stats.girPct50_75, unit: '%' },
        { label: '75–100y', value: stats.girPct75_100, unit: '%' },
        { label: '100–125y', value: stats.girPct100_125, unit: '%' },
        { label: '125–150y', value: stats.girPct125_150, unit: '%' },
        { label: '150–175y', value: stats.girPct150_175, unit: '%' },
        { label: '175–200y', value: stats.girPct175_200, unit: '%' },
        { label: '200–225y', value: stats.girPct200_225, unit: '%' },
        { label: '225y+', value: stats.girPct225Plus, unit: '%' },
      ],
    },
    {
      title: 'GIR by lie',
      note: 'Where the approach was played from.',
      metrics: [
        { label: 'From fairway', value: stats.girPctFromFairway, unit: '%' },
        { label: 'From rough', value: stats.girPctFromRough, unit: '%' },
        { label: 'From sand', value: stats.girPctFromSand, unit: '%' },
      ],
    },
    {
      title: 'By hole type',
      metrics: [
        { label: 'FW % par 4', value: stats.fairwayPctPar4, unit: '%' },
        { label: 'FW % par 5', value: stats.fairwayPctPar5, unit: '%' },
        { label: 'GIR par 3', value: stats.girPctPar3, unit: '%' },
        { label: 'GIR par 4', value: stats.girPctPar4, unit: '%' },
        { label: 'GIR par 5', value: stats.girPctPar5, unit: '%' },
      ],
    },
    {
      title: 'Short game',
      metrics: [
        { label: 'Scrambling', value: stats.scramblingPercentage, unit: '%' },
        { label: 'From fairway', value: stats.scramblingPctFairway, unit: '%' },
        { label: 'From rough', value: stats.scramblingPctRough, unit: '%' },
        { label: 'From sand', value: stats.scramblingPctSand, unit: '%' },
      ],
    },
  ];

  const rendered = groups.filter((g) => g.metrics.some((m) => m.value !== null));

  if (rendered.length === 0) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice tone="info" title="No shot detail for this round">
          These breakdowns are computed from logged shots. This round was saved as a scorecard
          only, so there is nothing to break down.
        </InlineNotice>
      </Surface>
    );
  }

  return (
    <Surface padding="lg" className={className}>
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-fw-base font-medium text-text-primary">Full round stats</h3>
          <p className="mt-1 text-fw-sm text-text-secondary">
            Every tracked stat for this round alone. A dash means this round had no sample for
            that metric — not a zero.
          </p>
        </div>

        {rendered.map((g) => (
          <MetricGrid key={g.title} title={g.title} note={g.note} metrics={g.metrics} />
        ))}

        {/* Named rather than silently dropped: the coach asked for this one and it is the
            only item on his list with no aggregate behind it. */}
        <p className="text-fw-xs text-text-tertiary">
          Make % by break isn&apos;t shown — break is recorded per putt, but there is no
          make-rate-by-break calculation to read from yet.
        </p>
      </div>
    </Surface>
  );
}
