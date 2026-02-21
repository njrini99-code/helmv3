'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { IconMessage, IconPlus } from '@/components/icons';

interface EmptyChatStateProps {
  onNewConversation: () => void;
  className?: string;
}

export function EmptyChatState({ onNewConversation, className }: EmptyChatStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center bg-slate-50/50',
      className
    )}>
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-6">
        <IconMessage size={36} className="text-primary-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No conversation selected
      </h3>
      <p className="text-sm text-slate-500 text-center max-w-xs mb-6 leading-relaxed">
        Select a conversation from the list to view messages, or start a new conversation to connect with coaches and players.
      </p>
      <Button onClick={onNewConversation} className="gap-2">
        <IconPlus size={16} />
        New Message
      </Button>
    </div>
  );
}
