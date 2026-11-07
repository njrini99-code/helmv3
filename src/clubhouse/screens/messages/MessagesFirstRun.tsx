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
        <svg className="ch-msv-empty__illo" viewBox="0 0 168 120" aria-hidden="true">
          <ellipse cx="84" cy="111" rx="62" ry="5" fill="var(--ch-well-bg-flat)" />
          <rect x="16" y="16" width="92" height="56" rx="22" fill="var(--ch-card-bg)" stroke="var(--ch-border-hairline)" />
          <path d="M28 68c-1 8-5 12-11 15 9 1 16-2 22-8z" fill="var(--ch-card-bg)" />
          <rect x="32" y="33" width="50" height="7" rx="3.5" fill="var(--ch-well-bg-flat)" />
          <rect x="32" y="48" width="32" height="7" rx="3.5" fill="var(--ch-well-bg-flat)" />
          <rect x="64" y="46" width="88" height="50" rx="21" fill="var(--ch-bubble-mine-fill)" />
          <path d="M142 90c2 7 5 11 10 13-8 1-14-2-19-7z" fill="var(--ch-bubble-mine-fill)" />
          <path d="M98 60v22" stroke="var(--ch-card-bg)" strokeWidth="2" strokeLinecap="round" />
          <path d="M99 60l13 5-13 5z" fill="var(--ch-champagne-dot)" />
          <circle cx="122" cy="80" r="3.2" fill="var(--ch-card-bg)" />
        </svg>
        <h2>No conversations yet</h2>
        <p>{`Message a player, a coach or the whole team. Everything stays inside ${teamName ?? 'your team'}.`}</p>
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
