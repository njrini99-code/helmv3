'use client';

/**
 * ============================================================================
 * CoachHelm · Ask — the full-page surface
 * ----------------------------------------------------------------------------
 * The conversation gets the page. History is a collapsible rail, not a
 * permanent third of the screen.
 *
 * That is the main change from the previous build, and it was not cosmetic: the
 * old workspace gave a fixed 260–300px column to a list of past questions, so
 * the analysis — charts, comparison tables, the actual product — was squeezed
 * into what was left. On a laptop that made every chart cramped in service of
 * a list most coaches open once a week. History is now off by default and one
 * button away, and the answer gets the width.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { PanelLeft, Plus, X } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/lib/coachhelm/v3/chat/types';
import { CoachHelmChat } from './CoachHelmChat';
import type { ComposerPlayer } from './PromptComposer';

export interface AskSurfaceProps {
  teamName: string;
  players: ComposerPlayer[];
  suggestions: string[];
  conversations: ChatConversation[];
  conversationId: string | null;
  initialMessages: UIMessage[];
  /**
   * A question started on the Brief and carried here via `?q=`. Seeded into
   * the composer so the coach does not retype it — but not auto-sent, because
   * a page that fires a request on load is a page that fires it again on
   * refresh.
   */
  pendingQuestion?: string | null;
}

export function AskSurface({
  teamName,
  players,
  suggestions,
  conversations,
  conversationId,
  initialMessages,
  pendingQuestion,
}: AskSurfaceProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);

  /**
   * Put the freshly-minted conversation in the address bar.
   *
   * `history.replaceState`, not `router.replace`: a router navigation re-runs
   * this server component and remounts the chat on its `conversationId` key,
   * which would throw away a stream that is still arriving. Only the URL needs
   * to change — the thread on screen is already correct — and changing it is
   * what makes a reload, a bookmark, or a shared link resume the conversation
   * instead of opening an empty one.
   */
  const adoptConversationInUrl = React.useCallback((id: string) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('c') === id) return;
    url.searchParams.set('c', id);
    // `q` seeded the first question; leaving it would re-seed the composer on
    // every subsequent visit to this now-permanent link.
    url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  return (
    // `--fw-shell-offset` is the shell's real chrome above + below this page
    // (AppShell declares it; the golf shell re-declares it for the coach FAB
    // pad). The old `7rem` fallback was a guess that undercounted the mobile
    // tab bar and the desktop FAB clearance, so this box was taller than the
    // space it had: the page scrolled 41px at 390x844 and 97px at 1440x900,
    // and the composer — the one control this surface exists for — sat under
    // the bottom tab bar. Keep a fallback for any host that doesn't set it.
    <div className="flex h-[calc(100dvh-var(--fw-shell-offset,7rem))] min-h-0 flex-col" data-slot="ask-surface">
      {/* ── Slim bar. Deliberately not a page header: the conversation is the
            page, and a tall masthead above a chat is wasted vertical space. ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2 sm:px-6">
        {/* eslint-disable-next-line helm/no-raw-button -- compact toolbar toggle, not a <Button> pill */}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          aria-label={historyOpen ? 'Hide conversation history' : 'Show conversation history'}
          className={cn(
            'inline-flex min-h-[40px] items-center gap-2 rounded-fw-md px-2.5',
            'font-fw-sans text-caption text-text-tertiary transition-colors',
            'hover:bg-surface-sunken hover:text-text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          <PanelLeft aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
        </button>

        <span className="flex-1" />

        <Link
          href="/golf/dashboard/coachhelm/chat"
          className={cn(
            'inline-flex min-h-[40px] items-center gap-1.5 rounded-fw-md px-2.5',
            'font-fw-sans text-caption text-text-tertiary transition-colors',
            'hover:bg-surface-sunken hover:text-text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          <Plus aria-hidden className="h-4 w-4" />
          New
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── History rail ─────────────────────────────────────────────────
              A real overlay on phone (it would otherwise steal the whole
              screen) and an inline column from `md`. */}
        {historyOpen && (
          <>
            {/* eslint-disable-next-line helm/no-raw-button -- full-bleed scrim — a dismiss target with no visible chrome */}
            <button
              type="button"
              aria-label="Close history"
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-[var(--fw-z-overlay,40)] bg-canvas/60 md:hidden"
            />
            <aside
              aria-label="Conversation history"
              className={cn(
                'fixed inset-y-0 left-0 z-[var(--fw-z-drawer,50)] w-[min(20rem,85vw)] overflow-y-auto',
                'border-r border-border-subtle bg-surface p-3',
                'md:static md:z-auto md:w-[17rem] md:shrink-0 md:bg-canvas',
              )}
            >
              <div className="mb-2 flex items-center justify-between md:hidden">
                <span className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                  History
                </span>
                {/* eslint-disable-next-line helm/no-raw-button -- icon-only close in an overlay header */}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-fw-md text-text-tertiary"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>

              {conversations.length === 0 ? (
                <p className="px-2 py-3 font-fw-sans text-caption text-text-tertiary">
                  No previous conversations.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/golf/dashboard/coachhelm/chat?c=${c.id}`}
                        onClick={() => setHistoryOpen(false)}
                        className={cn(
                          'block min-h-[44px] rounded-fw-md px-2.5 py-2.5',
                          'font-fw-sans text-body-sm transition-colors',
                          c.id === conversationId
                            ? 'bg-surface-sunken text-text-primary'
                            : 'text-text-secondary hover:bg-surface-sunken',
                          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                        )}
                      >
                        <span className="line-clamp-2">{c.title ?? 'Conversation'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CoachHelmChat
            key={conversationId ?? 'new'}
            players={players}
            suggestions={suggestions}
            conversationId={conversationId}
            initialMessages={initialMessages}
            onConversationId={adoptConversationInUrl}
            variant="page"
            initialInput={pendingQuestion ?? undefined}
            greeting={<Greeting teamName={teamName} />}
          />
        </div>
      </div>
    </div>
  );
}

function Greeting({ teamName }: { teamName: string }) {
  return (
    <div className="mb-1">
      <h1 className="font-fw-display text-h2 font-semibold tracking-[-0.02em] text-text-primary">
        What do you want to know about {teamName}?
      </h1>
      <p className="mt-1.5 font-fw-sans text-body-sm text-text-tertiary">
        Answers come from your recorded rounds, signals and schedule.
      </p>
    </div>
  );
}
