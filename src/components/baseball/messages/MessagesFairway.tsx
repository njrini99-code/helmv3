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
 *
 * The loading skeleton below is shaped exactly like the populated two-pane
 * layout (an `InstrumentPanel` rail + an `InstrumentPanel` thread well) so a
 * `<MessagesFairway loading .../>` render can ALSO stand in as the page's
 * outer `<Suspense>` fallback (see `MessagesClient.tsx`'s default export)
 * with zero shape change on mount — no cream/spinner flash swapping into a
 * differently-shaped skeleton once the client boundary hydrates.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
import { InstrumentPanel, Skeleton } from '@/components/fairway';

// `4rem` (64px) is the AppShell top bar's fixed height on every breakpoint
// (matches ConversationClient.tsx's sibling `100dvh-4rem` budget). The
// safe-area terms additionally reserve the notch/home-indicator insets on
// iOS so the two-pane split never renders under them.
const SHELL =
  'flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-hidden bg-canvas';

/** The rail's masthead — kept byte-identical to `MessagesClient.tsx`'s
 *  `RAIL_TITLE` so the loading -> loaded swap never changes the title. */
const RAIL_TITLE_SKELETON = (
  <h2 className="font-fw-display text-h3 font-semibold leading-tight text-text-primary">
    Messages
  </h2>
);

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
          <InstrumentPanel
            as="nav"
            depth="base"
            padding="md"
            header={RAIL_TITLE_SKELETON}
            aria-label="Conversations"
            aria-busy="true"
            className="flex h-full min-h-0 flex-col"
          >
            <div className="flex flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-start gap-3 rounded-fw-md px-3 py-2.5">
                  <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-sunken" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-surface-sunken" />
                    <div className="h-3 w-4/5 rounded bg-surface-tint" />
                  </div>
                </div>
              ))}
            </div>
          </InstrumentPanel>
        </div>
        <div className="hidden flex-1 lg:block">
          <InstrumentPanel
            as="section"
            depth="raised"
            padding="none"
            aria-label="Conversation"
            className="flex h-full min-h-0 items-center justify-center overflow-hidden"
          >
            <Skeleton className="h-24 w-48" />
          </InstrumentPanel>
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
