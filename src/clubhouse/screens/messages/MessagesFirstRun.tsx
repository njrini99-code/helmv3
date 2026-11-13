'use client';

import { MessageSquare, SquarePen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/**
 * CH-7309 (D-71): no conversation and no announcement yet, so the whole page
 * is the first-run empty with its one action, Start a conversation. With anything
 * in the list, the rail's compact empty (CH-7301) and the thread's (CH-7305)
 * take over. The shared page empty (W19 B, owner, 12 Nov 2026), not a drawing
 * of its own: one empty state across the app.
 */
export function MessagesFirstRun({ onNew, teamName, onTeam }: { coach: boolean; onNew: () => void; teamName?: string; onTeam?: () => void }) {
  return (
    <EmptyState
      size="page"
      code="CH-7309"
      icon={MessageSquare}
      title="No conversations yet"
      body={`Message a player, a coach or the whole team. Everything stays inside ${teamName ?? 'your team'}.`}
      action={
        <Button variant="primary" leftIcon={SquarePen} onClick={onNew}>
          Start a conversation
        </Button>
      }
      secondaryAction={
        onTeam ? (
          <Button variant="ghost" onClick={onTeam}>
            Message the team
          </Button>
        ) : undefined
      }
    />
  );
}

/** Nothing to list at all (the list read, not loading or failed). */
export function isMessagesFirstRun(api: { convs: unknown[]; announcements: unknown[]; convsLoading: boolean; convsError: unknown; annLoading?: boolean }): boolean {
  // Not before the announcements answer: one landing would swap the first-run page for the inbox (a layout shift).
  return !api.convsLoading && !api.annLoading && !api.convsError && api.convs.length === 0 && api.announcements.length === 0;
}
