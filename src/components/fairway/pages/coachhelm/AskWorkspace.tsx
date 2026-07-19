'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · AskWorkspace — the "Ask" tab body
 * ----------------------------------------------------------------------------
 * The Ask tab over /golf/dashboard/coachhelm/chat. A calm two-pane inbox:
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  CoachHelm AI · Ask CoachHelm                       (shell)      │
 *   │  Brief · Signals · Players · Effectiveness · [Ask]  (sub-nav)    │
 *   ├──────────────────┬─────────────────────────────────────────────┤
 *   │ AskConversation  │  AskThreadPane                                │
 *   │ Rail (left)      │  (embedded ChatMessageList + ChatComposer)    │
 *   └──────────────────┴─────────────────────────────────────────────┘
 *
 * This is a PRESENTATION + LAYOUT + ORGANIZATION rebuild of the legacy
 * ChatHistoryClient. It RENDERS the CoachHelmShell wrapper itself (active='ask')
 * and accepts the same SSR data the route will pass: the conversation list, the
 * resolved ?c= id, and that thread's initial messages.
 *
 * PRESERVED LOGIC (imported UNCHANGED, never rewritten):
 *   • listConversations / listMessages reads happen on the SERVER (route), and
 *     their output arrives here as props — no fetching added here at module
 *     scope. The ?c= deep-link is preserved: rail rows are <Link href=?c=…>.
 *   • Client-side thread load on selection uses the EXISTING conversation GET
 *     route  GET /api/coachhelm/v3/chat/conversations/[id]  (unchanged).
 *   • Sending uses the shared `useCoachChatSend` hook → POST
 *     /api/coachhelm/v3/chat/send (unchanged). Same optimistic stub + rollback
 *     as ChatDrawer; the duplicated handleSend is gone.
 *
 * No loader/schema change: snippet + origin chips render only when the route
 * supplies them (residual decisions #3). Coach-gated Ask stays coach-gated —
 * the gate lives on the route + endpoints, not here.
 *
 * KNOWN GAP, DELIBERATELY OUT OF SCOPE HERE (#76 — AI states the wrong player
 * count, e.g. "all 6 players" against a 7-player roster): this workspace never
 * assembles roster/player-count context — it only renders `messages` it is
 * handed. The count the model states comes from `get_team_overview` in
 * src/lib/coachhelm/v3/chat/tools.ts, which silently `.filter()`s out any
 * `golf_team_members` row whose joined `golf_players` record comes back
 * null/malformed before counting — so a roster member with a missing/broken
 * player join is dropped from the count with no signal to the agent or the
 * coach. That file is outside this package's owned files (see round-2 task
 * scope); fixing it needs its own change (surface a `total_roster_size`
 * distinct from `players.length` returned to the model, or fail loud instead
 * of silently filtering) plus a regression test asserting the tool's returned
 * count matches `SELECT count(*) ... WHERE status = 'active'` for the team.
 * ========================================================================== */

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ChatConversation, ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { CoachHelmShell } from './CoachHelmShell';
import { useCoachChatSend } from './useCoachChatSend';
import {
  AskConversationRail,
  type AskConversationOrigin,
} from './AskConversationRail';
import { AskThreadPane } from './AskThreadPane';

export interface AskWorkspaceProps {
  /** SSR conversations (preserved `listConversations()` output). */
  conversations: ChatConversation[];
  /** The resolved ?c= id (or most-recent), as the route computed it. */
  initialConversationId: string | null;
  /** That thread's SSR messages (preserved `listMessages()` output). */
  initialMessages: ChatMessage[];
  /** Urgent/high open-signal count for the shell's Signals badge. */
  signalCount?: number | null;
  /**
   * Optional per-conversation last-message snippet (residual #3). Render-only
   * when present — never fabricated; no loader change here.
   */
  snippetById?: Record<string, string | undefined>;
  /**
   * Optional per-conversation origin context (residual #3/#4). Render-only when
   * present — never fabricated; no schema change here.
   */
  originById?: Record<string, AskConversationOrigin | undefined>;
  className?: string;
}

