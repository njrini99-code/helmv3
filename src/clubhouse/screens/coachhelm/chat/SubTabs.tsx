'use client';

import { useRouter } from 'next/navigation';
import { Segmented } from '../../../ui/Segmented';

/** The two views of the CoachHelm screen for a coach, and where each lives. */
export const COACHHELM_HREF = { board: '/golf/dashboard/coachhelm', ask: '/golf/dashboard/coachhelm?view=ask' } as const;

/**
 * The CoachHelm sub-tab: Board (the program pulse and the players' signals) and Ask (the chat).
 * Drawn for coaches only, on both views and at both widths. Choosing a view is a route change, so each
 * is a real address that reloads and shares; the segmented control's own select haptic covers the tap.
 * (The owner's chat mockups draw only the chat; this strip is the one addition, so the chat is reachable.)
 */
export function CoachHelmTabs({ active }: { active: 'board' | 'ask' }) {
  const router = useRouter();
  return (
    <div className="ch-ask-tabs" data-ch-code="CH-13923">
      <Segmented
        label="CoachHelm view"
        value={active}
        options={[
          { value: 'board', label: 'Board' },
          { value: 'ask', label: 'Ask' },
        ]}
        onChange={(v) => router.push(COACHHELM_HREF[v])}
      />
    </div>
  );
}
