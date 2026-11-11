'use client';

import { revealMode, setRevealMode, setWaitLight } from '../screens/coachhelm/chat/reveal';
import type { UIMessage } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import { useCoachHelmChat, type UseCoachHelmChatOptions, type UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { pendingDecisionKeys } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { askScript, installScriptedChat, isAskPace, SCRIPTED_CHAT_ENDPOINT, type AskScript } from './ask-script';
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
            return [decided];
          }) as UIMessage['parts'],
        })),
      );
    // Ask v2's write answers a moment later, held for its 8 seconds, so the capsule, the flight and the Undo ring all show.
    const decideV2 = (approvalId: string, approved: boolean) => {
      decide(approvalId, approved);
      if (!approved) return;
      setTimeout(() => {
        setMessages((all) =>
          all.map((m) => {
            const parts = m.parts as Part[];
            const i = parts.findIndex((p) => (p.approval as { id?: string } | undefined)?.id === approvalId);
            if (i < 0) return m;
            const proposal = parts.find((p) => p.type === 'data-action-proposal')?.data as { idempotency_key?: string; summary?: string } | undefined;
            const key = proposal?.idempotency_key ?? ASK_PROPOSAL.idempotency_key;
            return { ...m, parts: [...parts, { type: 'data-action-receipt', id: `receipt-${key}`, data: { ...ASK_RECEIPT_DONE, status: 'held', held_until: new Date(Date.now() + 8000).toISOString(), idempotency_key: key, summary: proposal?.summary ?? ASK_RECEIPT_DONE.summary } }] as UIMessage['parts'] };
          }),
        );
      }, 700);
    };

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
      approve: (id) => decideV2(id, true),
      deny: (id) => decide(id, false),
    };
  };
}

/**
 * What `?state=play` does by itself, so a moment can be captured without a hand on the page. Each is milliseconds; absent, the
 * page waits for a person. Read from the address once the page has mounted (the route hands over only `state` and `q`).
 */
interface PlayDrive {
  script: AskScript;
  /** Ask the script's question this long after the page is up. */
  auto: number | null;
  /** Press the card's primary this long after it can be pressed. */
  confirm: number | null;
  /** Press Cancel instead. */
  cancel: number | null;
  /** Press Undo this long after the hold begins. */
  undo: number | null;
  /** Press Stop this long after the question is sent. */
  stop: number | null;
  /** Press Try again this long after a turn fails. */
  retry: number | null;
  /** Press the activity island this long after the question is sent, and its first openable step this long after that. */
  isl: number | null;
  islstep: number | null;
}
let DRIVE: PlayDrive | null = null;

const click = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

/**
 * The production hook on the harness endpoint (`ask-script.ts` answers it in the page), plus the drive above. Everything the
 * coach sees comes through `useCoachHelmChat` and its reducer exactly as it would from the server.
 */
function useScriptedChat(options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
  const chat = useCoachHelmChat({ ...options, endpoint: SCRIPTED_CHAT_ENDPOINT });
  const drive = DRIVE;
  const send = chat.send;
  const sent = chat.messages.length > 0;
  useEffect(() => {
    if (!drive || drive.auto === null || sent) return;
    const t = setTimeout(() => send(drive.script.question), drive.auto);
    return () => clearTimeout(t);
  }, [drive, send, sent]);
  useEffect(() => {
    if (!drive || drive.stop === null || !sent) return;
    const t = setTimeout(() => click('.ch-ask-cmp__send.is-stop'), drive.stop);
    return () => clearTimeout(t);
  }, [drive, sent]);
  useEffect(() => {
    if (!drive || drive.isl === null || !sent) return;
    const step = drive.islstep;
    let inner: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      click('.ch-isl .hd');
      if (step !== null) inner = setTimeout(() => click('.ch-isl .st .op'), step);
    }, drive.isl);
    return () => {
      clearTimeout(t);
      clearTimeout(inner);
    };
  }, [drive, sent]);
  const last = chat.messages[chat.messages.length - 1];
  const waiting = pendingDecisionKeys(last as never).length > 0 && !chat.busy;
  useEffect(() => {
    if (!drive || !waiting) return;
    const ms = drive.confirm ?? drive.cancel;
    if (ms === null) return;
    const t = setTimeout(() => click(drive.confirm !== null ? '[data-ch-ask-confirm]' : '[data-ch-ask-cancel]'), ms);
    return () => clearTimeout(t);
  }, [drive, waiting]);
  const held = (last?.parts ?? []).some((p) => p.type === 'data-action-receipt' && (p.data as { status?: string } | undefined)?.status === 'held');
  useEffect(() => {
    if (!drive || drive.undo === null || !held) return;
    const t = setTimeout(() => click('[data-ch-ask-undo]'), drive.undo);
    return () => clearTimeout(t);
  }, [drive, held]);
  const failed = chat.status === 'error';
  useEffect(() => {
    if (!drive || drive.retry === null || !failed) return;
    const t = setTimeout(() => click('[data-ch-ask-retry]'), drive.retry);
    return () => clearTimeout(t);
  }, [drive, failed]);
  return chat;
}

