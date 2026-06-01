'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · AskThreadPane — the right thread pane
 * ----------------------------------------------------------------------------
 * The two-pane inbox's RIGHT pane. A flat matte `InstrumentPanel`: the
 * message-bubble thread reads against a calm matte well, and the composer sits
 * in a sunken matte track. It EMBEDS the existing v3 Chat primitives
 * UNCHANGED:
 *   • ChatMessageList  — message-bubble stream (preserved, re-skinned only by
 *                        its own matte surfaces; we do not touch it)
 *   • ChatComposer     — the send textarea + magnetic send button (preserved)
 *
 * It owns NO send logic of its own — the parent AskWorkspace drives sending via
 * the shared `useCoachChatSend` hook and passes `onSend` / `pending` / `error`
 * down. This pane is pure PRESENTATION + LAYOUT: a matte thread well + a sunken
 * matte composer track, smooth auto-scroll, an honest empty prompt, and a
 * RECOVERABLE error affordance (InlineNotice + Retry) replacing the legacy flat
 * red chip.
 *
 * Optional origin header (blueprint residual #3 / #4): when the open thread has
 * a known origin (player / insight / round) the route can pass `originLabel` +
 * `originHref` to render a quiet, factual "About <origin>" context line —
 * omitted entirely otherwise.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { ChatMessageList } from '@/components/golf/coachhelm/v3/Chat/ChatMessageList';
import { ChatComposer } from '@/components/golf/coachhelm/v3/Chat/ChatComposer';
import { EmptyState, InlineNotice } from '@/components/fairway/feedback';
import { Button } from '@/components/fairway/controls/button';
import { InstrumentPanel } from '@/components/fairway/instrument';

export interface AskThreadPaneProps {
  /** The open thread's messages (SSR initial or the latest from a send). */
  messages: ChatMessage[];
  /** Active conversation id, or null when no thread is open yet. */
  activeId: string | null;
  /** True while a send is in flight (drives the thinking dots + composer lock). */
  pending: boolean;
  /** Last send/load error, or null. Rendered as a recoverable InlineNotice. */
  error: string | null;
  /** Send a message (the shared optimistic-send hook from the parent). */
  onSend: (text: string) => Promise<boolean> | void;
  /** Retry the last failed action (clears the error and resends/reloads). */
  onRetry?: () => void;
  /** Dismiss the current error without retrying. */
  onDismissError?: () => void;
  /** Optional origin label for the open thread's context line. */
  originLabel?: string;
  /** Optional real deep-link to the thread's origin. */
  originHref?: string;
  className?: string;
}

export function AskThreadPane({
  messages,
  activeId,
  pending,
  error,
  onSend,
  onRetry,
  onDismissError,
  originLabel,
  originHref,
  className,
}: AskThreadPaneProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Smooth auto-scroll to the newest message (mirrors ChatDrawer's behavior).
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [messages, pending]);

  const isEmptyThread = activeId === null && messages.length === 0;

  return (
    // The frosted bezel — the pane FLOATS as glass chrome (padding:none, edge-to-
    // edge), but everything inside stays matte + legible. A labelled section.
    <InstrumentPanel
      as="section"
      depth="raised"
      padding="none"
      aria-label="Conversation"
      className={cn('flex min-h-[60vh] flex-col overflow-hidden', className)}
    >
      {/* Bezel header — ONLY the optional origin context line (the factual
          "About <player/insight/round>" that spawned the thread). The shell
          already owns the "Ask CoachHelm" title, so there is no decorative
          eyebrow here. Omitted entirely when there is no origin. */}
      {originLabel ? (
        <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
          <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            About
          </span>
          {originHref ? (
            <Link
              href={originHref}
              className="inline-flex min-w-0 items-center gap-1 rounded-fw-sm font-fw-sans text-body-sm font-medium text-accent-700 outline-none transition-colors hover:text-accent-800 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <span className="truncate">{originLabel}</span>
              <ArrowRight size={13} aria-hidden="true" className="flex-shrink-0" />
            </Link>
          ) : (
            <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-secondary">
              {originLabel}
            </span>
          )}
        </header>
      ) : null}

      {/* Thread scroll region — a MATTE well so the conversation reads cleanly
          against the glass (readability over glass for the chat itself). The
          embedded ChatMessageList is UNCHANGED. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-surface px-4 py-5 sm:px-5"
      >
        {isEmptyThread ? (
          <EmptyState
            variant="subtle"
            title="Pick a conversation"
            description="Choose a thread on the left, or ask CoachHelm a new question below."
          />
        ) : (
          <ChatMessageList messages={messages} pending={pending} />
        )}

        {/* Recoverable error — InlineNotice + Retry (replaces the flat red chip). */}
        {error ? (
          <div className="mt-4">
            <InlineNotice
              tone="danger"
              title="Message didn't send"
              action={
                onRetry ? (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    Retry
                  </Button>
                ) : undefined
              }
              dismissible={Boolean(onDismissError)}
              onDismiss={onDismissError}
            >
              {error}
            </InlineNotice>
          </div>
        ) : null}
      </div>

      {/* Composer track — a sunken MATTE track (readability over glass for the
          composer too). ChatComposer itself is UNCHANGED. Adapt onSend to the
          composer's `Promise<void> | void` contract — the composer awaits then
          discards the boolean the send hook returns. */}
      <div className="border-t border-border-subtle bg-surface-sunken">
        <ChatComposer
          onSend={async (text) => {
            await onSend(text);
          }}
          disabled={pending}
        />
      </div>
    </InstrumentPanel>
  );
}
