'use client';

import { ChevronDown, ChevronUp, Eye, SquareArrowOutUpRight, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../data/coachhelm-chat-error';
import { pendingApproval } from '../data/coachhelm-chat-thread';
import { useDialogLifetime } from '../lib/dialog-lifetime';
import { useSheetDrag } from '../lib/sheet-drag';
import { useChPhone } from '../lib/use-phone';
import { Icon } from '../ui/Icon';
import { SectionBoundary } from '../ui/SectionBoundary';
import { AskComposer } from '../screens/coachhelm/chat/Composer';
import { conversationHref } from '../screens/coachhelm/chat/History';
import { COACHHELM_HREF } from '../screens/coachhelm/chat/SubTabs';
import { AskThread } from '../screens/coachhelm/chat/Thread';
import type { ChAskSheetChat } from './AskSheet';
import '../styles/coachhelm-ask.css';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/**
 * The Ask sheet's body (shell/AskSheet.tsx). Phone: a bottom sheet with two detents, half (it opens there, the page still
 * in view above it) and full (a thread grows into it; the grab toggles). Desktop: a centred sheet. The heading takes
 * focus as it opens, so a tap does not ring the close key (P001 finding: focus on touch-opened sheets).
 */
export default function AskSheetBody({
  open,
  onClose,
  looking,
  chat: useChatImpl = useCoachHelmChat,
}: {
  open: boolean;
  onClose: () => void;
  looking: { label: string; playerId: string | null };
  chat?: ChAskSheetChat;
}) {
  const phone = useChPhone();
  const router = useRouter();
  const titleId = useId();
  const { ref, reduced, retainContent } = useDialogLifetime(open, {
    direction: phone ? 'bottom' : 'center',
    surfaceSelector: '.ch-asks__panel',
    focusSelector: '.ch-asks__title',
  });
  const drag = useSheetDrag(ref, onClose, { enabled: phone && !reduced });
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const chat = useChatImpl({
    initialContext: looking.playerId ? [{ kind: 'player', id: looking.playerId, label: looking.label }] : [],
  });
  const [full, setFull] = useState(false);
  const fresh = chat.messages.length === 0;
  // A thread grows into the full sheet; an empty one opens at half, with the page still in view.
  useEffect(() => {
    if (!fresh) setFull(true);
  }, [fresh]);
  useEffect(() => {
    if (!open) setFull(!fresh);
  }, [open, fresh]);
  const pending = pendingApproval(chat.messages);
  const notice = chat.error ? describeChatError(chat.error) : null;
  const send = (text: string) => {
    if (chat.busy || pending || !online) return;
    chat.send(text);
  };

  return (
    // The click is only the backdrop dismiss; Esc arrives through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ch-asks"
      data-ch-code="CH-1841"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {retainContent(
        open && (
          <div className="ch-asks__panel" data-detent={phone ? (full ? 'full' : 'half') : undefined}>
            {phone && (
              <button
                type="button"
                className="ch-asks__grab"
                aria-label={full ? 'Make the sheet smaller' : 'Make the sheet full height'}
                onPointerDown={drag.onPointerDown}
                onClick={() => setFull((f) => !f)}
              >
                <i aria-hidden="true" />
              </button>
            )}
            <header className="ch-asks__head" onPointerDown={phone ? drag.onPointerDown : undefined}>
              <h2 id={titleId} className="ch-asks__title" tabIndex={-1}>
                Ask CoachHelm
              </h2>
              {phone && (
                <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={full ? 'Smaller' : 'Full height'} onClick={() => setFull((f) => !f)}>
                  <Icon icon={full ? ChevronDown : ChevronUp} size={16} />
                </button>
              )}
              <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label="Close" onClick={onClose}>
                <Icon icon={X} size={15} />
              </button>
            </header>
            <p className="ch-asks__ctx" data-ch-code="CH-1842">
              <Icon icon={Eye} size={13} />
              <span>
                Looking at: <b>{looking.label}</b>
              </span>
            </p>
            <div className={'ch-asks__scroll' + (fresh ? ' is-fresh' : '')}>
              {fresh ? (
                <p className="ch-asks__hint">Ask about what is on this page, or anything about your team. The chat is saved in CoachHelm.</p>
              ) : (
                <SectionBoundary surface="shell.ask.thread" label="The conversation" code="CH-1841">
                  <AskThread
                    messages={chat.messages}
                    busy={chat.busy}
                    error={notice}
                    offline={!online}
                    phone={phone}
                    players={[]}
                    onApprove={chat.approve}
                    onDeny={chat.deny}
                    onSend={send}
                    onStop={chat.stop}
                    onRetry={chat.retry}
                    onNewChat={chat.newConversation}
                    evidenceFocus={null}
                    // The evidence panel is CoachHelm's: the saved chat opens there, on this answer's thread.
                    onOpenEvidence={() => {
                      if (!chat.conversationId) return;
                      onClose();
                      router.push(conversationHref(chat.conversationId));
                    }}
                  />
                </SectionBoundary>
              )}
            </div>
            <div className="ch-asks__dock">
              <SectionBoundary surface="shell.ask.composer" label="The message box" code="CH-1841">
                <AskComposer
                  variant="dock"
                  phone={phone}
                  players={[]}
                  busy={chat.busy}
                  failed={Boolean(chat.error)}
                  blocked={Boolean(pending)}
                  onSend={send}
                  onStop={chat.stop}
                  fresh={fresh}
                />
              </SectionBoundary>
              <Link className="ch-asks__open" href={chat.conversationId ? conversationHref(chat.conversationId) : COACHHELM_HREF.ask} onClick={onClose}>
                Open in CoachHelm
                <Icon icon={SquareArrowOutUpRight} size={13} />
              </Link>
            </div>
          </div>
        ),
      )}
    </dialog>
  );
}
