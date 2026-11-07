'use client';

import type { ChMessagesApi } from './api/types';
import { useState, useEffect, useCallback } from 'react';
import { useDetailsColumn } from './details-v2';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Rail } from './inbox/Rail';
import { NewMessagePane } from './NewMessagePane';
import { Swap } from '../../ui/Swap';
import { AnnouncementPane } from './announcements';
import { Thread } from './thread/Thread';
import { isMessagesFirstRun, MessagesFirstRun } from './MessagesFirstRun';
import { EmptyState } from '../../ui/States';
import { MessageSquare, SquarePen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Details } from './details/Details';
import { NewMessage } from './details/NewMessage';

export function MessagesDesktop({ api }: { api: ChMessagesApi }) {
  const [details, setDetails] = useState(false);
  const [compose, setCompose] = useState(false);
  const [dialogMode, setDialogMode] = useState<"group" | "announce" | null>(null);
  const detailsMounted = useDetailsColumn(details);
  // A prefilled message keeps today's dialog: it carries people, a group name and a draft (MSG-NEW-02 draws only the plain start).
  const newPane = compose && !api.prefill && !dialogMode;
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const ann = api.announcements.find((a) => a.id === api.selectedAnnId) ?? null;
  useEffect(() => setDetails(false), [api.selectedId]);
  useEffect(() => {
    if (api.prefill) setCompose(true);
  }, [api.prefill]);
  const { clearPrefill } = api;
  const closeCompose = useCallback(() => {
    setCompose(false);
    clearPrefill?.();
  }, [clearPrefill]);
  // CH-7605: going from one open thread or announcement to another settles the new one in (base in, quick out). The
  // first one a visit opens (the newest thread, or a link's) appears at once.
  const paneKey = ann ? `a:${ann.id}` : conv ? `c:${conv.id}` : null;
  const [pane, setPane] = useState({ key: paneKey, turn: 0 });
  if (pane.key !== paneKey) setPane({ key: paneKey, turn: pane.key === null ? pane.turn : pane.turn + 1 });

  return (
    <main
      data-view="desktop"
      className={
        "ch-ms" +
        (conv || ann ? " has-open" : "") +
        (details && conv ? " has-details" : "")
      }
    >
      <SectionBoundary
        surface="messages.rail"
        label="Your conversations"
        code="CH-7210"
      >
        <Rail api={api} onNew={() => setCompose(true)} />
      </SectionBoundary>
      {newPane ? (
        <NewMessagePane
          api={api}
          onCancel={() => setCompose(false)}
          onDialog={(mode) => setDialogMode(mode)}
        />
      ) : (
      <Swap swapKey={pane.turn} className="ch-ms-pane">
        {ann ? (
          <SectionBoundary
            surface="messages.announcement"
            label="This announcement"
            code="CH-7211"
          >
            <AnnouncementPane
              api={api}
              a={ann}
              onBack={() => api.selectAnn(null)}
            />
          </SectionBoundary>
        ) : conv ? (
          <SectionBoundary
            surface="messages.thread"
            label="This conversation"
            code="CH-7212"
          >
            <Thread
              api={api}
              conv={conv}
              detailsOpen={details}
              setDetails={setDetails}
              onBack={() => api.select(null)}
            />
          </SectionBoundary>
        ) : isMessagesFirstRun(api) ? (
          <section className="ch-ms-thread is-empty">
            <MessagesFirstRun
              teamName={api.teamName ?? undefined}
              coach={api.viewer.role === "coach"}
              onNew={() => setCompose(true)}
              onTeam={api.viewer.role === "coach" ? () => { setDialogMode("group"); setCompose(true); } : undefined}
            />
          </section>
        ) : (
          <section className="ch-ms-thread is-empty">
            <EmptyState
              code="CH-7305"
              icon={MessageSquare}
              title={
                api.convs.length
                  ? "Pick a conversation"
                  : "Start your first conversation"
              }
              body={
                api.convs.length
                  ? "Threads open here, with replies as they arrive."
                  : "Message a player, a coach or the whole team."
              }
              action={
                <Button
                  variant="primary"
                  leftIcon={SquarePen}
                  onClick={() => setCompose(true)}
                >
                  New message
                </Button>
              }
            />
          </section>
        )}
      </Swap>
      )}
      {conv && detailsMounted && (
        <SectionBoundary
          surface="messages.details"
          label="Details"
          code="CH-7213"
        >
          <Details api={api} conv={conv} onClose={() => setDetails(false)} />
        </SectionBoundary>
      )}
      <NewMessage
        api={api}
        open={compose && !newPane}
        initialMode={dialogMode ?? undefined}
        onClose={() => {
          setDialogMode(null);
          closeCompose();
        }}
      />
    </main>
  );
}

// Compatibility barrel: the names tests and older callers still read from here. Components live in the package folders
// (inbox/, thread/, overlays/, details/; docs/clubhouse/messages-v2/SEAMS.md). Nothing under those folders imports this file.
export type { ChPendingAttachmentSend, ChAttachmentRecovery, ChMessagesApi } from './api/types';
export { ConvRow } from './inbox/ConvRow';
export { Attachments } from './thread/Attachments';
export { Composer } from './thread/Composer';
export { useAutosize } from './thread/composer-parts';
