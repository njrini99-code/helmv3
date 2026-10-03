'use client';

import { MessageSquare, SquarePen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-7309 (D-71): no conversation and no announcement yet, so the whole page
 * is the v2 first-run empty with its one action, New message. With anything
 * in the list, the rail's compact empty (CH-7301) and the thread's (CH-7305)
 * take over.
 */
export function MessagesFirstRun({ coach, onNew }: { coach: boolean; onNew: () => void }) {
  return (
    <EmptyState
      size="page"
      code="CH-7309"
      icon={MessageSquare}
      title="No conversations yet"
      body={coach ? 'Start a thread with the whole team or message a player directly.' : 'Message a coach or a teammate. Team announcements show up here too.'}
      action={
        <Button variant="primary" leftIcon={SquarePen} onClick={onNew}>
          New message
        </Button>
      }
    />
  );
}

/** Nothing to list at all (the list read, not loading or failed). */
export function isMessagesFirstRun(api: { convs: unknown[]; announcements: unknown[]; convsLoading: boolean; convsError: unknown; annLoading?: boolean }): boolean {
  // Not before the announcements answer: one landing would swap the first-run page for the inbox (a layout shift).
  return !api.convsLoading && !api.annLoading && !api.convsError && api.convs.length === 0 && api.announcements.length === 0;
}
