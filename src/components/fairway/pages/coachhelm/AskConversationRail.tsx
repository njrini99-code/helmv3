'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · AskConversationRail — the left inbox rail
 * ----------------------------------------------------------------------------
 * The two-pane inbox's LEFT pane: a scannable list of past conversations. The
 * rail is a flat matte `InstrumentPanel`; the rows stay legible — a dense
 * scannable list, never a card-in-card. Each row is a real Next <Link> carrying
 * `?c=<id>` so the thread selection is shareable / SSR-resolvable (the existing
 * ?c= deep-link contract, preserved).
 *
 * PRESENTATION + ORGANIZATION ONLY. No data fetching, no send logic, no schema
 * change. It renders the SSR `listConversations()` rows the route passes down.
 *
 * RESTRAINT (flat-Apple — Ask is a conversation, not a gauge cluster):
 *   • the rail is a flat panel with a single factual "Threads" header + an
 *     honest thread-count micro-Readout in the bezel readout slot. No tagline.
 *   • the rows are calm: a sunken active row, a quiet hover, generous space.
 *
 * HONESTY CONTRACT (blueprint residual decisions #3):
 *   • last-message SNIPPET + relative date render ONLY when the data exists;
 *     otherwise they are omitted gracefully (never a fabricated preview). The
 *     persisted `golf_coachhelm_chat_conversations` row carries no snippet
 *     column today, so snippet is an OPTIONAL per-row lookup the route may
 *     supply (`snippetById`) — absent → the row simply shows title + date.
 *   • ORIGIN-CONTEXT chip (the player / insight / round that spawned a thread)
 *     renders ONLY when an origin is supplied (`originById`). No origin column
 *     exists today, so absent → no chip (no loader/schema change here).
 *   • the thread-count readout reads `awaiting` (never a fabricated 0) until at
 *     least one conversation exists.
 *
 * A11y (mustFix a11y:low): every rail row gets an EXPLICIT focus-visible green
 * ring on cream (the legacy ChatHistoryClient relied on the browser default).
 * The active row is announced with aria-current="true".
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageSquare, User, Lightbulb, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/lib/coachhelm/v3/chat/types';
import { EmptyState, Skeleton } from '@/components/fairway/feedback';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { InstrumentPanel, Readout } from '@/components/fairway/instrument';

/** Where a conversation was spawned — drives the optional origin context chip. */
export type AskOriginKind = 'player' | 'insight' | 'round';

export interface AskConversationOrigin {
  kind: AskOriginKind;
  /** Human label rendered in the chip (e.g. the player name, "Lag putting"). */
  label: string;
  /** Optional real deep-link to the origin. Renders the chip as a <Link>. */
  href?: string;
}

export interface AskConversationRailProps {
  /** SSR conversations (preserved `listConversations()` output). */
  conversations: ChatConversation[];
  /** The currently-open conversation id (resolved ?c= or the most-recent). */
  activeId: string | null;
  /**
   * Optional per-conversation last-message snippet, keyed by conversation id.
   * Render only when present — never fabricated. (No snippet column exists.)
   */
  snippetById?: Record<string, string | undefined>;
  /**
   * Optional per-conversation origin context, keyed by conversation id.
   * Render the chip only when present — never fabricated. (No origin column.)
   */
  originById?: Record<string, AskConversationOrigin | undefined>;
  /** First-paint loading rail (skeleton rows). */
  loading?: boolean;
  className?: string;
}

const ORIGIN_ICON: Record<AskOriginKind, React.ComponentType<{ size?: number; className?: string }>> = {
  player: User,
  insight: Lightbulb,
  round: Flag,
};

/** Relative date — only ever called with a real ISO string (never fabricated). */
function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return 'now';
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))}m`;
  if (diffMs < day) return `${Math.floor(diffMs / (60 * 60 * 1000))}h`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The origin context chip — only rendered when the data exists. */
function OriginChip({ origin }: { origin: AskConversationOrigin }) {
  const Icon = ORIGIN_ICON[origin.kind];
  const inner = (
    <StatusPill tone="neutral" size="sm" dot={false} className="max-w-full">
      <Icon size={11} aria-hidden="true" className="flex-shrink-0" />
      <span className="truncate">{origin.label}</span>
    </StatusPill>
  );
  if (origin.href) {
    return (
      <Link
        href={origin.href}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export function AskConversationRail({
  conversations,
  activeId,
  snippetById,
  originById,
  loading = false,
  className,
}: AskConversationRailProps) {
  const reduced = useReducedMotion() ?? false;

  // ── The rail bezel: a Fraunces "Threads" eyebrow + an honest thread-count
  //    micro-Readout (awaiting until at least one conversation exists). ────────
  const count = conversations.length;
  const countReadout = (
    <Readout
      value={count}
      format={{ maximumFractionDigits: 0 }}
      label="threads"
      size="sm"
      align="end"
      state={count > 0 ? 'live' : 'awaiting'}
      samples={count === 0 ? { have: 0, need: 1 } : undefined}
      awaitingLabel="None yet"
    />
  );

  if (loading) {
    return (
      <InstrumentPanel
        depth="base"
        padding="md"
        header="Threads"
        className={cn('flex flex-col', className)}
        aria-busy="true"
      >
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-fw-md px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="mt-2 h-3 w-44" />
            </div>
          ))}
        </div>
      </InstrumentPanel>
    );
  }

  if (conversations.length === 0) {
    return (
      <InstrumentPanel
        depth="base"
        padding="md"
        header="Threads"
        readout={countReadout}
        className={cn('flex flex-col', className)}
      >
        <EmptyState
          variant="subtle"
          icon={MessageSquare}
          title="No conversations yet"
          description="Ask CoachHelm a question to start your first thread — try a player, a pattern, or a round."
        />
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel
      as="nav"
      depth="base"
      padding="md"
      header="Threads"
      readout={countReadout}
      aria-label="Conversations"
      className={cn('flex flex-col', className)}
    >
      <ul className="flex flex-col gap-1">
        {conversations.map((c, i) => {
          const isActive = c.id === activeId;
          const snippet = snippetById?.[c.id]?.trim() || undefined;
          const origin = originById?.[c.id];
          const date = formatRelativeDate(c.updated_at);
          return (
            <motion.li
              key={c.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.32,
                ease: [0.16, 1, 0.3, 1],
                delay: reduced ? 0 : Math.min(i, 8) * 0.035,
              }}
            >
              <Link
                href={`/golf/dashboard/coachhelm/chat?c=${c.id}`}
                scroll={false}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  // Matte rows on warm glass — the dense list stays legible, never
                  // a second floating card. Active = a recessed sunken inset with
                  // an accent rail; hover = a calm warm sunken wash.
                  'group block rounded-fw-md px-3 py-2.5 outline-none transition-colors duration-[200ms]',
                  '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                  'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  isActive
                    ? 'bg-surface-sunken/90 shadow-[inset_2px_0_0_0_var(--fw-color-accent-500),inset_0_1px_2px_rgb(120_90_40/0.08)] ring-1 ring-inset ring-accent-200/60'
                    : 'hover:bg-surface-sunken/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate font-fw-sans text-body-sm font-medium',
                      isActive ? 'text-accent-700' : 'text-text-primary',
                    )}
                  >
                    {c.title?.trim() || 'Untitled conversation'}
                  </span>
                  {/* Relative date — omitted gracefully if the timestamp is unusable. */}
                  {date ? (
                    <time
                      dateTime={c.updated_at}
                      className="flex-shrink-0 font-fw-mono text-eyebrow tabular-nums text-text-tertiary"
                    >
                      {date}
                    </time>
                  ) : null}
                </div>

                {/* Last-message snippet — ONLY when the route supplied it. */}
                {snippet ? (
                  <p className="mt-1 line-clamp-1 font-fw-sans text-eyebrow leading-relaxed text-text-tertiary">
                    {snippet}
                  </p>
                ) : null}

                {/* Origin context chip — ONLY when an origin exists. */}
                {origin ? (
                  <div className="mt-2 flex">
                    <OriginChip origin={origin} />
                  </div>
                ) : null}
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </InstrumentPanel>
  );
}
