'use client';

/**
 * ============================================================================
 * DeepDiveDrill — `?view=deep-dive` (spec §5.3)
 * ----------------------------------------------------------------------------
 * Shot analysis, then what-if scenarios, stacked on one scroll (DD-01: the
 * two-tab switch hid the what-if behind a tap on a screen that is already
 * one level deep).
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { ShotAnalysisCard } from '@/components/golf/coachhelm/player/ShotAnalysisCard';
import { WhatIfPanel } from '@/components/golf/coachhelm/player/WhatIfPanel';
import { getPlayerWhatIf } from '@/app/golf/actions/coachhelm-data';

export interface DeepDiveDrillProps {
  playerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
}

export function DeepDiveDrill({ playerId, shotData, profileData }: DeepDiveDrillProps) {
  const { home } = useStage();
  const rawPrediction = profileData?.currentPrediction;
  const baselinePrediction =
    typeof rawPrediction === 'number' && Number.isFinite(rawPrediction) ? rawPrediction : null;

  return (
    <DrillPanel title="Deep dive" backLabel="Home" onBack={home}>
      <div className="space-y-4">
        <ShotAnalysisCard shotData={shotData ?? undefined} playerId={playerId} />
        <WhatIfPanel
          playerId={playerId}
          profileData={profileData ?? undefined}
          onSimulate={baselinePrediction == null ? undefined : async (metric, amount) => {
            // getPlayerWhatIf simulation contract (from FairwayPlayerCoachHelm).
            // Only offered when a real prediction exists (DD-01): projecting
            // from a missing prediction used `?? 0` and printed a projected
            // score of "+0.0 + change" as if the player were even par.
            const res = await getPlayerWhatIf(playerId, { metric, amount });
            if (!res.success || !res.data) {
              return { projectedScore: baselinePrediction, rankChange: 0 };
            }
            return {
              projectedScore: baselinePrediction + res.data.scenario.projectedScoringChange,
              rankChange: res.data.scenario.projectedRankChange,
            };
          }}
        />
      </div>
    </DrillPanel>
  );
}
