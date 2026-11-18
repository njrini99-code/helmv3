'use client';

import { useEffect, useState, ViewTransition, type ReactNode } from 'react';

/**
 * Whether the board's rows may hold their slide boundaries yet (pa-mot-02): false on the board's first render, true from
 * the effect after it. React 19.3 starts a document view transition, and snapshots the whole page, whenever a
 * `<ViewTransition>` mounts in a transition commit, whatever its class (react-dom `trackEnterViewTransitions` sets
 * `shouldStartViewTransition` before reading `enter`), and a navigation and a streamed page's reveal are both
 * transitions: mounted with the board, the rows' boundaries started one on every push into a qualifier, over the live
 * push (MOTION-AND-VISUAL 3.3; audit S4.8). Armed from an effect, they mount in a default-priority commit, which starts
 * none, and they are in place before any refresh can change a rank.
 */
export function useRankSlideArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);
  return armed;
}

/**
 * A leaderboard row's slide boundary (P009-B1): the row moves to a new rank only when a refresh changed the order
 * (`slide`, rank-slide.ts), and never enters, leaves or crossfades. Until `armed` the row is drawn without it.
 */
export function RankSlot({ id, slide, armed, children }: { id: string; slide: boolean; armed: boolean; children: ReactNode }) {
  if (!armed) return children;
  return (
    <ViewTransition name={`ch-rank-${id}`} update={slide ? 'ch-rank' : 'none'} enter="none" exit="none" share="none" default="none">
      {children}
    </ViewTransition>
  );
}
