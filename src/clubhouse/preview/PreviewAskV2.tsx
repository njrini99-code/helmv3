'use client';

import { useEffect } from 'react';
import { PlanPreview } from '../screens/coachhelm/plan/PlanCard';
import { PreviewAsk } from './PreviewAsk';
import { ASK_STAGE_STATE, askFlowMessages, askIdRoute } from './fixtures-ask-flows';

/** The route's taps, one at a time, each waiting until its control exists: a person's path, so the fixture stays out of the screens' code. */
function usePress(press: readonly string[] | undefined, type: string | undefined) {
  const key = (press ?? []).join('|');
  useEffect(() => {
    if (!key && !type) return;
    const list = key ? key.split('|') : [];
    const find = (label: string) => Array.from(document.querySelectorAll<HTMLElement>('button, [role="menuitem"], a')).find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label')?.startsWith(label));
    let at = 0;
    let typed = !type;
    const timer = setInterval(() => {
      if (!typed) {
        const box = document.querySelector<HTMLTextAreaElement>('.ch-ask-cmp textarea, textarea');
        if (!box) return;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, type);
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.focus();
        typed = true;
      }
      if (at >= list.length) return clearInterval(timer);
      const found = find(list[at]!);
      if (found) {
        found.click();
        at += 1;
      }
    }, 300);
    return () => clearInterval(timer);
  }, [key, type]);
}

/**
 * `coachhelm-ask-v2?id=&scene=&stage=&viewer=` (05, AK0): the page's scene at its stage, so `capture.mjs` shoots the new Ask. `[data-ch-ak-ready]` tells it the page is up.
 * `id` is the state's own route (05). Without `scene` or `id` it takes today's `?state=`.
 */
export function PreviewAskV2({ id, state, kind, scene, stage, viewer }: { id?: string; state?: string; kind?: string; scene?: string; stage?: string; viewer?: string }) {
  const route = askIdRoute(id);
  usePress(route?.press, route?.type);
  const flow = route?.flow ?? (scene && stage ? askFlowMessages(scene, stage) : null);
  const mapped = !state && stage ? ASK_STAGE_STATE[stage] : undefined;
  const page = <PreviewAsk v2 state={flow ? undefined : (state ?? (stage === 'home' ? undefined : mapped))} kind={kind} messages={flow?.messages} busy={flow?.busy} role={viewer === 'player' ? 'player' : undefined} />;
  return (
    <div data-ch-ak-ready="1" style={{ display: 'contents' }}>
      {route?.plan ? <PlanPreview.Provider value={route.plan}>{page}</PlanPreview.Provider> : page}
    </div>
  );
}
