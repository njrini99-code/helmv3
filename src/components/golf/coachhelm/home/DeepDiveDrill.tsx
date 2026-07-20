'use client';

/**
 * ============================================================================
 * DeepDiveDrill — `?view=deep-dive` (spec §5.3)
 * ----------------------------------------------------------------------------
 * Shot analysis + what-if scenarios, reusing `ShotAnalysisCard`/`WhatIfPanel`
 * UNCHANGED (ported verbatim from `FairwayPlayerCoachHelm`'s collapsible
 * "Deep dive analysis" section — the stage door replaces the disclosure).
 * ========================================================================== */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/fairway';
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

  return (
    <DrillPanel title="Deep dive" backLabel="Home" onBack={home}>
      <Tabs defaultValue="shot-analysis" className="gap-3">
        <TabsList className="justify-end">
          <TabsTrigger value="shot-analysis">Shot analysis</TabsTrigger>
          <TabsTrigger value="what-if">What if</TabsTrigger>
        </TabsList>

        <TabsContent value="shot-analysis">
          <ShotAnalysisCard shotData={shotData ?? undefined} playerId={playerId} />
        </TabsContent>

        <TabsContent value="what-if">
          <WhatIfPanel
            playerId={playerId}
            profileData={profileData ?? undefined}
            onSimulate={async (metric, amount) => {
              // PRESERVED: getPlayerWhatIf simulation contract (verbatim from
              // FairwayPlayerCoachHelm).
              const baseline = (profileData?.currentPrediction as number | undefined) ?? 0;
              const res = await getPlayerWhatIf(playerId, { metric, amount });
              if (!res.success || !res.data) {
                return { projectedScore: baseline, rankChange: 0 };
              }
              return {
                projectedScore: baseline + res.data.scenario.projectedScoringChange,
                rankChange: res.data.scenario.projectedRankChange,
              };
            }}
          />
        </TabsContent>
      </Tabs>
    </DrillPanel>
  );
}
