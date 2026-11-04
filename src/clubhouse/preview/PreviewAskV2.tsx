'use client';

import { PreviewAsk } from './PreviewAsk';
import { ASK_STAGE_STATE, askFlowMessages } from './fixtures-ask-flows';

/**
 * `coachhelm-ask-v2?id=&scene=&stage=&viewer=` (05, AK0): the page's scene at its stage, so `capture.mjs` shoots the new Ask. `[data-ch-ak-ready]` tells it the fixture is drawn.
 * Without `scene` it takes today's `?state=`.
 */
export function PreviewAskV2({ state, kind, scene, stage, viewer }: { state?: string; kind?: string; scene?: string; stage?: string; viewer?: string }) {
  const flow = scene && stage ? askFlowMessages(scene, stage) : null;
  const mapped = !state && stage ? ASK_STAGE_STATE[stage] : undefined;
  return (
    <div data-ch-ak-ready="1" style={{ display: 'contents' }}>
      <PreviewAsk v2 state={flow ? undefined : (state ?? (stage === 'home' ? undefined : mapped))} kind={kind} messages={flow?.messages} busy={flow?.busy} role={viewer === 'player' ? 'player' : undefined} />
    </div>
  );
}
