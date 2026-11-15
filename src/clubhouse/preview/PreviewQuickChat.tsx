'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChAskSheetChat } from '../shell/AskSheet';
import { useLandings } from '../shell/quick-chat/landing';
import { LandingSlot } from '../shell/quick-chat/LandingSlot';
import { QcSeam, type QcSeamValue } from '../shell/quick-chat/qc-seam';
import QuickChatSession from '../shell/quick-chat/QuickChatSession';
import { QC_FIXTURES, seamFor, taskReceipt, taskThread, type QcFixture } from './fixtures-quick-chat';

/** How long the scripted server takes to answer a Confirm, and the page's loader to answer a re-read. */
const CONFIRM_MS = 450;
const REREAD_MS = 520;
const ANSWER_MS = 1400;

/** Cards undone in this preview: the scripted server writes nothing for them when their hold ends. */
const undone = new Set<string>();

const asMessage = (id: string, role: 'user' | 'assistant', parts: unknown[]) => ({ id, role, parts }) as unknown as UIMessage;

/** The fixture as the chat hook: still for a state, or scripted (a question gets a short answer; Confirm holds, then saves). */
function fake(f: QcFixture): ChAskSheetChat {
  return function useFakeQuickChat(_o: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
    const [messages, setMessages] = useState<UIMessage[]>(f.messages);
    const [busy, setBusy] = useState(!!f.busy);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    return {
      messages,
      status: busy ? 'streaming' : 'ready',
      error: f.failed ? new Error('Lost the connection. Nothing was saved.') : undefined,
      busy,
      conversationId: 'preview',
      context: [],
      addContext: () => {},
      removeContext: () => {},
      send: (text: string) => {
        const n = messages.length;
        setMessages((m) => [...m, asMessage(`u${n}`, 'user', [{ type: 'text', text }]), asMessage(`a${n}`, 'assistant', [{ type: 'data-progress', id: 'p1', data: { label: 'Reading the team’s rounds' } }])]);
        setBusy(true);
        timers.current.push(
          setTimeout(() => {
            setMessages((m) => [...m.slice(0, -1), asMessage(`a${n}`, 'assistant', [{ type: 'data-progress', id: 'p1', data: { label: 'Read the team’s rounds · 212 rounds', state: 'done' } }, { type: 'text', text: 'This is the preview’s stand-in answer: no model was called.', state: 'done' }])]);
            setBusy(false);
          }, ANSWER_MS),
        );
      },
      stop: () => setBusy(false),
      retry: () => {},
      newConversation: () => setMessages([]),
      approve: () => {
        const script = f.script;
        if (!script) return;
        // As the engine does: the held receipt on the Confirm's own stream, then the outcome on the same part when the hold ends.
        timers.current.push(setTimeout(() => setMessages(taskThread(taskReceipt('held', script.holdMs))), CONFIRM_MS));
        timers.current.push(setTimeout(() => setMessages((m) => (undone.has('qc-task') ? m : taskThread(taskReceipt(script.fails ? 'failed' : 'completed')))), CONFIRM_MS + script.holdMs + 60));
      },
      deny: () => {},
    } as UseCoachHelmChatResult;
  };
}

/**
 * A stand-in for a screen that has taken the landing's hooks (QUICK-CHAT.md, Moment 8), so the choreography can be seen
 * over a real screen without editing that screen. It does for the Team Hub's task list what the Hub's own one-line
 * hooks will do: stamps each row (`data-ch-row`, `data-ch-row-tag`), gives the slot a place at the head of the list,
 * and plays the loader's part by adding the saved row a moment after the save. Preview only.
 */
function PreviewLandingHost() {
  const landings = useLandings();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => {
      const list = document.querySelector<HTMLElement>('.ch-hb-tasks');
      if (!list) return false;
      list.querySelectorAll<HTMLElement>('.ch-hb-task').forEach((row, i) => {
        if (!row.dataset.chRow) row.dataset.chRow = `task:preview-${i}`;
        row.querySelector('b:not(.ch-num)')?.setAttribute('data-ch-row-tag', '');
      });
      if (!list.querySelector(':scope > [data-preview-slot]')) {
        const at = document.createElement('div');
        at.setAttribute('data-preview-slot', '');
        list.prepend(at);
        setHost(at);
      }
      return true;
    };
    if (find()) return;
    const seen = new MutationObserver(() => find() && seen.disconnect());
    seen.observe(document.body, { childList: true, subtree: true });
    return () => seen.disconnect();
  }, []);
  // The loader's part: the saved row is in the list a moment after the page was asked to read again.
  const saved = landings.find((l) => l.kind === 'task' && l.phase === 'saved') ?? null;
  const savedKey = saved?.key ?? null;
  const label = saved?.label ?? '';
  useEffect(() => {
    if (!savedKey || !host) return;
    const t = setTimeout(() => {
      const model = host.parentElement?.querySelector<HTMLElement>('.ch-hb-task');
      if (!model || host.parentElement?.querySelector('[data-ch-row="task:preview-new"]')) return;
      const row = model.cloneNode(true) as HTMLElement;
      row.dataset.chRow = 'task:preview-new';
      row.removeAttribute('data-ch-landed');
      const title = row.querySelector('b:not(.ch-num)');
      if (title) title.textContent = label;
      row.querySelectorAll(':scope > div > span').forEach((n) => (n.textContent = 'Eli Brandt · due Fri 14 Nov'));
      const progress = row.querySelector('.ch-hb-prog b');
      if (progress) progress.textContent = '0/1';
      host.after(row);
    }, REREAD_MS);
    return () => clearTimeout(t);
  }, [savedKey, host, label]);
  return host ? createPortal(<LandingSlot kind="task" />, host) : null;
}

/** `?qc=<state>` over any coach preview screen. Sets body[data-qc] as the design page does, so `capture.mjs` can wait on it. */
export default function PreviewQuickChat({ state, open, onClose, looking, pathname }: { state: string; open: boolean; onClose: () => void; looking: { label: string; playerId: string | null; playerName: string | null }; pathname: string }) {
  const f = QC_FIXTURES[state] ?? QC_FIXTURES.hello!;
  const [chat] = useState(() => fake(f));
  useEffect(() => {
    document.body.dataset.qc = state;
    return () => {
      delete document.body.dataset.qc;
    };
  }, [state]);
  const seam = useMemo<QcSeamValue>(() => seamFor(state), [state]);
  // In place of the three calls a held card makes (`GET`, `DELETE`, `POST ?now=1` on `actions/[key]`): the preview never
  // reaches the network, signs nothing in and writes nothing. Undo answers yes; the other two answer with the outcome.
  const fails = !!f.script?.fails;
  useEffect(() => {
    const real = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const at = url.indexOf('/api/coachhelm/v3/chat/actions/');
      if (at < 0) return real(input, init);
      const key = decodeURIComponent(url.slice(at + '/api/coachhelm/v3/chat/actions/'.length).split('?')[0] ?? '');
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') undone.add(key);
      const body = method === 'DELETE' ? { ok: true, receipt: { ...taskReceipt('completed'), status: 'cancelled', summary: 'Undone. Nothing was written.', created: [] } } : { receipt: undone.has(key) ? null : taskReceipt(fails ? 'failed' : 'completed') };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    };
    return () => {
      window.fetch = real;
      undone.clear();
    };
  }, [fails]);
  return (
    <QcSeam.Provider value={seam}>
      <QuickChatSession open={open} onClose={onClose} looking={looking} pathname={pathname} chat={chat} />
      <PreviewLandingHost />
    </QcSeam.Provider>
  );
}
