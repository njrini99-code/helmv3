'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { IconPlus } from '@/components/icons';
import { EmptyIssue } from '@/components/baseball/living-annual';

interface EmptyChatStateProps {
  onNewConversation: () => void;
  className?: string;
}

/**
 * "No conversation selected" — the chat pane's resting state before a thread
 * is picked (mirrors `EmptyIssue variant="messages"` already used by the
 * sibling `messages/[id]` "thread not found" state, per the Living-Annual
 * empty-state doctrine — no bespoke gradient-chip empty box).
 */
export function EmptyChatState({ onNewConversation, className }: EmptyChatStateProps) {
  return (
    <div className={cn('flex items-center justify-center p-6', className)}>
      <EmptyIssue
        variant="messages"
        ink="team"
        className="max-w-md"
        action={
          <Button onClick={onNewConversation} className="gap-2">
            <IconPlus size={16} />
            New Message
          </Button>
        }
      />
    </div>
  );
}
