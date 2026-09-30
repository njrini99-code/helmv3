'use client';

import { MessagesSquare, PanelLeftOpen, SquarePen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../../../data/coachhelm-chat-error';
import { titleFromQuestion, type ChAskData, type ChAskLoad } from '../../../data/coachhelm-chat-shape';
import { pendingApproval, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { PhoneTop, usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { AskComposer, useRefuseOffline } from './Composer';
import { AskEvidencePanel } from './EvidencePanel';
import { HistoryDrawer, HistoryPanel } from './History';
import { AskHome } from './Home';
import { AskInputsFailed, AskNoRoster, AskThreadFailed, AskUnavailable } from './States';
import { COACHHELM_HREF, CoachHelmTabs } from './SubTabs';
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
  return (
    <main className={'ch-ask is-plain' + (phone ? ' is-phone' : '')} aria-label="Ask CoachHelm" data-ch-code="CH-13820">
      {phone && <PhoneTop start title="CoachHelm" />}
      <div className="ch-ask-top">
        <CoachHelmTabs active="ask" />
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
  const router = useRouter();
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
        <AskInputsFailed onRetry={() => router.refresh()} />
      </AskFrame>
    );
  }
  // A different conversation is a different chat: the hook reads its starting messages once.
  return <AskChat key={load.data.notFound ? 'gone' : (load.data.thread?.id ?? 'new')} data={load.data} useChatImpl={chat} initial={initial} />;
}

function AskChat({ data, useChatImpl, initial }: { data: ChAskData; useChatImpl: ChAskChat; initial?: ChAskInitial }) {
  const router = useRouter();
  const phone = useChPhone();
  const online = useOnline();
  const refuseOffline = useRefuseOffline();
  const [conversations, setConversations] = useState(data.conversations);
  const [title, setTitle] = useState<string | null>(data.thread?.title ?? null);
  const [openId, setOpenId] = useState<string | null>(data.notFound ? null : (data.thread?.id ?? null));
  const [gone, setGone] = useState(data.notFound);
  const [panelOpen, setPanelOpen] = useState(initial?.panelOpen ?? true);
  const [drawer, setDrawer] = useState(initial?.drawer ?? false);
  const [evidence, setEvidence] = useState<EvidenceFocus | null>(initial?.evidence ?? null);
  const lastSent = useRef('');

  /** CH-13922: a brand-new thread is in History at once, and the address names it, so a reload resumes. */
  const adopt = useCallback((id: string) => {
    const name = titleFromQuestion(lastSent.current);
    setOpenId(id);
    setTitle((t) => t ?? name);
    setConversations((c) => (c.list.some((x) => x.id === id) ? c : { ...c, list: [{ id, title: name, updatedAt: new Date().toISOString() }, ...c.list] }));
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
    setGone(false);
    chat.send(text);
  };
  // The composer's own gate already refused offline and blocked sends.
  const send = (text: string) => {
    lastSent.current = text;
    setGone(false);
    chat.send(text);
  };

  const newChat = () => {
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
  const histProps = { conversations, openId, nowIso: data.nowIso, timezone: data.timezone, onNew: newChat, onRetry: () => router.refresh() };

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
        autoFocus={variant === 'hero'}
        fresh={showHome}
      />
    </SectionBoundary>
  );

  const body = gone ? (
    <AskUnavailable onNew={newChat} phone={phone} />
  ) : data.threadFailed ? (
    <AskThreadFailed onRetry={() => router.refresh()} onNew={newChat} />
  ) : showHome ? (
    <AskHome data={data} phone={phone} heroComposer={composer('hero')} onAsk={ask} onRetry={() => router.refresh()} />
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
    <main className={'ch-ask' + (phone ? ' is-phone' : '') + (showHome ? ' is-home' : '')} aria-label="Ask CoachHelm" data-ch-code="CH-13820">
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
        <CoachHelmTabs active="ask" />
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
