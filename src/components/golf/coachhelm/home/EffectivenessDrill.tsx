'use client';

/**
 * ============================================================================
 * EffectivenessDrill — `?view=effectiveness` (spec §5.4, absorbs
 * `/analytics/coachhelm`)
 * ----------------------------------------------------------------------------
 * Mounts the existing `FairwayEffectiveness` cockpit content UNCHANGED. It
 * renders its own `CoachHelmShell` internally, passed `embedded` here so it
 * suppresses its masthead + sub-nav strip (the DrillPanel below owns that
 * chrome instead) — without it the drill showed two competing mastheads plus
 * a redundant single-tab strip.
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { FairwayEffectiveness, type FairwayEffectivenessProps } from '@/components/fairway';

export type EffectivenessDrillProps = FairwayEffectivenessProps;

export function EffectivenessDrill(props: EffectivenessDrillProps) {
  const { home } = useStage();

  return (
    <DrillPanel title="Effectiveness" backLabel="Home" onBack={home}>
      <FairwayEffectiveness {...props} embedded />
    </DrillPanel>
  );
}
