'use client';

import { useHelmViews } from '../../../shell/context';
import { Segmented } from '../../../ui/Segmented';

/** The views of the CoachHelm screen for a coach, and where each lives. */
export const COACHHELM_HREF = { board: '/golf/dashboard/coachhelm', brief: '/golf/dashboard/coachhelm?view=brief', ask: '/golf/dashboard/coachhelm?view=ask' } as const;
export type CoachHelmView = keyof typeof COACHHELM_HREF;

/**
 * The CoachHelm sub-tab: Team (or Board: the program pulse and the players' signals), Brief (with its flag on) and Ask (the chat).
 * Drawn for coaches only, on every view and at both widths. Choosing a view is a route change, so each is a real address that reloads
 * and shares; the segmented control's own select haptic covers the tap. (The owner's chat mockups draw only the chat; this strip is
 * the one addition, so the chat is reachable.)
 *
 * Controlled: `active` is the view the tap has chosen, at once, and `onGo` changes view (`useViewSwitch`, owned by the page, which
 * dims and is marked busy while the next view loads).
 *
 * `held`: drawn by a loading skeleton, in the place and at the size the page draws it, inert and hidden from assistive tech (the
 * skeleton's own label says it is loading), so the control does not morph from a bar into itself when the page lands.
 */
export function CoachHelmTabs({ boardLabel, active, onGo, held = false }: { boardLabel?: 'Board' | 'Team'; active: CoachHelmView; onGo?: (view: CoachHelmView) => void; held?: boolean }) {
  const views = useHelmViews();
  return (
    <div className="ch-ask-tabs" data-ch-strip="" data-ch-code={held ? undefined : 'CH-13923'} inert={held || undefined} aria-hidden={held || undefined}>
      <Segmented
        label="CoachHelm view"
        size={views.team ? 'lg' : undefined}
        value={active}
        options={[
          { value: 'board', label: boardLabel ?? (views.team ? 'Team' : 'Board') },
          ...(views.brief ? [{ value: 'brief' as const, label: 'Brief' }] : []),
          { value: 'ask', label: 'Ask' },
        ]}
        onChange={(v) => onGo?.(v)}
      />
    </div>
  );
}
