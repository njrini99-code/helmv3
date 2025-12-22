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
      'flex flex-col items-center justify-center h-full bg-slate-50/50 text-center px-8',
      className
    )}>
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center mb-6">
        <IconMessage size={36} className="text-green-600" />
      </div>

      <h3 className="text-xl font-semibold text-slate-900 mb-2">
        Your Messages
      </h3>

      <p className="text-sm leading-relaxed text-slate-500 max-w-sm mb-6">
        Connect with coaches and players. Start a conversation to discuss recruiting, share updates, or ask questions.
      </p>

      <Button variant="primary" onClick={onNewConversation}>
        <IconPlus size={16} />
        Start a Conversation
      </Button>

      <div className="mt-12 grid grid-cols-3 gap-8 text-center">
        <div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg">1</span>
          </div>
          <p className="text-xs text-slate-500">Search for a player or coach</p>
        </div>
        <div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg">2</span>
          </div>
          <p className="text-xs text-slate-500">Send your first message</p>
        </div>
        <div>
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg">3</span>
          </div>
          <p className="text-xs text-slate-500">Build connections</p>
        </div>
      </div>
    </div>
  );
}
