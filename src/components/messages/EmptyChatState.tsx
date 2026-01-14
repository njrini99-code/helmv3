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
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <IconMessage size={32} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-1">
        No conversation selected
      </h3>
      <p className="text-sm text-slate-500 text-center max-w-xs mb-4">
        Select a conversation from the list or start a new one
      </p>
      <Button onClick={onNewConversation} className="gap-2">
        <IconPlus size={16} />
        New Message
      </Button>
    </div>
  );
}
