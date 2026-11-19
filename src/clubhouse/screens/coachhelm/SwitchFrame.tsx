'use client';

import { useState, type ReactNode } from 'react';
import { PLAYER_HELM_VIEWS } from '../../data/coachhelm-views-shape';
import { useBusy } from '../../lib/use-busy';
import { useHelmViews } from '../../shell/context';
import { AskSkeleton } from './chat/AskSkeleton';
import { COACHHELM_HREF, type CoachHelmView } from './chat/SubTabs';
import { YourWeekSkeleton } from './file/YourWeekSkeleton';
import { CoachHelmSwitchOff, CoachHelmSwitchStrip } from './SwitchStrip';
import { TeamBoardSkeleton } from './team/TeamBoardSkeleton';
import { useViewSwitch } from './use-view-switch';
import { playerHelmTabHref, type PlayerHelmTab } from './views/PlayerHelmTabs';
import { DiveSkeleton, StandingSkeleton } from './views/Skeletons';

const COACH_VIEWS: readonly CoachHelmView[] = ['board', 'ask'];

/** The skeleton of the view a switch is on its way to, in that view's final shape (the route's own fallback for it). */
export function switchSkeleton(who: 'coach' | 'player', view: CoachHelmView | PlayerHelmTab): ReactNode {
  if (who === 'coach') return view === 'ask' ? <AskSkeleton /> : <TeamBoardSkeleton />;
  if (view === 'ask') return <AskSkeleton player />;
  if (view === 'standing') return <StandingSkeleton />;
  if (view === 'deep-dive') return <DiveSkeleton />;
  return <YourWeekSkeleton />;
}

export type CoachHelmSwitchFrameProps = { who: 'coach'; active: CoachHelmView; children: ReactNode } | { who: 'player'; active: PlayerHelmTab; children: ReactNode };

/**
 * The views of the CoachHelm page that the switch moves between (the coach's Team and Ask; the player's Board, Standing, Deep dive
 * and Ask), drawn under one switch that the route mounts once, above the view, in the same place for every view of the role
 * (N13C-67, N13P-18; production audit 2026-11-15 P1-7, P1-19). Each view is still its own server render behind its own address; the
 * page's segment is not keyed by its query, so this frame and its switch stay mounted while the view under them changes.
 *
 * A switch is drawn on the client. The tap moves the switch at once (one selection tick, the control's own), and the view under it
 * becomes the next view's skeleton in the same commit, never the old view held for seconds while the server renders the next (it was
 * held, dimmed, for 2.7 to 3.3 s). The skeleton's frame is there in the first frame and its blocks wait the busy delay (shell.css
 * `ch-busy-wait`), so a view that lands within 150 ms never shows one; once they show they hold at least the busy hold (`useBusy`,
 * MOTION-AND-VISUAL 3.9), and the view's own Suspense (the same skeleton, chained) then holds the place until its reads land.
 *
 * The other views are prefetched when the page is idle (`useViewSwitch`): only the route's own prefetch, which stops at its loading
 * boundary. A CoachHelm address is never fetched whole ahead of the tap (CH-R1): its loaders record every read they return as shown.
 */
export function CoachHelmSwitchFrame(props: CoachHelmSwitchFrameProps) {
  const helmViews = useHelmViews();
  const coach = props.who === 'coach';
  const views: readonly string[] = coach ? COACH_VIEWS : helmViews.playerAsk ? [...PLAYER_HELM_VIEWS, 'ask'] : PLAYER_HELM_VIEWS;
  const hrefOf = (v: string) => (coach ? COACHHELM_HREF[v as CoachHelmView] : playerHelmTabHref(v as PlayerHelmTab));
  const sw = useViewSwitch<string>(props.active, hrefOf, views);
  const switching = sw.pending && sw.shown !== props.active;
  const phase = useBusy(switching);
  const [off, setOff] = useState(false);
  const strip = coach ? (
    <CoachHelmSwitchStrip who="coach" active={sw.shown as CoachHelmView} onGo={sw.go} />
  ) : (
    <CoachHelmSwitchStrip who="player" active={sw.shown as PlayerHelmTab} onGo={sw.go} />
  );
  return (
    <CoachHelmSwitchOff.Provider value={setOff}>
      {!off && strip}
      {switching || phase === 'skeleton' ? switchSkeleton(props.who, sw.shown as CoachHelmView | PlayerHelmTab) : props.children}
    </CoachHelmSwitchOff.Provider>
  );
}
