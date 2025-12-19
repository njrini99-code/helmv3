import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { formatRelativeTime, getFullName } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/database';

interface MessagePreviewProps {
  conversation: Conversation;
}

export function MessagePreview({ conversation }: MessagePreviewProps) {
  const other = conversation.other_user;
  const name = other?.coach?.full_name || getFullName(other?.player?.first_name, other?.player?.last_name) || 'Unknown';
  const subtitle = other?.coach?.school_name || (other?.player ? `${other.player.primary_position} • ${other.player.grad_year}` : '');
  const hasUnread = (conversation.unread_count || 0) > 0;

  return (
    <Link
      href={`/dashboard/messages/${conversation.id}`}
      className={cn(
        'flex items-start gap-4 p-4 transition-all duration-200 border-b border-slate-100/50',
        'hover:bg-slate-50/50',
        hasUnread && 'bg-slate-50/80'
      )}
    >
      <Avatar name={name} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm truncate', hasUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-900')}>{name}</p>
          {conversation.last_message && (
            <p className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{formatRelativeTime(conversation.last_message.sent_at)}</p>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{subtitle}</p>
        {conversation.last_message && (
          <p className={cn('text-sm truncate mt-1', hasUnread ? 'text-slate-900' : 'text-slate-500')}>{conversation.last_message.content}</p>
        )}
      </div>
      {hasUnread && (
        <div className="w-2 h-2 rounded-full bg-slate-900 flex-shrink-0 mt-2 animate-pulse" />
      )}
    </Link>
  );
}
