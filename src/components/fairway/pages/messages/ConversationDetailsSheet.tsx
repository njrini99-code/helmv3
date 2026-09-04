'use client';

/**
 * Fairway · messages · ConversationDetailsSheet — spec §37.
 *
 * The destination for tapping the thread header. Before this, the header named
 * the conversation and did nothing when touched, which on a phone reads as a
 * dead control: the one place a group's membership is obviously "behind" was
 * unreachable.
 *
 * Scope is deliberately what EXISTS. The spec's §37 list also names shared
 * media, pinned messages and per-conversation notification settings; none of
 * those has a backing store yet, and rendering them as inert rows would be a
 * menu of things that do not work — worse than a shorter sheet that is honest.
 * Search is here because cross-conversation search already ships in the rail;
 * it focuses that field rather than pretending to be a second search.
 */

import * as React from 'react';
import { Search, Users } from 'lucide-react';
import { Sheet } from '@/components/fairway/overlays';
import { Avatar } from '@/components/fairway/controls/avatar';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { cn } from '@/lib/utils';
import { messageAvatarFallbackClass } from './message-avatar';

export interface ConversationDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conversation display name (already resolved by the caller). */
  name: string;
  /** True for a group/team channel. */
  isGroup: boolean;
  /** DM counterpart's avatar, when there is one. */
  avatar?: string | null;
  /** Group roster, user_id -> name/avatar. Absent for a DM. */
  participants?: Map<string, { name: string; avatar: string | null }>;
  /** Focus the conversation-search field in the rail. */
  onSearch?: () => void;
}

export function ConversationDetailsSheet({
  open,
  onOpenChange,
  name,
  isGroup,
  avatar,
  participants,
  onSearch,
}: ConversationDetailsSheetProps) {
  const members = React.useMemo(
    () =>
      participants
        ? [...participants.entries()]
            .map(([id, p]) => ({ id, ...p }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [participants],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={name}
      hideTitle
    >
      <div className="flex flex-col gap-5 pb-2">
        {/* Identity. The sheet opens from a header that is one compact row, so
            this is where the conversation gets to be shown at a size that
            actually reads as a person or a team. */}
        <div className="flex flex-col items-center gap-2 pt-1 text-center">
          {isGroup ? (
            <Avatar name={name} size="lg" className={messageAvatarFallbackClass(name)} />
          ) : (
            <Avatar
              name={name}
              src={avatar ?? undefined}
              size="lg"
              className={avatar ? undefined : messageAvatarFallbackClass(name)}
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-fw-sans text-body-lg font-semibold text-text-primary">
              {name}
            </p>
            {/* A count, only when we actually have the roster. "0 members"
                for a group whose participants have not loaded would be a
                number stating something false. */}
            {isGroup && members.length > 0 ? (
              <p className="font-fw-sans text-caption text-text-tertiary">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>
            ) : null}
          </div>
        </div>

        {onSearch ? (
          <div className="border-y border-border-subtle">
            <PressTarget
              type="button"
              className={cn(
                'flex min-h-11 w-full items-center gap-3 px-1 text-left',
                'font-fw-sans text-body font-medium text-text-primary',
                'transition-colors active:bg-surface-sunken',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              )}
              onClick={() => {
                onOpenChange(false);
                onSearch();
              }}
            >
              <Search size={18} aria-hidden="true" className="text-text-tertiary" />
              <span>Search messages</span>
            </PressTarget>
          </div>
        ) : null}

        {isGroup && members.length > 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 font-fw-sans text-caption font-semibold text-text-tertiary">
              <Users size={14} aria-hidden="true" />
              Members
            </p>
            <ul className="flex flex-col">
              {members.map((m, i) => (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-center gap-3 py-2',
                    i > 0 && 'border-t border-border-subtle',
                  )}
                >
                  <Avatar
                    name={m.name}
                    src={m.avatar ?? undefined}
                    size="sm"
                    className={m.avatar ? undefined : messageAvatarFallbackClass(m.id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-fw-sans text-body text-text-primary">
                    {m.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
