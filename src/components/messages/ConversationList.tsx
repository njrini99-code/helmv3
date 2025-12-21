'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { SearchBar } from '@/components/ui/search-bar';
import { Button } from '@/components/ui/button';
import { IconPlus, IconCheck, IconCheckCheck, IconMessage, IconSearch } from '@/components/icons';
import type { ConversationWithMeta, ConversationWithParticipant } from '@/lib/types/messages';
import { getParticipantDetails } from '@/lib/types/messages';

interface ConversationListProps {
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
  currentUserId,
  onSelect,
  onNewConversation,
  className,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Get participant details for each conversation
  const conversationsWithDetails: ConversationWithParticipant[] = useMemo(() => {
    return conversations.map(conv => ({
      ...conv,
      participant: getParticipantDetails(conv, currentUserId),
    }));
  }, [conversations, currentUserId]);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversationsWithDetails;

    const query = searchQuery.toLowerCase();
    return conversationsWithDetails.filter(conv => {
      const name = conv.participant?.name?.toLowerCase() || '';
      const subtitle = conv.participant?.subtitle?.toLowerCase() || '';
      const lastMessage = conv.last_message?.content?.toLowerCase() || '';
      return name.includes(query) || subtitle.includes(query) || lastMessage.includes(query);
    });
  }, [conversationsWithDetails, searchQuery]);

  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Header */}
      <div className="px-4 py-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Messages</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={onNewConversation}
            className="rounded-full !px-3"
          >
            <IconPlus size={16} />
            <span className="ml-1.5">New</span>
          </Button>
        </div>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search conversations..."
          className="w-full"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              {searchQuery ? (
                <IconSearch size={24} className="text-slate-400" />
              ) : (
                <IconMessage size={24} className="text-slate-400" />
              )}
            </div>
            <h3 className="text-base font-medium text-slate-900 mb-1">
              {searchQuery ? 'No results' : 'No conversations'}
            </h3>
            <p className="text-sm text-slate-500 mb-4 max-w-[200px]">
              {searchQuery
                ? 'Try a different search term'
                : 'Start a conversation to connect with players or coaches'}
            </p>
            {!searchQuery && (
              <Button
                variant="primary"
                size="sm"
                onClick={onNewConversation}
              >
                <IconPlus size={16} className="mr-1.5" />
                New Message
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                currentUserId={currentUserId}
                onClick={() => onSelect(conversation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: ConversationWithParticipant;
  isSelected: boolean;
  currentUserId: string;
  onClick: () => void;
}

function ConversationItem({
  conversation,
  isSelected,
  currentUserId,
  onClick,
}: ConversationItemProps) {
  const participant = conversation.participant;
  const lastMessage = conversation.last_message;
  const unreadCount = conversation.unread_count || 0;
  const isFromMe = lastMessage?.sender_id === currentUserId;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-start gap-3 text-left transition-colors',
        'hover:bg-slate-50',
        isSelected && 'bg-green-50 hover:bg-green-50',
      )}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0">
        <Avatar
          name={participant?.name || 'Unknown'}
          src={participant?.avatar}
          size="md"
        />
        {participant?.isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className={cn(
            'font-medium text-sm truncate',
            unreadCount > 0 ? 'text-slate-900' : 'text-slate-700'
          )}>
            {participant?.name || 'Unknown'}
          </h4>
          {lastMessage?.sent_at && (
            <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
              {formatRelativeTime(lastMessage.sent_at)}
            </span>
          )}
        </div>

        {participant?.subtitle && (
          <p className="text-xs text-slate-500 truncate mb-1">
            {participant.subtitle}
          </p>
        )}

        <div className="flex items-center gap-1.5">
          {lastMessage && (
            <>
              {isFromMe && (
                <span className="flex-shrink-0">
                  {lastMessage.read ? (
                    <IconCheckCheck size={14} className="text-green-500" />
                  ) : (
                    <IconCheck size={14} className="text-slate-400" />
                  )}
                </span>
              )}
              <p className={cn(
                'text-sm truncate',
                unreadCount > 0 && !isFromMe
                  ? 'text-slate-900 font-medium'
                  : 'text-slate-500'
              )}>
                {lastMessage.content}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Unread Badge */}
      {unreadCount > 0 && (
        <div className="flex-shrink-0 self-center">
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-600 text-white text-xs font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}
