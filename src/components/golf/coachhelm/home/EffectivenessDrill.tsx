'use client';

/**
 * ============================================================================
 * EffectivenessDrill — `?view=effectiveness` (spec §5.4, absorbs
 * `/analytics/coachhelm`)
 * ----------------------------------------------------------------------------
 * Mounts the existing `FairwayEffectiveness` cockpit content UNCHANGED. It
 * renders its own `CoachHelmShell` internally (masthead + the now-collapsed
 * single-tab sub-nav) — this wrapper only adds the stage's own "back to
 * Brief" chrome around it, same as every other drill on this surface.
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { FairwayEffectiveness, type FairwayEffectivenessProps } from '@/components/fairway';

export type EffectivenessDrillProps = FairwayEffectivenessProps;

export function EffectivenessDrill(props: EffectivenessDrillProps) {
  const { home } = useStage();

  return (
    <DrillPanel title="Effectiveness" backLabel="Home" onBack={home}>
      <FairwayEffectiveness {...props} />
    </DrillPanel>
  );
}
