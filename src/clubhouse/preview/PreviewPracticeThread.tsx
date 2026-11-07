'use client';

import { PlanPreview } from '../screens/coachhelm/plan/PlanCard';
import { PreviewAsk } from './PreviewAsk';
import { PT_STATES } from './fixtures-practice-thread';

/** `coachhelm-practice-thread?state=`: Ask's own thread over the design page's plan. A press changes the card in place; nothing reaches a server. */
export function PreviewPracticeThread({ state }: { state?: string }) {
  const s = PT_STATES[state ?? 'card'] ?? PT_STATES.card!;
  return (
    <PlanPreview.Provider value={s.plan ?? {}}>
      <PreviewAsk messages={s.messages} busy={s.busy} state={undefined} />
    </PlanPreview.Provider>
  );
}
