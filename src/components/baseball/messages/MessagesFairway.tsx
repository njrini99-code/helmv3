'use client';

/**
 * ============================================================================
 * MessagesFairway — Fairway (warm-premium) frame for the baseball Messages
 * page. Phase B leaf migration, Wave 2 · messages. Flag-gated behind
 * `isRedesignEnabled()` — see the page fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY — and pure LAYOUT. It owns nothing but the page-level
 * chrome: the canvas background, the responsive two-pane split, and a
 * token-true loading skeleton. The conversation list, chat window, empty state,
 * and new-message modal are passed in as slots (built by the page with all
 * their existing state/handlers wired), so this component never imports or
 * touches the messaging data path — `use-messages.ts` and `NewMessageModal`'s
 * coach/org fetch stay entirely with Lane A.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway';

const SHELL = 'flex h-[calc(100dvh-64px)] bg-canvas';

export interface MessagesFairwayProps {
  loading: boolean;
  /** True on mobile when the chat pane is showing (hides the list). */
  mobileShowChat: boolean;
  /** The conversation list pane (built by the page with its handlers). */
  listSlot: ReactNode;
  /** The chat window or empty state (built by the page). */
  chatSlot: ReactNode;
  /** The new-message modal (built by the page; owns its own visibility). */
  modalSlot: ReactNode;
}

export function MessagesFairway({
  loading,
  mobileShowChat,
  listSlot,
  chatSlot,
  modalSlot,
}: MessagesFairwayProps) {
  if (loading) {
    return (
      <div className={fairwayScope(SHELL)}>
        <div className="w-full flex-shrink-0 border-r border-border-subtle lg:w-80 xl:w-96">
          <div className="border-b border-border-subtle p-4">
            <div className="h-10 animate-pulse rounded-fw-md bg-surface-sunken" />
          </div>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-sunken" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 h-4 w-2/3 rounded bg-surface-sunken" />
                  <div className="h-3 w-4/5 rounded bg-surface-tint" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <Skeleton className="h-24 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope(SHELL)}>
      <div
        className={cn(
          'w-full flex-shrink-0 border-r border-border-subtle',
          'transition-transform duration-300',
          mobileShowChat && 'hidden lg:block',
          'lg:w-80 xl:w-96',
        )}
      >
        {listSlot}
      </div>

      <div className={cn('min-w-0 flex-1', !mobileShowChat && 'hidden lg:block')}>
        {chatSlot}
      </div>

      {modalSlot}
    </div>
  );
}

export default MessagesFairway;
