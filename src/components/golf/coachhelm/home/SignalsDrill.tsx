'use client';

/**
 * ============================================================================
 * SignalsDrill — `?view=signals` (spec §5.4, "the unified Alerts/Insights/
 * Patterns workspace")
 * ----------------------------------------------------------------------------
 * Mounts the existing `FairwayCoachHelmSignals` UNCHANGED (its internals are
 * not rewritten this phase — see the plan's Task 9 note). The three former
 * sibling routes (/alerts, /insights, /patterns) now permanent-redirect into
 * this ONE `?view=signals&filter=` drill, so its "3 duplicate chrome stacks"
 * collapse to the ONE mount here. `FairwayCoachHelmSignals` renders its own
 * `CoachHelmShell` internally, passed `embedded` here so it suppresses its
 * masthead + sub-nav strip (the DrillPanel below owns that chrome instead) —
 * without it the drill showed two competing mastheads plus a redundant
 * single-tab strip.
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { FairwayCoachHelmSignals } from '@/components/fairway';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';
import type { SignalsFilterKey } from './buildCoachHomeViewModel';

export interface SignalsDrillProps {
  coachId: string;
  teamId: string;
  filter: SignalsFilterKey;
  initialInsights: EvidenceInsight[];
  initialPatterns: ExtendedPattern[];
  playerNames: Record<string, string>;
  signalCount?: number | null;
  /** Shareable deep-link params forwarded from the route (e.g. `?category=`,
   *  `?id=` from a CommandPalette result) — mirrors the old /insights route's
   *  `initialSearchParams` passthrough. */
  initialSearchParams?: Record<string, string | undefined>;
}

/** Mirrors the three former route forks' exact `defaultFilter` presets
 *  (alerts/page.tsx, insights/page.tsx, patterns/page.tsx) — copied verbatim
 *  so the consolidated drill opens each filter identically to before. */
function buildDrillProps(filter: SignalsFilterKey) {
  if (filter === 'patterns') {
    return {
      signalSource: 'patterns' as const,
      defaultFilter: { signalTypes: ['pattern' as const], groupBy: 'player' as const, view: 'grouped' as const },
      showScanTeam: false,
    };
  }
  if (filter === 'insights') {
    return {
      signalSource: 'insights' as const,
      defaultFilter: { signalTypes: ['insight' as const], smartDefault: 'new_and_critical_this_week' as const, view: 'table' as const },
      showScanTeam: false,
    };
  }
  return {
    signalSource: 'insights' as const,
    defaultFilter: {
      severity: ['critical', 'high'],
      fetchPriorities: ['urgent' as const, 'high' as const],
      status: 'active',
      signalTypes: ['insight' as const, 'pattern' as const],
    },
    showScanTeam: true,
  };
}

export function SignalsDrill({
  coachId,
  teamId,
  filter,
  initialInsights,
  initialPatterns,
  playerNames,
  signalCount,
  initialSearchParams,
}: SignalsDrillProps) {
  const { home } = useStage();
  const { signalSource, defaultFilter, showScanTeam } = buildDrillProps(filter);

  return (
    <DrillPanel title="Signals" backLabel="Home" onBack={home}>
      <FairwayCoachHelmSignals
        coachId={coachId}
        teamId={teamId}
        signalSource={signalSource}
        defaultFilter={defaultFilter}
        initialInsights={signalSource === 'insights' ? initialInsights : []}
        initialPatterns={signalSource === 'patterns' ? initialPatterns : []}
        playerNames={playerNames}
        signalCount={signalCount}
        showScanTeam={showScanTeam}
        initialSearchParams={initialSearchParams}
        embedded
      />
    </DrillPanel>
  );
}
