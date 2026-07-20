'use client';

/**
 * ============================================================================
 * PlayersDrill — `?view=players` (spec §5.4, "roster MatrixBoard + focus
 * areas", absorbs `/development`)
 * ----------------------------------------------------------------------------
 * Mounts the existing `PlayersGridView` UNCHANGED — the roster health header,
 * the ranked roster table, and its internal `FocusAreaBoard` (development
 * plans) all come along verbatim, exactly like the retired `/development`
 * route mounted it. `PlayersGridView` renders its own `CoachHelmShell`
 * internally (masthead + the now-collapsed single-tab sub-nav) — this
 * wrapper only adds the stage's own "back to Brief" chrome around it.
 * ========================================================================== */

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { PlayersGridView, type PlayersGridViewProps } from '@/components/fairway';

export type PlayersDrillProps = PlayersGridViewProps;

export function PlayersDrill(props: PlayersDrillProps) {
  const { home } = useStage();

  return (
    <DrillPanel title="Players" backLabel="Home" onBack={home}>
      <PlayersGridView {...props} />
    </DrillPanel>
  );
}
