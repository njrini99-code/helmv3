'use client';

import { useQuickChatRun } from '../../../shell/quick-chat/QuickChatProvider';
import { AskKnowsPanel } from './parts/KnowsPanel';
import { AllowanceMeter, PlayerOut } from './parts/Allowance';
import { ArtifactView } from './parts/Artifact';
import { askSlashCommands } from '../../../data/coachhelm-slash';
import type { AskArtifact } from './parts/artifacts';
import { MessagesSquare, PanelLeftOpen, Settings2, SquarePen } from 'lucide-react';
import { Modal } from '../../../ui/Modal';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../../../data/coachhelm-chat-error';
import { titleFromQuestion, type ChAskConversation, type ChAskData, type ChAskLoad } from '../../../data/coachhelm-chat-shape';
import { pendingApproval, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneIconAction } from '../../../ui/PhoneBar';
import { Icon } from '../../../ui/Icon';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { Tooltip } from '../../../ui/Tooltip';
import { PhoneTop, usePhoneTabsHidden } from '../../../shell/phone-chrome';
import { AskComposer, useRefuseOffline } from './Composer';
import { askDraftKey, useAskKept } from './drafts';
import { AskEvidencePanel } from './EvidencePanel';
import { conversationHref, HistoryDrawer, HistoryPanel } from './History';
import { AskHome, AskHomeV2 } from './Home';
import { AskInputsFailed, AskNoRoster, AskThreadFailed, AskUnavailable } from './States';
import { useViewSwitch } from '../use-view-switch';
import { PLAYER_HELM_HREF } from '../../../data/coachhelm-views-shape';
import { PlayerHelmTabs } from '../views/PlayerHelmTabs';
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

/** A desktop window too narrow for the chats, the conversation and the evidence together (the `has-panel.has-evidence` grid). */
const narrowDesktop = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1440px)').matches === true;

/** The team's name beside the sub-tab strip: a label, not a switcher (the shell owns the active team). */
function TeamLabel({ name }: { name: string }) {
  return (
    <span className="ch-ask-team">
      <i aria-hidden="true" />
      {name}
    </span>
  );
}

/** A player's Ask is a view of their CoachHelm: the same strip, so Your week, Standing and Deep dive are one tap away. */
function PlayerAskTabs() {
  const router = useRouter();
  return <PlayerHelmTabs active="ask" onGo={(v) => router.push(PLAYER_HELM_HREF[v])} />;
}

