'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconPlus, IconMail } from '@/components/icons';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

interface GolfConversationListProps {
  conversations: GolfConversationWithMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
  className?: string;
}

export function GolfConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  className,
}: GolfConversationListProps) {
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

  return (
    <div className={cn('flex flex-col bg-white', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
        <Button size="sm" onClick={onNewConversation} className="gap-1">
          <IconPlus size={16} />
          New
        </Button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <IconMail size={24} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">No conversations yet</p>
            <p className="text-xs text-slate-400 mt-1">Start a new message to get started</p>
            <Button size="sm" onClick={onNewConversation} className="mt-4 gap-1">
              <IconPlus size={16} />
              New Message
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  'w-full px-4 py-3 flex items-start gap-3 text-left transition-colors',
                  'hover:bg-slate-50',
                  selectedId === conversation.id && 'bg-green-50 hover:bg-green-50'
                )}
              >
                <div className="relative">
                  <Avatar
                    name={conversation.other_participant?.name || 'Unknown'}
                    src={conversation.other_participant?.avatar}
                    size="md"
                  />
                  {conversation.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
                      {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={cn(
                      'font-medium truncate',
                      conversation.unread_count > 0 ? 'text-slate-900' : 'text-slate-700'
                    )}>
                      {conversation.other_participant?.name || 'Unknown'}
                    </p>
                    {conversation.last_message && (
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                        {formatTime(conversation.last_message.sent_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {conversation.other_participant?.type === 'coach' && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded flex-shrink-0">
                        Coach
                      </span>
                    )}
                    <p className={cn(
                      'text-sm truncate',
                      conversation.unread_count > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'
                    )}>
                      {conversation.last_message?.content || 'No messages yet'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
