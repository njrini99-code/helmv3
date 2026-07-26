'use client';

/**
 * ============================================================================
 * CoachHelm · chat — the shared surface
 * ----------------------------------------------------------------------------
 * The whole conversational experience, in one component. The full page and the
 * drawer mount THIS; they differ only in `variant`, which controls width,
 * whether the empty state is spacious or compact, and how the composer docks.
 *
 * The alternative — a page component and a drawer component that each assemble
 * a thread and a composer — is what the previous build did, and the two had
 * already drifted apart on retry behaviour before anyone noticed. Layout is a
 * prop; behaviour is not forkable.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { UIMessage } from 'ai';
import { useCoachHelmChat, type ChatContextChip } from './useCoachHelmChat';
import { ChatThread } from './ChatThread';
import { PromptComposer, type ComposerPlayer } from './PromptComposer';

export interface CoachHelmChatProps {
  players: ComposerPlayer[];
  /** Data-derived openers. Max five; never hardcoded fake conditions. */
  suggestions?: string[];
  conversationId?: string | null;
  initialMessages?: UIMessage[];
  /** Context the host page contributes. Rendered as removable chips. */
  initialContext?: ChatContextChip[];
  variant?: 'page' | 'drawer';
  /**
   * Text to open the composer with — e.g. a question started on the Brief and
   * carried here. Seeded, never auto-sent: the coach still presses send.
   */
  initialInput?: string;
  /** Greeting shown above the composer on an empty thread. */
  greeting?: React.ReactNode;
  /**
   * What fills the rest of an empty page, below the composer and the openers.
   *
   * The page passes the program's current findings here. Without it the empty
   * state is a greeting and a text box floating in a full-height column, which
   * is how this surface shipped and why the top third of it was blank. The
   * drawer passes nothing — at ~28rem there is no room for it, and it gets the
   * suggestion pills alone.
   *
   * A render prop rather than a node: asking is the whole point of these rows,
   * and `send` belongs to the hook inside this component. Handing the caller a
   * node would mean lifting the conversation state out to whoever composes the
   * page, which is exactly the split this component exists to prevent.
   */
  opening?: (ask: (text: string) => void) => React.ReactNode;
  /** Fires when the server mints a conversation for a thread that had none. */
  onConversationId?: (id: string) => void;
  className?: string;
}

