/**
 * v3 StandingBar — public entry point.
 *
 * Dispatches to the size-variant component (Card / Inline / Hero). All
 * three variants share the same {@link StandingBarProps} surface and
 * the same five render states (happy / cold-start / loading / error /
 * empty) per master plan Part XXV verification checklist.
 *
 * Usage:
 *
 *   import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
 *
 *   <StandingBar
 *     metric_id="putts_made_10_15ft_pct"
 *     metric_label="10-15 ft Putting"
 *     player_value={38}
 *     team_avg={41}
 *     team_n={6}
 *     team_pct={18}
 *     pga_value={36}
 *     direction="higher_better"
 *     unit="percent"
 *     scale={{ min: 0, max: 60 }}
 *     size="card"
 *   />
 */

import { Card } from './Card';
import { Inline } from './Inline';
import { Hero } from './Hero';
import type { StandingBarProps } from './types';

export function StandingBar(props: StandingBarProps) {
  switch (props.size) {
    case 'inline': return <Inline {...props} />;
    case 'hero':   return <Hero {...props} />;
    case 'card':
    default:       return <Card {...props} />;
  }
}

export type {
  StandingBarProps,
  Direction,
  Unit,
  SizeVariant,
  RenderState,
} from './types';

export {
  toScalePct,
  formatValue,
  deltaVsTeam,
  teamCohortText,
  deriveState,
  shouldShowTeamMarker,
  deriveAriaLabel,
} from './utils';
