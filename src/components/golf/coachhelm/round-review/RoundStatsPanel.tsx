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
 * `getDetailedStats(playerId, roundId)` has always been able to compute the
 * whole set for a SINGLE round — the round-scoping parameter was fully
 * implemented and simply never called with a real round id. Nothing here
 * recomputes anything; this component only renders what that call returns.
 *
 * Two things changed on 2026-08-16, both from an owner report that this
 * surface "was never added" the treatment the stats page got:
 *
 *   1. The layout is now the shared `RoundStatReport` — numbered categories in
 *      playing order, each with its own denominator in the header and a sample
 *      size under every figure the calculator counts. The same component backs
 *      the round-scoped view of `/golf/dashboard/stats`, so the two surfaces
 *      cannot drift into two different answers for one round.
 *   2. Make % by break IS now rendered. This file previously carried a footer
 *      reading "Make % by break isn't shown — break is recorded per putt, but
 *      there is no make-rate-by-break calculation to read from yet." That was
 *      false: `GolfStats.puttingByBreak` has carried `makePct0_3…makePct35Plus`
 *      plus a per-cell `count*` the whole time, and `PuttingDrill` renders
 *      exactly that matrix on the stats page. It was the one item on the
 *      coach's list of eight he was told was impossible, and it is in fact the
 *      best-sampled block in the report.
 *
 * HONEST EMPTY STATES are unchanged and still the rule: one round is a tiny
 * sample, a player who never found a bunker has no sand-save rate, and that is
 * not zero. Every metric renders through `Readout state="awaiting"` when its
 * value is null (see .claude/rules/golf-review.md: "honest empty/error states
 * (no fabricated zeros)").
 * ========================================================================== */

import { Surface, InlineNotice, Skeleton, Button } from '@/components/fairway';
import { RotateCw } from 'lucide-react';
import { RoundStatReport } from '@/components/golf/stats/round-report/RoundStatReport';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

export interface RoundStatsPanelProps {
  stats: GolfStats | null;
  loading: boolean;
  /** True when the fetch FAILED — distinct from "this round has no shot detail". */
  error: boolean;
  onRetry: () => void;
  className?: string;
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

  // Preserved from the previous implementation: a null `stats` is "not asked
  // for yet", which renders nothing at all. It is NOT the same as a round with
  // no shot detail — `RoundStatReport` owns that state and says so in words.
  if (!stats) return null;

  return <RoundStatReport stats={stats} className={className} />;
}
