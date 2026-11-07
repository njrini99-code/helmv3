'use client';

import type { ChMessagesApi } from './api/types';
import { useState, useEffect, useCallback } from 'react';
import { type FirstMessage, type AnnDraft, NO_ANN } from './details/phone-types';
import { usePhoneStackHistory, PhoneTop } from '../../shell/phone-chrome';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { PhoneInboxV2 } from './inbox/PhoneInboxV2';
import { AnimatePresence } from 'motion/react';
import { PhoneThread } from './thread/PhoneThread';
import { haptic } from '../../lib/haptics';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { PhoneBar } from '../../ui/PhoneBar';
import { AnnouncementPane } from './announcements';
import { PhoneNewMessage } from './details/PhoneNewMessage';
import { PhoneAnnouncementForm } from './details/PhoneAnnouncementForm';
import { PhoneDetails } from './details/PhoneDetails';

/**
 * Messages on the phone: the owner's design (docs/clubhouse/phone/messages.md,
 * design/handoff/mobile/m-msg.jsx). An inbox that pushes a thread, a thread
 * that pushes its details, and New message as a pushed screen, on the same
 * container, hooks, actions and catalog as desktop. Each pushed screen is a
 * history entry, so the iOS edge swipe pops it (CH-1906).
 */
export function MessagesPhone({ api }: { api: ChMessagesApi }) {
  const [composing, setComposing] = useState(false);
  // "Message the team": New message with everyone in it and the team's name on the group, as the desk's dialog opens.
  const [teamSeed, setTeamSeed] = useState(false);
  useEffect(() => {
    if (api.prefill) setComposing(true);
  }, [api.prefill]);
  const [announcing, setAnnouncing] = useState(false);
  const [details, setDetails] = useState(false);
  /** The first message written in New message, sent by the thread's composer once the thread opens. */
  const [firstMessage, setFirstMessage] = useState<FirstMessage | null>(null);
  // What was typed in New message and New announcement outlives Cancel and Esc, until a conversation or a post takes it
  // (wave 5 #7, as Team Hub's compose).
  const [newDraft, setNewDraft] = useState<FirstMessage>({ text: "", files: [] });
  const [annDraft, setAnnDraft] = useState<AnnDraft>(NO_ANN);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const ann = api.announcements.find((a) => a.id === api.selectedAnnId) ?? null;
  useEffect(() => setDetails(false), [api.selectedId]);
  useEffect(() => {
    if (conv) setComposing(false);
    if (ann) setAnnouncing(false);
  }, [conv, ann]);

  const top = conv ? "thread" : ann ? "announcement" : announcing ? "announce" : composing ? "new" : null;
  const depth = (top ? 1 : 0) + (top === "thread" && details ? 1 : 0);
  const { select, selectAnn, selectedId, selectedAnnId } = api;
  const popTo = useCallback(
    (level: number) => {
      if (level < 2) setDetails(false);
      if (level < 1) {
        setComposing(false);
        setAnnouncing(false);
        if (selectedAnnId) selectAnn(null);
        if (selectedId) select(null);
      }
    },
    [select, selectAnn, selectedId, selectedAnnId],
  );
  usePhoneStackHistory(depth, popTo);

  return (
    <main className="ch-msp" aria-label="Messages">
      <PhoneTop
        title="Messages"
        start
        // The redesign's root keeps the bell: its New message key is the one in the body (MSG-1).
        action={
          undefined
        }
      />
      <div className="ch-msp-inbox" inert={depth > 0 || undefined}>
        <SectionBoundary surface="messages.rail" label="Your conversations" code="CH-7210">
          <PhoneInboxV2 api={api} onNew={() => setComposing(true)} onTeam={() => { setTeamSeed(true); setComposing(true); }} />
        </SectionBoundary>
      </div>

      <AnimatePresence>
        {top === "thread" && conv && (
          <PhoneThread
            key={`thread-${conv.id}`}
            api={api}
            conv={conv}
            onBack={() => (api.leaveToAsk ? api.leaveToAsk() : select(null))}
            onDetails={() => {
              haptic("select");
              setDetails(true);
            }}
            firstMessage={firstMessage ?? undefined}
            onFirstSent={() => setFirstMessage(null)}
            covered={details}
          />
        )}
        {top === "announcement" && ann && (
          <PhoneScreen key={`ann-${ann.id}`} labelledBy="ch-msp-ann-title" className="ch-msp-ann">
            <PhoneBar
              back={{ label: "Messages", onBack: () => selectAnn(null) }}
              title="Announcement"
              titleId="ch-msp-ann-title"
            />
            <SectionBoundary surface="messages.announcement" label="This announcement" code="CH-7211">
              <AnnouncementPane api={api} a={ann} onBack={() => selectAnn(null)} />
            </SectionBoundary>
          </PhoneScreen>
        )}
        {top === "new" && (
          <PhoneNewMessage
            key="new"
            api={api}
            teamSeed={teamSeed}
            onCancel={() => {
              setTeamSeed(false);
              setComposing(false);
              api.clearPrefill?.();
            }}
            onAnnounce={() => {
              setComposing(false);
              setAnnouncing(true);
            }}
            onFirstMessage={setFirstMessage}
            draft={newDraft}
            onDraft={setNewDraft}
          />
        )}
        {top === "announce" && (
          <PhoneAnnouncementForm key="announce" api={api} onCancel={() => setAnnouncing(false)} draft={annDraft} onDraft={setAnnDraft} />
        )}
        {top === "thread" && conv && details && (
          <PhoneDetails key={`details-${conv.id}`} api={api} conv={conv} onBack={() => setDetails(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}