export function AskWorkspace({
  conversations,
  initialConversationId,
  initialMessages,
  signalCount,
  snippetById,
  originById,
  className,
}: AskWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The open conversation id + its message stream. The hook owns only the
  // in-flight pending flag + error; the workspace owns conversation + messages
  // (the ownership model useCoachChatSend was built for).
  const [conversationId, setConversationId] = React.useState<string | null>(
    initialConversationId,
  );
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [lastFailedSend, setLastFailedSend] = React.useState<string | null>(null);

  const { send, pending, error: sendError, clearError } = useCoachChatSend({
    conversationId,
    setConversationId: (id) => {
      setConversationId(id);
      // Keep the ?c= deep-link in sync after a first-message send creates a
      // new conversation server-side (so the thread is shareable/refresh-safe).
      if (id && searchParams.get('c') !== id) {
        router.replace(`/golf/dashboard/coachhelm/chat?c=${id}`, { scroll: false });
      }
    },
    setMessages,
  });

  // ── Rail selection via the ?c= search param ────────────────────────────────
  // Rail rows are real <Link href=?c=…> (shareable). When the param changes to
  // a conversation we don't already have open, load it through the PRESERVED
  // GET route — no new fetch plumbing, just the existing endpoint.
  const requestedId = searchParams.get('c');

  React.useEffect(() => {
    if (!requestedId || requestedId === conversationId) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const r = await fetch(`/api/coachhelm/v3/chat/conversations/${requestedId}`);
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        setConversationId(requestedId);
        setMessages((json.messages ?? []) as ChatMessage[]);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // requestedId is the only input that should re-trigger a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId]);

  // ── Send + retry wiring ─────────────────────────────────────────────────---
  const handleSend = React.useCallback(
    async (text: string) => {
      setLoadError(null);
      const ok = await send(text);
      setLastFailedSend(ok ? null : text);
      return ok;
    },
    [send],
  );

  const handleRetry = React.useCallback(() => {
    clearError();
    setLoadError(null);
    if (lastFailedSend) {
      const text = lastFailedSend;
      setLastFailedSend(null);
      void handleSend(text);
    }
  }, [clearError, handleSend, lastFailedSend]);

  const handleDismissError = React.useCallback(() => {
    clearError();
    setLoadError(null);
    setLastFailedSend(null);
  }, [clearError]);

  // The thread pane shows whichever error is live (send error wins, then load).
  const threadError = sendError ?? loadError;

  // Resolve the open thread's origin for the thread-pane context header.
  const activeOrigin = conversationId ? originById?.[conversationId] : undefined;

  // NOTE: this used to also pass a single-crumb `breadcrumbs={[{ label: activeTitle }]}`
  // leaf (the open thread's title) to CoachHelmShell. With only one crumb and no
  // href, CoachHelmShell's breadcrumb nav renders it with none of its usual
  // affordances (no separator chevron, no linked ancestor) — just the thread's
  // title as a bare span sitting between the masthead and the sub-nav tab bar,
  // reading as a stray unstyled echo of whatever question opened the thread
  // rather than a real breadcrumb trail. The rail already highlights the open
  // thread, so it carried no navigational value — dropped rather than restyled.

  const description =
    conversations.length === 0
      ? 'Ask CoachHelm anything about your team in natural language.'
      : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`;

  return (
    <CoachHelmShell
      active="ask"
      // `role` here is the CoachHelmShell domain prop (coach|player), NOT an
      // ARIA role — the a11y linter can't tell them apart on a string literal.
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title="Ask CoachHelm"
      description={description}
      className={className}
    >
      {/* ── The two-pane inbox: a conversation rail + a thread pane, both flat
            matte InstrumentPanels on the canvas wash. Ask is a conversation, so
            the chrome stays calm and the chat inside stays clean + legible.
            #948: the rail used to be a proportional `col-span-3` of 12 — on a
            laptop-width viewport (not an ultra-wide monitor) that resolved to
            ~180px, truncating every thread title down to "Can you…". A grid
            template column with a hard `minmax(260px, 300px)` floor keeps the
            rail readable regardless of viewport width; the thread pane takes
            the rest (`minmax(0, 1fr)` — the `0` avoids the classic grid-blowout
            gotcha where an unbreakable child forces the track wider). ── */}
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] md:gap-6',
        )}
      >
        {/* ── Left: conversation rail (sticky on desktop so the thread scrolls
              independently beside a pinned inbox). ──────────────────────────── */}
        <aside className="md:sticky md:top-6">
          <AskConversationRail
            conversations={conversations}
            activeId={conversationId}
            snippetById={snippetById}
            originById={originById}
          />
        </aside>

        {/* ── Right: thread pane (embedded ChatMessageList + ChatComposer) ─── */}
        <div className="min-w-0">
          <AskThreadPane
            messages={messages}
            activeId={conversationId}
            pending={pending}
            error={threadError}
            onSend={handleSend}
            onRetry={lastFailedSend ? handleRetry : undefined}
            onDismissError={handleDismissError}
            originLabel={activeOrigin?.label}
            originHref={activeOrigin?.href}
          />
        </div>
      </div>
    </CoachHelmShell>
  );
}
