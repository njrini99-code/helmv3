'use client';

import { useEffect } from 'react';
import { PlanPreview } from '../screens/coachhelm/plan/PlanCard';
import { QcSeam } from '../shell/quick-chat/qc-seam';
import { PreviewAsk } from './PreviewAsk';
import { ASK_PLAYERS } from './fixtures-ask-thread';
import { ASK_PREVIEW_WEEK, ASK_STAGE_STATE, askFlowMessages, askIdRoute } from './fixtures-ask-flows';

/** Undo and the end of its window, answered here so the whole receipt can be walked: nothing reaches the server. */
function useFakeActions() {
  useEffect(() => {
    const real = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/coachhelm/v3/chat/actions/')) return real(input, init);
      const receipt = { status: 'completed', action: 'Done', summary: 'Done', created: [{ kind: 'row', count: 1, href: '/golf/dashboard/calendar' }], notifications: [{ channel: 'push', recipients: ASK_PLAYERS.length, status: 'sent' }] };
      return Promise.resolve(new Response(JSON.stringify(init?.method === 'DELETE' ? {} : { receipt }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    return () => {
      window.fetch = real;
    };
  }, []);
}

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
  useFakeActions();
  const flow = route?.flow ?? (scene && stage ? askFlowMessages(scene, stage) : null);
  const mapped = !state && stage ? ASK_STAGE_STATE[stage] : undefined;
  const page = <PreviewAsk state={flow ? undefined : (state ?? (stage === 'home' ? undefined : mapped))} kind={kind} messages={flow?.messages} busy={flow?.busy} role={viewer === 'player' ? 'player' : undefined} />;
  return (
    <div data-ch-ak-ready="1" style={{ display: 'contents' }}>
      <QcSeam.Provider value={{ week: ASK_PREVIEW_WEEK }}>{route?.plan ? <PlanPreview.Provider value={route.plan}>{page}</PlanPreview.Provider> : page}</QcSeam.Provider>
    </div>
  );
}