/** The frame the states without a chat share: the sub-tab strip (so the Board is one tap away) over the state. */
function AskFrame({ team, children }: { team?: string; children: ReactNode }) {
  const phone = useChPhone();
  const sw = useViewSwitch<CoachHelmView>('ask', (v) => COACHHELM_HREF[v]);
  return (
    <main className={'ch-ask is-plain' + (phone ? ' is-phone' : '')} aria-label="Ask CoachHelm" aria-busy={sw.pending || undefined} data-ch-code="CH-13820" {...sw.enter}>
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
/** The scope line's words: who, from a name in the question, and the window, if the question gave one. Never a figure, so it can't overclaim. */
export function askScope(question: string, team: string, names: readonly string[]): string {
  const q = question.toLowerCase();
  const who = names.find((n) => q.includes(n.toLowerCase()) || q.includes((n.split(' ')[0] ?? n).toLowerCase())) ?? team;
  const rounds = q.match(/last (\d+) rounds/)?.[0];
  const window = rounds ?? (/this season|this fall|this spring/.exec(q)?.[0]) ?? (/last season|last fall/.exec(q)?.[0]) ?? 'last 30 days';
  return `${who} · ${window}`;
}

export function Ask({ load, chat = useCoachHelmChat, initial, v2 = false, slashFlags }: { slashFlags?: { plans: boolean; lineup: boolean }; load: ChAskLoad; chat?: ChAskChat; initial?: ChAskInitial; v2?: boolean }) {
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
  return <AskChat key={load.data.notFound ? 'gone' : (load.data.thread?.id ?? 'new')} data={load.data} useChatImpl={chat} initial={initial} v2={v2} slashFlags={slashFlags} />;
}

function AskChat({ data, useChatImpl, initial, v2, slashFlags }: { data: ChAskData; useChatImpl: ChAskChat; initial?: ChAskInitial; v2: boolean; slashFlags?: { plans: boolean; lineup: boolean } }) {
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
  const [panelOpen, setPanelOpen] = useAskKept('askPanel', initial?.panelOpen ?? true);
  const [drawer, setDrawer] = useState(initial?.drawer ?? false);
  const [artifact, setArtifact] = useState<AskArtifact | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFocus | null>(initial?.evidence ?? null);
  // Below 1440px the chats, the conversation and the evidence do not fit side by side (the thread was about 330px at 1280): opening
  // the evidence moves the chats aside for as long as it is open, without changing the kept choice, and showing the chats closes it.
  const [chatsAside, setChatsAside] = useState(false);
  const openEvidence = (focus: EvidenceFocus | null) => {
    setChatsAside(!phone && focus !== null && narrowDesktop());
    setEvidence(focus);
  };
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

  const run = useQuickChatRun();
  const own = useChatImpl({
    conversationId: data.notFound ? null : (data.thread?.id ?? null),
    initialMessages: data.thread?.messages,
    // The hook calls this while it updates its own state: adopt the id after that render, not inside it.
    onConversationId: (id) => queueMicrotask(() => adopt(id)),
  });
  // The quick chat's run stays alive across the route: its thread renders from it until the run ends, then the loader takes over (05 S-PANEL.full).
  const chat = run?.busy && run.conversationId && run.conversationId === data.thread?.id ? run : own;

  const out = data.allowance === 'out' || chat.messages.some((m) => m.parts.some((p) => p.type === 'data-allowance'));
  const pending = pendingApproval(chat.messages);
  const showHome = chat.messages.length === 0 && !gone && !data.threadFailed;
  const notice = chat.error ? describeChatError(chat.error) : null;
  // A thread covers the page, so the phone tab bar steps aside; the new-chat home keeps it.
  usePhoneTabsHidden(phone && !showHome);

  // CP-1, CP-3: the turn the coach stopped says so, from its own card, until the next send.
  const [stoppedTurn, setStoppedTurn] = useState<string | null>(null);
  const stop = () => {
    const last = chat.messages[chat.messages.length - 1];
    setStoppedTurn(last?.role === 'assistant' ? last.id : null);
    chat.stop();
  };
  const send = (text: string) => {
    setStoppedTurn(null);
    lastSent.current = text;
    expecting.current = openId === null ? epoch.current : null;
    setGone(false);
    chat.send(text);
  };
  /** False when it wasn't sent, so a card that sends through this can stay open. */
  const ask = (text: string): boolean => {
    if (chat.busy || pending || refuseOffline()) return false;
    send(text);
    return true;
  };
  // `send`, for the composer, is the same without the gate: it already refused offline and blocked sends.

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
    setArtifact(null);
    window.history.replaceState(window.history.state, '', COACHHELM_HREF.ask);
  };

  // A reply that ends on its own (not a failure) needs nothing here; a thread that finished and then closed the evidence for a
  // conversation that is no longer open must not keep it.
  useEffect(() => {
    if (chat.messages.length === 0) setEvidence(null);
  }, [chat.messages.length]);

  const heading = gone ? 'Chat not found' : (title ?? 'New chat');
  const player = data.role === 'player';
  const histProps = {
    // Desktop: at the foot of the rail. Phone: the settings sheet (S-ASK.settings.sheet).
    footer: v2 && data.knows && !player && !phone ? <AskKnowsPanel knows={data.knows} conversationId={openId} /> : undefined,
    conversations,
    openId: chatSw.shown === NEW_CHAT ? null : chatSw.shown,
    nowIso: data.nowIso,
    timezone: data.timezone,
    onNew: newChat,
    onOpen: chatSw.go,
  };

  // S-ASK.scope: what the last question is about, in the same words the question used; it changes when a question is sent.
  const lastAsked = [...chat.messages].reverse().find((m) => m.role === 'user')?.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join(' ') ?? '';
  const scopeLine = showHome ? `${player ? 'My rounds' : data.teamName} · this season` : askScope(lastAsked, player ? 'My rounds' : data.teamName, player ? [] : (data.players ?? []).map((p) => p.name));

  const composer = (variant: 'hero' | 'dock') => (
    <SectionBoundary surface="coachhelm.ask.composer" label="The message box" code="CH-13225">
      <AskComposer
        hint={v2 ? (player ? 'Ask about your game' : 'Ask about your team') : undefined}
        scopeOf={v2 ? (text) => (text.trim() ? askScope(text, player ? 'My rounds' : data.teamName, player ? [] : (data.players ?? []).map((p) => p.name)) : scopeLine).split(' · ') : undefined}
        slash={v2 ? askSlashCommands({ player, plans: !!slashFlags?.plans, lineup: !!slashFlags?.lineup }) : undefined}
        variant={variant}
        phone={phone}
        players={data.players}
        busy={chat.busy}
        failed={Boolean(chat.error)}
        blocked={Boolean(pending)}
        onSend={send}
        onStop={stop}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- a component prop; the composer focuses itself in an effect
        autoFocus={variant === 'hero'}
        fresh={showHome}
        // The unsent text is this coach's, in this chat (the new chat is its own): it comes back when they return to the page.
        draftKey={askDraftKey(data.coachId, openId)}
      />
    </SectionBoundary>
  );

  const body = gone ? (
    <AskUnavailable onNew={newChat} phone={phone} />
  ) : data.threadFailed ? (
    <AskThreadFailed onNew={newChat} />
  ) : showHome ? (
    v2 ? <AskHomeV2 data={data} phone={phone} heroComposer={composer('hero')} onAsk={ask} focus={data.focus} /> : <AskHome data={data} phone={phone} heroComposer={composer('hero')} onAsk={ask} />
  ) : (
    <SectionBoundary surface="coachhelm.ask.thread" label="The conversation" code="CH-13225">
      <AskThread
        v2={v2}
        team={data.teamName}
        onArtifact={setArtifact}
        messages={chat.messages}
        busy={chat.busy}
        error={notice}
        offline={!online}
        phone={phone}
        players={data.players}
        onApprove={chat.approve}
        onDeny={chat.deny}
        onSend={ask}
        onStop={stop}
        stoppedTurn={stoppedTurn}
        onRetry={chat.retry}
        onNewChat={newChat}
        evidenceFocus={evidence}
        onOpenEvidence={openEvidence}
      />
    </SectionBoundary>
  );

  // The big box sits inside the new-chat page on desktop; everywhere else it docks at the foot.
  const docked = !(showHome && !phone) && !data.threadFailed;
  const evidenceOpen = evidence !== null && !showHome;
  const chatsShown = panelOpen && !(chatsAside && evidenceOpen);
  const showChats = () => {
    setPanelOpen(true);
    setChatsAside(false);
    if (evidenceOpen && narrowDesktop()) setEvidence(null);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const artifactView = artifact && <ArtifactView key={artifact.id} artifact={artifact} phone={phone} body={(b) => <pre className="ch-ak-plain">{typeof b === 'string' ? b : JSON.stringify(b, null, 2)}</pre>} onClose={() => setArtifact(null)} />;
  // The phone sheet's subject, kept after it closes so its exit still has the content it showed.
  const [sheetEvidence, setSheetEvidence] = useState<EvidenceFocus | null>(null);
  if (phone && evidenceOpen && evidence !== sheetEvidence) setSheetEvidence(evidence);

  return (
    <main className={'ch-ask' + (v2 ? ' ch-ak-root' : '') + (phone ? ' is-phone' : '') + (showHome ? ' is-home' : '')} aria-label="Ask CoachHelm" aria-busy={sw.pending || chatSw.pending || undefined} data-switch={sw.pending ? 'view' : chatSw.pending ? 'chat' : undefined} data-ch-code="CH-13820" {...sw.enter}>
      {phone && (
        <>
          <PhoneTop
            lead
            title={
              <>
                <Tooltip>
                  <button type="button" className="ch-pbar__icon" aria-label="Chats" onClick={() => setDrawer(true)}>
                    <Icon icon={MessagesSquare} size={20} />
                  </button>
                </Tooltip>
                <span className="ch-ask-ph__title">{showHome && !gone ? 'CoachHelm' : heading}</span>
              </>
            }
            action={
              <>
                {v2 && data.knows && !player && <PhoneIconAction icon={Settings2} label="Chat settings" onClick={() => setSettingsOpen(true)} />}
                <PhoneIconAction icon={SquarePen} label="New chat" onClick={newChat} />
              </>
            }
          />
          <h1 className="ch-sr-only">Ask CoachHelm</h1>
          {v2 && data.knows && !player && (
            <Modal open={settingsOpen} title="Chat settings" detent={0.62} className="ch-ak-settings" onClose={() => setSettingsOpen(false)}>
              <AskKnowsPanel knows={data.knows} conversationId={openId} />
            </Modal>
          )}
        </>
      )}
      <div className="ch-ask-top">
        {player ? <PlayerAskTabs /> : <CoachHelmTabs active={sw.shown} onGo={sw.go} />}
        {player && data.allowance && !(v2 && showHome) && <AllowanceMeter bucket={data.allowance} />}
        {!phone && <TeamLabel name={data.teamName} />}
      </div>
      <div className={'ch-ask-body' + (!phone && chatsShown ? ' has-panel' : '') + (!phone && evidenceOpen ? ' has-evidence' : '')}>
        {!phone && !player && (
          <SectionBoundary surface="coachhelm.ask.history" label="Your chats" code="CH-13225">
            <HistoryPanel {...histProps} heading="CoachHelm" open={chatsShown} onHide={() => setPanelOpen(false)} />
          </SectionBoundary>
        )}
        <section className="ch-ask-main" aria-label="Conversation">
          {!phone && (
            <header className="ch-ask-head">
              {!chatsShown && (
                <>
                  <Tooltip>
                    <button type="button" className="ch-ask-head__btn" aria-label="Show chats" onClick={showChats}>
                      <Icon icon={PanelLeftOpen} size={19} />
                    </button>
                  </Tooltip>
                  <Tooltip>
                    <button type="button" className="ch-ask-head__btn is-accent" aria-label="New chat" onClick={newChat}>
                      <Icon icon={SquarePen} size={19} />
                    </button>
                  </Tooltip>
                </>
              )}
              <h1 className="ch-ask-head__t">{heading}</h1>
            </header>
          )}
          {v2 && phone && !gone && (
            <p className="ch-ak-scope">
              Reading <b>{scopeLine}</b>
            </p>
          )}
          <div className={'ch-ask-scroll' + (showHome ? ' is-home' : !gone && !data.threadFailed ? ' is-thread' : '')}>{body}</div>
          {player && out && (
            <div className="ch-ask-dock">
              <PlayerOut />
            </div>
          )}
          {docked && !(player && out) && (
            <div className="ch-ask-dock">
              {composer('dock')}
              {!phone && (
                <p className="ch-ask-foot">CoachHelm reads {data.teamName} data only. Check the numbers before you act on them.</p>
              )}
            </div>
          )}
          {showHome && !phone && <p className="ch-ask-foot is-home">CoachHelm reads {data.teamName} data only. Check the numbers before you act on them.</p>}
        </section>
        {artifact && !phone && artifactView}
        {!phone && evidenceOpen && evidence && (
          <aside className="ch-ask-ev" aria-label="Evidence">
            <AskEvidencePanel focus={evidence} messages={chat.messages} phone={false} onClose={() => setEvidence(null)} />
          </aside>
        )}
      </div>
      {artifact && phone && artifactView}
      {phone && (
        <>
          <HistoryDrawer {...histProps} open={drawer} onClose={() => setDrawer(false)} />
          {/* On the phone the evidence panel is its own sheet (EvidencePanel, CH-13851); wrapping it in a second Modal here
              stacked an empty Evidence sheet in front of the real one. */}
          {/* Kept mounted after its first opening, so it slides out when closed rather than vanishing (audit A-18). */}
          {sheetEvidence && <AskEvidencePanel open={evidenceOpen} focus={sheetEvidence} messages={chat.messages} phone onClose={() => setEvidence(null)} />}
        </>
      )}
    </main>
  );
}
