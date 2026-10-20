'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChAskData, ChAskLoad } from '../data/coachhelm-chat-shape';
import { Ask, type ChAskChat, type ChAskInitial } from '../screens/coachhelm/chat/Ask';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { ASK_RAW_ERRORS, PREVIEW_ASK_DATA, PREVIEW_ASK_NOROUNDS } from './fixtures-ask';
import { ASK_PROPOSAL, ASK_RECEIPT_DONE, ASK_THREAD_STATES } from './fixtures-ask-thread';

type Part = { type: string; [key: string]: unknown };

/**
 * A stand-in for `useCoachHelmChat` (nothing goes over the network): it starts from the messages, busy flag and error the
 * preview state names, answers a question with a short text after a moment, adopts a conversation id on the first send, and
 * turns Confirm or Cancel into a decided card (Confirm adds the receipt).
 */
function fakeChat(start: { busy?: boolean; error?: unknown; messages?: UIMessage[] }): ChAskChat {
  return function useFakeChat(options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
    const [messages, setMessages] = useState<UIMessage[]>(options.initialMessages ?? start.messages ?? []);
    const [busy, setBusy] = useState(start.busy ?? false);
    const [error, setError] = useState<unknown>(start.error);
    const [conversationId, setConversationId] = useState<string | null>(options.conversationId ?? null);

    const decide = (approvalId: string, approved: boolean) =>
      setMessages((all) =>
        all.map((m) => ({
          ...m,
          parts: (m.parts as Part[]).flatMap((p): Part[] => {
            const approval = p.approval as { id?: string } | undefined;
            if (!p.type.startsWith('tool-') || approval?.id !== approvalId) return [p];
            const decided: Part = { ...p, state: 'approval-responded', approval: { id: approvalId, approved } };
            return approved ? [decided, { type: 'data-action-receipt', id: `receipt-${ASK_PROPOSAL.idempotency_key}`, data: ASK_RECEIPT_DONE }] : [decided];
          }) as UIMessage['parts'],
        })),
      );

    return {
      messages,
      status: error ? 'error' : busy ? 'streaming' : 'ready',
      error: error as Error | undefined,
      busy,
      conversationId,
      context: [],
      addContext: () => {},
      removeContext: () => {},
      send: (text) => {
        setError(undefined);
        setMessages((all) => [...all, { id: `u-${all.length}`, role: 'user', parts: [{ type: 'text', text }] }]);
        if (!conversationId) {
          setConversationId('c-preview-new');
          options.onConversationId?.('c-preview-new');
        }
        setBusy(true);
        setTimeout(() => {
          setMessages((all) => [...all, { id: `a-${all.length}`, role: 'assistant', parts: [{ type: 'text', text: 'This is the preview: nothing was asked.' }] }]);
          setBusy(false);
        }, 700);
      },
      stop: () => setBusy(false),
      retry: () => setError(undefined),
      newConversation: () => {
        setMessages([]);
        setConversationId(null);
        setError(undefined);
        setBusy(false);
      },
      approve: (id) => decide(id, true),
      deny: (id) => decide(id, false),
    };
  };
}

/**
 * Ask CoachHelm in the dev preview. `?state=`: new (default) | norounds | noroster | failed | unavailable | loading |
 * pulsefailed | historyempty | historyfailed | threadfailed | history (the phone drawer open) | historyclosed (the desktop
 * panel folded) | offline | error (with `&q=rate|budget|gone|fault|dropped`), and any conversation state of
 * fixtures-ask-thread.ts: answer | thinking | working | action | confirmed | cancelled | receipt | receiptfailed | abandoned |
 * rejected | readfail | partial | long. Nothing reaches the server.
 */
export function PreviewAsk({ state, kind }: { state?: string; kind?: string }) {
  const offline = state === 'offline';
  useEffect(() => {
    if (!offline) return;
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    return () => {
      delete (navigator as { onLine?: boolean }).onLine;
      if (real) Object.defineProperty(Navigator.prototype, 'onLine', real);
      window.dispatchEvent(new Event('online'));
    };
  }, [offline]);

  const { load, chat, initial } = useMemo(() => {
    const base: ChAskData = state === 'norounds' ? PREVIEW_ASK_NOROUNDS : PREVIEW_ASK_DATA;
    let data: ChAskData = base;
    let start: { busy?: boolean; error?: unknown; messages?: UIMessage[] } = {};
    const init: ChAskInitial = {};
    if (state === 'pulsefailed') data = { ...base, pulse: null };
    else if (state === 'historyempty') data = { ...base, conversations: { list: [], error: false } };
    else if (state === 'historyfailed') data = { ...base, conversations: { list: [], error: true } };
    else if (state === 'unavailable') data = { ...base, notFound: true };
    else if (state === 'threadfailed') data = { ...base, threadFailed: true };
    else if (state === 'history') init.drawer = true;
    else if (state === 'historyclosed') init.panelOpen = false;
    else if (state === 'error') {
      const raw = ASK_RAW_ERRORS[kind ?? 'rate'];
      const q: UIMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Who should play the qualifier on Oct 6?' }] };
      data = { ...base, thread: { id: 'c-qual', title: 'Qualifier lineup for Oct 6', messages: [q] } };
      start = { error: raw };
    } else if (state && state in ASK_THREAD_STATES) {
      const t = ASK_THREAD_STATES[state]!;
      data = { ...base, thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: t.messages } };
      start = { busy: t.busy };
      init.evidence = t.focus ?? null;
    }
    const load: ChAskLoad = state === 'noroster' ? { status: 'noRoster', teamName: 'Finley University' } : state === 'failed' ? { status: 'failed' } : { status: 'ready', data };
    return { load, chat: fakeChat(start), initial: init };
  }, [state, kind]);

  if (state === 'loading') return <AskSkeleton />;
  return <Ask load={load} chat={chat} initial={initial} />;
}
