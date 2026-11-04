'use client';

import { SquarePen } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-7309 (D-71): no conversation and no announcement yet, so the whole page
 * is the v2 first-run empty with its one action, New message. With anything
 * in the list, the rail's compact empty (CH-7301) and the thread's (CH-7305)
 * take over.
 */
export function MessagesFirstRun({ coach, onNew, redesign = false, teamName, onTeam }: { coach: boolean; onNew: () => void; /** golf_messages_redesign_v1: one still card (S-MSG.empty). */ redesign?: boolean; teamName?: string; onTeam?: () => void }) {
  if (redesign)
    return (
      <section className="ch-msv-empty" data-ch-code="CH-7309">
        <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true">
          <rect x="6" y="8" width="58" height="34" rx="14" fill="var(--ch-well-bg-flat)" />
          <rect x="32" y="24" width="58" height="32" rx="14" fill="var(--ch-bubble-mine-fill)" />
        </svg>
        <h2>No conversations yet</h2>
        <p>{coach ? `Start a thread with ${teamName ?? 'the whole team'} or message a player directly.` : `Message a coach or a teammate on ${teamName ?? 'your team'}.`}</p>
        <button type="button" className="ch-msv-empty__cta" onClick={onNew}>
          <Icon icon={SquarePen} size={18} />
          Start a conversation
        </button>
        {onTeam && (
          <button type="button" className="ch-msv-empty__ghost" onClick={onTeam}>
            Message the team
          </button>
        )}
      </section>
    );
  return (
    <EmptyState
      size="page"
      code="CH-7309"
      shape="people"
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
