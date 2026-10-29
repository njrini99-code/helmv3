'use client';

import { Segmented } from '../../../ui/Segmented';

/** The two views of the CoachHelm screen for a coach, and where each lives. */
export const COACHHELM_HREF = { board: '/golf/dashboard/coachhelm', ask: '/golf/dashboard/coachhelm?view=ask' } as const;
export type CoachHelmView = keyof typeof COACHHELM_HREF;

/**
 * The CoachHelm sub-tab: Board (the program pulse and the players' signals) and Ask (the chat).
 * Drawn for coaches only, on both views and at both widths. Choosing a view is a route change, so each
 * is a real address that reloads and shares; the segmented control's own select haptic covers the tap.
 * (The owner's chat mockups draw only the chat; this strip is the one addition, so the chat is reachable.)
 *
 * Controlled: `active` is the view the tap has chosen, at once, and `onGo` changes view (`useViewSwitch`, owned by the page, which
 * dims and is marked busy while the next view loads).
 *
 * `held`: drawn by a loading skeleton, in the place and at the size the page draws it, inert and hidden from assistive tech (the
 * skeleton's own label says it is loading), so the control does not morph from a bar into itself when the page lands.
 */
export function CoachHelmTabs({ active, onGo, held = false }: { active: CoachHelmView; onGo?: (view: CoachHelmView) => void; held?: boolean }) {
  return (
    <div className="ch-ask-tabs" data-ch-strip="" data-ch-code={held ? undefined : 'CH-13923'} inert={held || undefined} aria-hidden={held || undefined}>
      <Segmented
        label="CoachHelm view"
        value={active}
        options={[
          { value: 'board', label: 'Board' },
          { value: 'ask', label: 'Ask' },
        ]}
        onChange={(v) => onGo?.(v)}
      />
    </div>
  );
}
