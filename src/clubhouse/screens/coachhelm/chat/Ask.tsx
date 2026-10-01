'use client';

import { MessagesSquare, PanelLeftOpen, SquarePen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../../../data/coachhelm-chat-error';
import { titleFromQuestion, type ChAskConversation, type ChAskData, type ChAskLoad } from '../../../data/coachhelm-chat-shape';
import { pendingApproval, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { useChSessionState } from '../../../lib/session-state';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { PhoneTop, usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { AskComposer, useRefuseOffline } from './Composer';
import { AskEvidencePanel } from './EvidencePanel';
import { conversationHref, HistoryDrawer, HistoryPanel } from './History';
import { AskHome } from './Home';
import { AskInputsFailed, AskNoRoster, AskThreadFailed, AskUnavailable } from './States';
import { useViewSwitch } from '../use-view-switch';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from './SubTabs';
import { AskThread } from './Thread';

/** The chat implementation: the production hook, or a stand-in for the preview and the tests (nothing goes over the network). */
export type ChAskChat = typeof useCoachHelmChat;

/** Where the screen starts, for the dev preview (and the tests): the evidence open, the phone drawer open, the panel folded away. */
export interface ChAskInitial {
  evidence?: EvidenceFocus | null;
  drawer?: boolean;
  panelOpen?: boolean;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** The `useViewSwitch` value that stands for "no chat open". */
const NEW_CHAT = 'new';

/** The team's name beside the sub-tab strip: a label, not a switcher (the shell owns the active team). */
function TeamLabel({ name }: { name: string }) {
  return (
    <span className="ch-ask-team">
      <i aria-hidden="true" />
      {name}
    </span>
  );
}

/** The frame the states without a chat share: the sub-tab strip (so the Board is one tap away) over the state. */
function AskFrame({ team, children }: { team?: string; children: ReactNode }) {
  const phone = useChPhone();
  const sw = useViewSwitch<CoachHelmView>('ask', (v) => COACHHELM_HREF[v]);
  return (
    <main className={'ch-ask is-plain' + (phone ? ' is-phone' : '')} aria-label="Ask CoachHelm" aria-busy={sw.pending || undefined} data-ch-code="CH-13820">
      {phone && <PhoneTop start title="CoachHelm" />}
      <div className="ch-ask-top">
        <CoachHelmTabs active={sw.shown} onGo={sw.go} />
        {!phone && team && <TeamLabel name={team} />}
      </div>
      <div className="ch-ask-plain">{children}</div>
    </main>
  );
}

/**
 * Ask CoachHelm: the chat, as the Ask sub-tab of the CoachHelm screen (docs/clubhouse/drafts/intelligence.md section 3.5;
 * the owner's chat mockups). Coach-only: the route never hands this to a player.
 *
 * `load` is what the server read (data/coachhelm-chat.ts): a roster of nobody and a context that did not load are their own
 * pages; everything else is the chat. The conversation itself runs on the production hook and route, unchanged.
 */
export function Ask({ load, chat = useCoachHelmChat, initial }: { load: ChAskLoad; chat?: ChAskChat; initial?: ChAskInitial }) {
  if (load.status === 'noRoster') {
    return (
      <AskFrame team={load.teamName}>
        <AskNoRoster />
      </AskFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <AskFrame>
        <AskInputsFailed />
      </AskFrame>
    );
  }
  // A different conversation is a different chat: the hook reads its starting messages once.
  return <AskChat key={load.data.notFound ? 'gone' : (load.data.thread?.id ?? 'new')} data={load.data} useChatImpl={chat} initial={initial} />;
}

function AskChat({ data, useChatImpl, initial }: { data: ChAskData; useChatImpl: ChAskChat; initial?: ChAskInitial }) {
  const phone = useChPhone();
  // A switch to the Board moves the strip at once and dims the chat (aria-busy) until the Board is ready.
  const sw = useViewSwitch<CoachHelmView>('ask', (v) => COACHHELM_HREF[v]);
  const online = useOnline();
  const refuseOffline = useRefuseOffline();
  // The chats this visit started and the server's list does not hold yet. The list itself is the server's (`data.conversations`), read
  // each render: a copy taken once would never take a refreshed list, and History's Try again would leave "your chats didn't load" up.
  const [started, setStarted] = useState<ChAskConversation[]>([]);
  const conversations = useMemo(
    () => ({ ...data.conversations, list: [...started.filter((s) => !data.conversations.list.some((c) => c.id === s.id)), ...data.conversations.list] }),
    [data.conversations, started],
  );
  const [title, setTitle] = useState<string | null>(data.thread?.title ?? null);
  const [openId, setOpenId] = useState<string | null>(data.notFound ? null : (data.thread?.id ?? null));
  // Choosing a saved chat is a page read (the thread's messages), so it is a switch too: the row takes the selected look on the
  // tap and the conversation dims until the next one lands. 'new' stands for no open chat.
  const chatSw = useViewSwitch<string>(openId ?? NEW_CHAT, (id) => (id === NEW_CHAT ? COACHHELM_HREF.ask : conversationHref(id)));
  const [gone, setGone] = useState(data.notFound);
  // The chats panel stays as the coach left it when they return to this page (owner rule 8): a layout choice, not a chat's own state.
  const [panelOpen, setPanelOpen] = useChSessionState('askPanel', initial?.panelOpen ?? true);
  const [drawer, setDrawer] = useState(initial?.drawer ?? false);
  const [evidence, setEvidence] = useState<EvidenceFocus | null>(initial?.evidence ?? null);
  const lastSent = useRef('');
  // A new chat's id arrives on the first response, after the send, and only this frame knows which send it is for. `epoch` moves each
  // time the coach leaves a chat for a new one; `expecting` is the epoch of the send that is waiting for its chat's id (none for a send
  // into a chat that already has one). An id that arrives for any other send is for a chat that is no longer open, and it must not move
  // the address or the title: the last choice wins. `alive` is the same for a chat left by opening another (this frame is replaced).
  const epoch = useRef(0);
  const expecting = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** CH-13922: a brand-new thread is in History at once, and the address names it, so a reload resumes. */
  const adopt = useCallback((id: string) => {
    if (!alive.current || expecting.current !== epoch.current) return;
    expecting.current = null;
    const name = titleFromQuestion(lastSent.current);
    setOpenId(id);
    setTitle((t) => t ?? name);
    setStarted((s) => (s.some((x) => x.id === id) ? s : [{ id, title: name, updatedAt: new Date().toISOString() }, ...s]));
    window.history.replaceState(window.history.state, '', `${COACHHELM_HREF.ask}&c=${id}`);
  }, []);

  const chat = useChatImpl({
    conversationId: data.notFound ? null : (data.thread?.id ?? null),
    initialMessages: data.thread?.messages,
    // The hook calls this while it updates its own state: adopt the id after that render, not inside it.
    onConversationId: (id) => queueMicrotask(() => adopt(id)),
  });

  const pending = pendingApproval(chat.messages);
  const showHome = chat.messages.length === 0 && !gone && !data.threadFailed;
  const notice = chat.error ? describeChatError(chat.error) : null;
  // A thread covers the page, so the phone tab bar steps aside; the new-chat home keeps it.
  usePhoneTabsHidden(phone && !showHome);

  const ask = (text: string) => {
    if (chat.busy || pending || refuseOffline()) return;
    lastSent.current = text;
    expecting.current = openId === null ? epoch.current : null;
    setGone(false);
    chat.send(text);
  };
  // The composer's own gate already refused offline and blocked sends.
  const send = (text: string) => {
    lastSent.current = text;
    expecting.current = openId === null ? epoch.current : null;
    setGone(false);
    chat.send(text);
  };

  const newChat = () => {
    // A reply still on its way belongs to the chat being left: stop it (silent, as Stop is), and an id that arrives for it later is not adopted.
    if (chat.busy) chat.stop();
    epoch.current += 1;
    expecting.current = null;
    chat.newConversation();
    setOpenId(null);
    setTitle(null);
    setGone(false);
    setEvidence(null);
    setDrawer(false);
    window.history.replaceState(window.history.state, '', COACHHELM_HREF.ask);
  };

  // A reply that ends on its own (not a failure) needs nothing here; a thread that finished and then closed the evidence for a
  // conversation that is no longer open must not keep it.
  useEffect(() => {
    if (chat.messages.length === 0) setEvidence(null);
  }, [chat.messages.length]);

  const heading = gone ? 'Chat not found' : (title ?? 'New chat');
  const histProps = {
    conversations,
    openId: chatSw.shown === NEW_CHAT ? null : chatSw.shown,
    nowIso: data.nowIso,
    timezone: data.timezone,
    onNew: newChat,
    onOpen: chatSw.go,
  };

  const composer = (variant: 'hero' | 'dock') => (
    <SectionBoundary surface="coachhelm.ask.composer" label="The message box" code="CH-13225">
      <AskComposer
        variant={variant}
        phone={phone}
        players={data.players}
        busy={chat.busy}
        failed={Boolean(chat.error)}
        blocked={Boolean(pending)}
        onSend={send}
        onStop={chat.stop}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- a component prop; the composer focuses itself in an effect
        autoFocus={variant === 'hero'}
        fresh={showHome}
        // The unsent text is this coach's, in this chat (the new chat is its own): it comes back when they return to the page.
        draftKey={data.coachId ? `${data.coachId}:${openId ?? NEW_CHAT}` : null}
      />
    </SectionBoundary>
  );

  const body = gone ? (
    <AskUnavailable onNew={newChat} phone={phone} />
  ) : data.threadFailed ? (
    <AskThreadFailed onNew={newChat} />
  ) : showHome ? (
    <AskHome data={data} phone={phone} heroComposer={composer('hero')} onAsk={ask} />
  ) : (
    <SectionBoundary surface="coachhelm.ask.thread" label="The conversation" code="CH-13225">
      <AskThread
        messages={chat.messages}
        busy={chat.busy}
        error={notice}
        offline={!online}
        phone={phone}
        players={data.players}
        onApprove={chat.approve}
        onDeny={chat.deny}
        onSend={ask}
        onStop={chat.stop}
        onRetry={chat.retry}
        onNewChat={newChat}
        evidenceFocus={evidence}
        onOpenEvidence={setEvidence}
      />
    </SectionBoundary>
  );

  // The big box sits inside the new-chat page on desktop; everywhere else it docks at the foot.
  const docked = !(showHome && !phone) && !data.threadFailed;
  const evidenceOpen = evidence !== null && !showHome;

  return (
    <main className={'ch-ask' + (phone ? ' is-phone' : '') + (showHome ? ' is-home' : '')} aria-label="Ask CoachHelm" aria-busy={sw.pending || chatSw.pending || undefined} data-switch={sw.pending ? 'view' : chatSw.pending ? 'chat' : undefined} data-ch-code="CH-13820">
      {phone && (
        <>
          <PhoneTop
            lead
            title={
              <>
                <button type="button" className="ch-pbar__icon" aria-label="Chats" onClick={() => setDrawer(true)}>
                  <Icon icon={MessagesSquare} size={20} />
                </button>
                <span className="ch-ask-ph__title">{showHome && !gone ? 'CoachHelm' : heading}</span>
              </>
            }
            action={<PhoneIconAction icon={SquarePen} label="New chat" onClick={newChat} />}
          />
          <h1 className="ch-sr-only">Ask CoachHelm</h1>
        </>
      )}
      <div className="ch-ask-top">
        <CoachHelmTabs active={sw.shown} onGo={sw.go} />
        {!phone && <TeamLabel name={data.teamName} />}
      </div>
      <div className={'ch-ask-body' + (!phone && panelOpen ? ' has-panel' : '') + (!phone && evidenceOpen ? ' has-evidence' : '')}>
        {!phone && (
          <SectionBoundary surface="coachhelm.ask.history" label="Your chats" code="CH-13225">
            <HistoryPanel {...histProps} heading="CoachHelm" open={panelOpen} onHide={() => setPanelOpen(false)} />
          </SectionBoundary>
        )}
        <section className="ch-ask-main" aria-label="Conversation">
          {!phone && (
            <header className="ch-ask-head">
              {!panelOpen && (
                <>
                  <button type="button" className="ch-ask-head__btn" aria-label="Show chats" onClick={() => setPanelOpen(true)}>
                    <Icon icon={PanelLeftOpen} size={19} />
                  </button>
                  <button type="button" className="ch-ask-head__btn is-accent" aria-label="New chat" onClick={newChat}>
                    <Icon icon={SquarePen} size={19} />
                  </button>
                </>
              )}
              <h1 className="ch-ask-head__t">{heading}</h1>
            </header>
          )}
          <div className={'ch-ask-scroll' + (showHome ? ' is-home' : !gone && !data.threadFailed ? ' is-thread' : '')}>{body}</div>
          {docked && (
            <div className="ch-ask-dock">
              {composer('dock')}
              {!phone && (
                <p className="ch-ask-foot">CoachHelm reads {data.teamName} data only. Check the numbers before you act on them.</p>
              )}
            </div>
          )}
          {showHome && !phone && <p className="ch-ask-foot is-home">CoachHelm reads {data.teamName} data only. Check the numbers before you act on them.</p>}
        </section>
        {!phone && evidenceOpen && evidence && (
          <aside className="ch-ask-ev" aria-label="Evidence">
            <AskEvidencePanel focus={evidence} messages={chat.messages} phone={false} onClose={() => setEvidence(null)} />
          </aside>
        )}
      </div>
      {phone && (
        <>
          <HistoryDrawer {...histProps} open={drawer} onClose={() => setDrawer(false)} />
          <Modal open={evidenceOpen} onClose={() => setEvidence(null)} title="Evidence">
            {evidence && (
              // The sheet's body scrolls, so it needs something a keyboard can reach inside it (axe: scrollable-region-focusable).
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              <div tabIndex={0} role="region" aria-label="Evidence" className="ch-ask-evsheet" data-ch-code="CH-13820">
                <AskEvidencePanel focus={evidence} messages={chat.messages} phone onClose={() => setEvidence(null)} />
              </div>
            )}
          </Modal>
        </>
      )}
    </main>
  );
}