export function CoachHelmChat({
  players,
  suggestions = [],
  conversationId,
  initialMessages,
  initialContext,
  variant = 'page',
  initialInput,
  greeting,
  opening,
  onConversationId,
  className,
}: CoachHelmChatProps) {
  const chat = useCoachHelmChat({
    conversationId,
    initialMessages,
    initialContext,
    onConversationId,
  });
  const scroller = React.useRef<HTMLDivElement>(null);
  const isEmpty = chat.messages.length === 0;

  const playersByName = React.useMemo(
    () => Object.fromEntries(players.map((p) => [p.name, p.id])),
    [players],
  );

  // Follow the stream, but only while the coach is already at the bottom.
  // Yanking someone back down mid-scroll while they are reading the evidence
  // from three answers ago is the single most irritating thing a chat can do.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 160) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [chat.messages, chat.busy]);

  const composer = (
    <PromptComposer
      onSend={chat.send}
      onStop={chat.stop}
      busy={chat.busy}
      players={players}
      context={chat.context}
      onRemoveContext={chat.removeContext}
      onAddContext={chat.addContext}
      safeArea={variant === 'drawer'}
      initialValue={initialInput}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- an empty Ask page exists to be typed into
      autoFocus={variant === 'page' && isEmpty}
      placeholder={variant === 'drawer' ? 'Ask about this page' : 'Ask about your program'}
    />
  );

  // ── Empty: the greeting, the composer, then the program itself ───────────
  if (isEmpty) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        {/*
          The question block is PINNED and the findings scroll beneath it.

          Top-aligned, not centred: `justify-center` was described as calm and
          was in practice a blank top third — a greeting and a text box floating
          in the middle of a 100dvh column with nothing above them. Centring is
          right for a genuinely empty room, and this page is not one; it opens
          with what the program looks like today.

          But once the findings are real content they can overflow a laptop, and
          putting the whole empty state in one scroller meant the composer —
          the one control this page exists for — scrolled away with them. So the
          greeting, the composer and the openers are a fixed header, and only the
          findings move.
        */}
        <div
          className={cn('shrink-0', variant === 'page' ? 'px-4 pt-6 sm:px-6' : 'px-4 pt-5')}
        >
          <div className={cn('mx-auto w-full', variant === 'page' ? 'max-w-[46rem]' : 'max-w-full')}>
            {greeting}
            <div className={cn(greeting ? 'mt-6' : '')}>{composer}</div>
            {suggestions.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {/* Both variants wrap. A horizontal rail was tried in the drawer
                    and looked broken rather than scrollable: at ~28rem a single
                    suggestion fills the width and the next is sliced down the
                    middle at the panel edge. The drawer is desktop-only, so it
                    has the vertical room a phone did not — it just gets fewer. */}
                {suggestions.slice(0, variant === 'drawer' ? 3 : 5).map((s) => (
                  <li key={s} className="max-w-full">
                    {/* eslint-disable-next-line helm/no-raw-button -- opening suggestion chip — a rounded-full pill of its own scale */}
                    <button
                      type="button"
                      onClick={() => chat.send(s)}
                      className={cn(
                        'inline-flex min-h-[44px] max-w-full items-center rounded-full border border-border-subtle bg-surface px-4 py-1.5',
                        'text-left font-fw-sans text-body-sm text-text-secondary transition-colors',
                        'hover:border-accent-300 hover:text-text-primary',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      )}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {opening && (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              variant === 'page' ? 'px-4 pb-10 sm:px-6' : 'px-4 pb-5',
            )}
          >
            <div
              className={cn('mx-auto w-full', variant === 'page' ? 'max-w-[46rem]' : 'max-w-full')}
            >
              {opening(chat.send)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active: analysis column centred, composer sticky at the foot ─────────
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scroller}
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
          variant === 'page' ? 'px-4 pb-6 pt-2 sm:px-6' : 'px-4 pb-4 pt-3',
        )}
      >
        {/*
          `mt-auto` anchors a SHORT conversation to the composer.

          Without it the first exchange pinned itself to the top of a
          full-height column and left ~550px of empty canvas between the answer
          and the input — the same blank-screen problem the empty state had,
          just one question later.

          `mt-auto` rather than `justify-end` on the scroller: both push short
          content down, but `justify-end` on a scroll container makes the
          overflowing top unreachable in Chrome and Firefox. An auto margin on
          the child is the long-standing fix and scrolls correctly once the
          thread outgrows the viewport.
        */}
        <div
          className={cn('mx-auto mt-auto w-full', variant === 'page' ? 'max-w-[52rem]' : 'max-w-full')}
        >
          <ChatThread
            messages={chat.messages}
            busy={chat.busy}
            onApprove={chat.approve}
            onDeny={chat.deny}
            onSuggestion={chat.send}
            onStop={chat.stop}
            playersByName={playersByName}
          />

          {chat.error && (
            <div className="mt-6 rounded-card border border-border-subtle bg-surface p-4">
              {/* Show the server's own sanitised reason when it sent one. A
                  generic "that didn't come through" in front of an exhausted
                  model quota sends a coach to retry forever against something
                  no amount of retrying fixes. */}
              <p className="font-fw-sans text-body-sm text-text-primary">
                {chat.error.message?.trim() || 'That answer did not come through.'}
              </p>
              {/* eslint-disable-next-line helm/no-raw-button -- inline retry inside an error notice */}
              <button
                type="button"
                onClick={chat.retry}
                className={cn(
                  'mt-3 inline-flex min-h-[44px] items-center rounded-fw-md border border-border-subtle px-4',
                  'font-fw-sans text-body-sm text-text-secondary transition-colors hover:bg-surface-sunken',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                )}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-border-subtle bg-canvas',
          variant === 'page' ? 'px-4 py-3 sm:px-6' : 'px-4 py-3',
        )}
      >
        <div className={cn('mx-auto w-full', variant === 'page' ? 'max-w-[52rem]' : 'max-w-full')}>
          {composer}
        </div>
      </div>
    </div>
  );
}
