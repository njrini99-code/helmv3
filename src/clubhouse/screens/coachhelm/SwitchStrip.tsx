'use client';

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { DeskTop } from '../../shell/phone-chrome';
import { CoachHelmTabs, type CoachHelmView } from './chat/SubTabs';
import { PlayerHelmTabs, type PlayerHelmTab } from './views/PlayerHelmTabs';

/** Whose switch: the coach's Team and Ask, or the player's Board, Standing, Deep dive (and Ask). */
export type CoachHelmSwitchStripProps =
  | { who: 'coach'; active: CoachHelmView; onGo?: (view: CoachHelmView) => void; held?: boolean }
  | { who: 'player'; active: PlayerHelmTab; onGo?: (view: PlayerHelmTab) => void; held?: boolean };

/**
 * The CoachHelm view switch's one place (N13C-67, N13P-18; production audit 2026-11-15 P1-7, P1-19): the same row for every view
 * of the page, never inside a view, so it stands still while the view under it changes. On a desk it is the first thing in the glass
 * top bar, beside the section's name (the Team page drew its switch there already, FID-TEAM-3), and a view's own scope line follows
 * it there; on the phone it is a 52px row at the top of the page, under the bar. It was drawn by each view in that view's own header,
 * so it sat in a different place on each (the player's at x 884, 822 and 66 on Board, Standing and Ask) and was drawn again on
 * every switch.
 *
 * `held`: drawn by the route's loading skeleton (loading.tsx), in the same place, inert and hidden from assistive tech, so the
 * switch does not move or change from a bar into itself when the page lands.
 */
export function CoachHelmSwitchStrip(props: CoachHelmSwitchStripProps) {
  const phone = useChPhone();
  const held = props.held ?? false;
  const tabs = props.who === 'coach' ? <CoachHelmTabs active={props.active} onGo={props.onGo} boardLabel="Team" held={held} /> : <PlayerHelmTabs active={props.active} onGo={props.onGo} held={held} />;
  const row = (
    <div className={'ch-hsw' + (phone ? ' is-phone' : '')} data-ch-switch={props.who} inert={held || undefined} aria-hidden={held || undefined}>
      {tabs}
    </div>
  );
  return phone ? row : <DeskTop>{row}</DeskTop>;
}

/** For loading.tsx: the switch, held, where the page draws it, over the view's skeleton. */
export function CoachHelmHeldSwitch({ children, ...strip }: CoachHelmSwitchStripProps & { children: ReactNode }) {
  return (
    <>
      <CoachHelmSwitchStrip {...strip} held />
      {children}
    </>
  );
}

/** Set by the switch's frame: a view that is off says so here, and the frame stops drawing the switch. */
export const CoachHelmSwitchOff = createContext<((off: boolean) => void) | null>(null);

/**
 * CoachHelm is off for this coach or player (CH-13304, CH-13305): nothing the switch leads to would read, so a view that finds it off
 * hides the frame's switch, as each view hid its own. Outside a frame (a coach's view of one player, the preview) it does nothing.
 */
export function useCoachHelmSwitchOff(off: boolean): void {
  const set = useContext(CoachHelmSwitchOff);
  useLayoutEffect(() => {
    if (!set || !off) return;
    set(true);
    return () => set(false);
  }, [set, off]);
}
