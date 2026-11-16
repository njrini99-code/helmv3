import type { ReactNode } from 'react';
import { DeskSlot, PhoneChromeProvider } from '../../../shell/phone-chrome';
import type { CoachHelmView } from '../chat/SubTabs';
import { CoachHelmSwitchFrame } from '../SwitchFrame';
import type { PlayerHelmTab } from '../views/PlayerHelmTabs';

/**
 * A CoachHelm view as the route composes it (N13C-67, N13P-18): under the one switch the route mounts above it, with the desk's
 * top-bar slot the switch is drawn into on a desk (the phone draws it as a row before the view).
 */
export function underSwitch(active: PlayerHelmTab, view: ReactNode, who?: 'player'): ReactNode;
export function underSwitch(active: CoachHelmView, view: ReactNode, who: 'coach'): ReactNode;
export function underSwitch(active: string, view: ReactNode, who: 'player' | 'coach' = 'player'): ReactNode {
  return (
    <PhoneChromeProvider>
      <DeskSlot />
      {who === 'coach' ? (
        <CoachHelmSwitchFrame who="coach" active={active as CoachHelmView}>
          {view}
        </CoachHelmSwitchFrame>
      ) : (
        <CoachHelmSwitchFrame who="player" active={active as PlayerHelmTab}>
          {view}
        </CoachHelmSwitchFrame>
      )}
    </PhoneChromeProvider>
  );
}