/**
 * `?state=play&script=<name>`: a scripted turn through the real hook (ask-script.ts). `&pace=fast|real|worst`. Driving it:
 * `&auto=<ms>` asks the script's question, `&confirm=<ms>` / `&cancel=<ms>` answers its card, `&undo=<ms>` presses Undo,
 * `&stop=<ms>` presses Stop, `&retry=<ms>` presses Try again, `&isl=<ms>` presses the activity island and `&islstep=<ms>` then its first openable step, `&until=<ms>` freezes the response at that instant (a still
 * frame of a moment). Without `auto` the page waits for a person to type or tap a start.
 */
function PreviewAskPlay({ name, role }: { name?: string; role?: 'player' }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const at = new URLSearchParams(window.location.search);
    const ms = (key: string): number | null => (at.has(key) ? Math.max(0, Number(at.get(key)) || 0) : null);
    const pace = at.get('pace');
    // `script` names the turn; `q` is left alone, because Ask reads `?q=` as a question to put in the field.
    const script = askScript(at.get('script') ?? name, isAskPace(pace) ? pace : 'real');
    DRIVE = { script, auto: ms('auto'), confirm: ms('confirm'), cancel: ms('cancel'), undo: ms('undo'), stop: ms('stop'), retry: ms('retry'), isl: ms('isl'), islstep: ms('islstep') };
    // `&reveal=smooth|burst`: how the answer's words are released (chat/reveal.ts).
    setRevealMode(at.get('reveal') === 'smooth' ? 'smooth' : at.get('reveal') === 'burst' ? 'burst' : revealMode());
    // `&light=1`: the island's passing light while it works.
    setWaitLight(at.get('light') === '1');
    const restore = installScriptedChat(script, { until: ms('until') });
    setReady(true);
    return () => {
      restore();
      DRIVE = null;
    };
  }, [name]);
  const load = useMemo<ChAskLoad>(() => {
    let data: ChAskData = { ...PREVIEW_ASK_DATA };
    if (role === 'player') data = { ...data, role: 'player', firstName: 'Jonah', allowance: 'plenty' as ChAskData['allowance'], knows: undefined, focus: [{ text: 'Approach from 125 to 150, set by Coach Reyes', ask: 'How is my approach from 125 to 150 doing?' }, { text: 'Putting gained strokes at Hilltop', ask: 'How did my putting go at Hilltop?' }] } as ChAskData;
    else data = { ...data, firstName: 'Maya' };
    return { status: 'ready', data };
  }, [role]);
  if (!ready) return <AskSkeleton />;
  return <Ask load={load} chat={useScriptedChat} />;
}

/**
 * Ask CoachHelm in the dev preview. `?state=`: new (default) | norounds | noroster | failed | unavailable | loading |
 * pulsefailed | historyempty | historyfailed | threadfailed | history (the phone drawer open) | historyclosed (the desktop
 * panel folded) | offline | error (with `&q=rate|budget|gone|fault|dropped`), and any conversation state of
 * fixtures-ask-thread.ts: answer | visual (a strokes gained anatomy) | compose (a model-designed composition) | composelive (the same, arriving live, with
 * its motion) | staging (the 2026-10-29 staging transcript: roster, tasks, tournaments, events, a pipe table, a team ranking and
 * comparison) | thinking | working | action | confirmed | cancelled | receipt | receiptfailed | abandoned |
 * rejected | readfail | partial | long | reads (an answer that names Jonah's reads, each a link to his Deep dive) | readsother
 * (the same reads for a player not on the team: no links). Nothing reaches the server.
 */
export function PreviewAsk(props: { state?: string; kind?: string; messages?: UIMessage[]; busy?: boolean; role?: 'player' }) {
  if (props.state === 'play') return <PreviewAskPlay name={props.kind} role={props.role} />;
  return <PreviewAskStill {...props} />;
}

function PreviewAskStill({ state, kind, messages, busy, role }: { state?: string; kind?: string; messages?: UIMessage[]; busy?: boolean; role?: 'player' }) {
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
    } else if (messages) {
      data = { ...base, thread: { id: 'c-practice', title: 'Thursday practice', messages } };
      start = { busy };
    } else if (state && state in ASK_THREAD_STATES) {
      const t = ASK_THREAD_STATES[state]!;
      data = { ...base, thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: t.messages } };
      start = { busy: t.busy };
      init.evidence = t.focus ?? null;
    }
    if (role === 'player') data = { ...data, role: 'player', firstName: 'Jonah', allowance: 'plenty' as ChAskData['allowance'], focus: [{ text: 'Approach from 125 to 150, set by Coach Reyes', ask: 'How is my approach from 125 to 150 doing?' }, { text: 'Putting gained strokes at Hilltop', ask: 'How did my putting go at Hilltop?' }] };
    if (role !== 'player') data = { ...data, firstName: 'Maya' };
    if (!data.knows && role !== 'player') data = { ...data, knows: { tone: 'straight', teamId: 'preview', facts: [{ id: 'k1', text: 'Practice runs 2h 30m on weekdays' }, { id: 'k2', text: 'Team goal: under +2 a round by spring' }] } };
    const load: ChAskLoad = state === 'noroster' ? { status: 'noRoster', teamName: 'Finley University' } : state === 'failed' ? { status: 'failed' } : { status: 'ready', data };
    return { load, chat: fakeChat(start), initial: init };
  }, [state, kind, messages, busy, role]);

  if (state === 'loading') return <AskSkeleton />;
  return <Ask load={load} chat={chat} initial={initial} />;
}
