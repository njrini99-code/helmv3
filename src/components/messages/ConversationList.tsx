'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconPlus } from '@/components/icons';
import { EmptyIssue } from '@/components/baseball/living-annual';
import type { ConversationWithMeta } from '@/lib/types/messages';

export interface ConversationListProps {
  conversations: ConversationWithMeta[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  className?: string;
}

export function ConversationList({
  conversations,
  selectedId,
   
  currentUserId: _currentUserId,
  onSelect,
  onNewConversation,
  className,
}: ConversationListProps) {
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Get participant name from the other_user data
  const getParticipantName = (conversation: ConversationWithMeta): string => {
    const otherUser = conversation.other_user;
    if (!otherUser) return 'Unknown';

    const coach = otherUser.coach || otherUser.coaches;
    if (coach) {
      return coach.full_name || 'Coach';
    }

    const player = otherUser.player || otherUser.players;
    if (player) {
      return [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player';
    }

    return otherUser.display_name || otherUser.email || 'Unknown';
  };

  const getParticipantAvatar = (conversation: ConversationWithMeta): string | null => {
    const otherUser = conversation.other_user;
    if (!otherUser) return null;

    const coach = otherUser.coach || otherUser.coaches;
    if (coach) return coach.avatar_url ?? null;

    const player = otherUser.player || otherUser.players;
    if (player) return player.avatar_url;

    return null;
  };

  const isCoach = (conversation: ConversationWithMeta): boolean => {
    const otherUser = conversation.other_user;
    if (!otherUser) return false;
    return !!(otherUser.coach || otherUser.coaches);
  };

  return (
    <div className={cn('flex flex-col bg-cream-50', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-200">
        <h2 className="text-lg font-semibold text-warm-900">Messages</h2>
        <Button size="sm" onClick={onNewConversation} className="gap-1">
          <IconPlus size={16} />
          New
        </Button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          // One EmptyIssue dialect for the whole inbox (matches EmptyChatState's
          // "no conversation selected" + ChatWindow's "no messages yet" — no
          // bespoke gradient-chip empty box here either).
          <div className="flex items-center justify-center py-12 px-4">
            <EmptyIssue
              variant="messages"
              ink="team"
              className="max-w-md"
              action={
                <Button size="sm" onClick={onNewConversation} className="gap-1">
                  <IconPlus size={16} />
                  New Message
                </Button>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-warm-100">
            {conversations.map((conversation) => {
              const name = getParticipantName(conversation);
              const avatar = getParticipantAvatar(conversation);
              const isCoachUser = isCoach(conversation);

              return (
                <Button variant="primary"
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    'w-full px-4 py-3 flex items-start gap-3 text-left transition-colors',
                    'hover:bg-warm-50',
                    selectedId === conversation.id && 'bg-primary-50 hover:bg-primary-50'
                  )}
                >
                  <div className="relative">
                    <Avatar
                      name={name}
                      src={avatar}
                      size="md"
                    />
                    {(conversation.unread_count ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
                        {(conversation.unread_count ?? 0) > 9 ? '9+' : conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={cn(
                        'font-medium truncate',
                        (conversation.unread_count ?? 0) > 0 ? 'text-warm-900' : 'text-warm-700'
                      )}>
                        {name}
                      </p>
                      {conversation.last_message && (
                        <span className="text-xs text-warm-400 flex-shrink-0 ml-2">
                          {formatTime(conversation.last_message.sent_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isCoachUser && (
                        <span className="px-1.5 py-0.5 bg-primary-100 text-primary-700 text-micro font-medium rounded flex-shrink-0">
                          Coach
                        </span>
                      )}
                      <p className={cn(
                        'text-sm truncate',
                        (conversation.unread_count ?? 0) > 0 ? 'text-warm-700 font-medium' : 'text-warm-500'
                      )}>
                        {conversation.last_message?.content || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
