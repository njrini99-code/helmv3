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

import { clearAskHandoff, hasAskHandoff } from '@/lib/golf/ask-handoff';
import * as React from 'react';
import Link from 'next/link';
import { PanelLeft, Plus, X } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/lib/coachhelm/v3/chat/types';
import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';
import { CoachHelmChat } from './CoachHelmChat';
import { ProgramOpening } from './ProgramOpening';
import type { ComposerPlayer } from './PromptComposer';

/** A fresh thread's history: one stable empty array, not a new one per render. */
const NO_MESSAGES: UIMessage[] = [];

export interface AskSurfaceProps {
  teamName: string;
  players: ComposerPlayer[];
  suggestions: string[];
  conversations: ChatConversation[];
  conversationId: string | null;
  initialMessages: UIMessage[];
  /** The program's current findings, rendered as the empty state. */
  pulseItems: PulseItem[];
  /** Preformatted server-side — a client-formatted time mismatches on hydration. */
  asOfLabel: string | null;
  coverage: string | null;
  /**
   * A question started on the Brief and carried here via `?q=`. Submitted
   * automatically, once, through the composer's own send path — the Brief's
   * Send button navigates here specifically so the question does not sit
   * unsent, waiting on a SECOND click the coach has no reason to expect.
   *
   * `q` is stripped from the address bar as soon as the submit is kicked off
   * (below), which is what stops a refresh or back-navigation from resending
   * it: without that, a page that fires a request on load is a page that
   * fires it again on refresh.
   */
  pendingQuestion?: string | null;
  /**
   * Hosted inside another page rather than owning the route: the CoachHelm
   * page's Chat tab (`/golf/dashboard/intelligence?view=chat`). Omitted on
   * the standalone Ask page, which keeps its behaviour exactly.
   */
  embed?: AskSurfaceEmbed;
}

export interface AskSurfaceEmbed {
  /**
   * The host's own chrome above and below this surface (its padding, its
   * toggle row), as a CSS length. Subtracted from the viewport height on top
   * of `--fw-shell-offset` so the composer still lands on screen.
   */
  offset: string;
  /** "New" conversation link. */
  newHref: string;
  /** A past conversation's link, for the history rail. */
  conversationHref: (id: string) => string;
}

export function AskSurface({
  teamName,
  players,
  suggestions,
  conversations,
  conversationId,
  initialMessages,
  pulseItems,
  asOfLabel,
  coverage,
  pendingQuestion,
  embed,
}: AskSurfaceProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const newHref = embed?.newHref ?? '/golf/dashboard/coachhelm/chat';
  const conversationHref = embed?.conversationHref ?? ((id: string) => `/golf/dashboard/coachhelm/chat?c=${id}`);
  const embedded = Boolean(embed);

  /**
   * Which thread is mounted. A history link mounts that conversation and
   * "New" mounts an empty one. The conversation this surface minted itself
   * (`adoptConversationInUrl`, below) does NOT remount: the thread on screen
   * already is that conversation. Embedded, the host page re-renders with its
   * id after any `router.refresh()` (a Lab action, a scan), and remounting
   * then would throw away a reply that is still arriving.
   *
   * "New" resets on click as well as on arrival: once a fresh thread has
   * minted its id, the host may never have seen that id as a prop, so the
   * navigation back to an id-less URL is not a prop change at all.
   */
  const [thread, setThread] = React.useState<{ key: number; conversationId: string | null; fresh: boolean }>({
    key: 0,
    conversationId,
    fresh: false,
  });
  const [seenConversationId, setSeenConversationId] = React.useState(conversationId);
  const [adoptedId, setAdoptedId] = React.useState<string | null>(null);
  if (conversationId !== seenConversationId) {
    setSeenConversationId(conversationId);
    if (conversationId === null || conversationId !== adoptedId) {
      setAdoptedId(null);
      setThread((t) => ({ key: t.key + 1, conversationId, fresh: false }));
    }
  }
  const startNewThread = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens "New" in another tab; this thread stays put.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    setHistoryOpen(false);
    setAdoptedId(null);
    setThread((t) => ({ key: t.key + 1, conversationId: null, fresh: true }));
  };

  /**
   * "Start a new chat" under a lost-conversation error: the same fresh thread
   * as "New", and `c` (and any `q`) gone from the address bar. The conversation
   * is lost, so a reload that kept `?c=` would open it again and hit the same
   * error. `history.replaceState` for the reason `adoptConversationInUrl` gives.
   */
  const startNewAfterLostConversation = () => {
    setHistoryOpen(false);
    setAdoptedId(null);
    setThread((t) => ({ key: t.key + 1, conversationId: null, fresh: true }));
    const url = new URL(window.location.href);
    if (!url.searchParams.has('c') && !url.searchParams.has('q')) return;
    url.searchParams.delete('c');
    url.searchParams.delete('q');
    window.history.replaceState(embedded ? null : window.history.state, '', url.toString());
  };

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
    setAdoptedId(id);
    const url = new URL(window.location.href);
    if (url.searchParams.get('c') === id) return;
    url.searchParams.set('c', id);
    // `q` seeded the first question; leaving it would re-seed the composer on
    // every subsequent visit to this now-permanent link.
    url.searchParams.delete('q');
    // Embedded, the host page reads its own state from the URL (the Chat tab
    // keeps `c` when the coach switches views, and a later `router.refresh()`
    // re-fetches whatever Next believes the URL is). `null` state makes
    // Next's patched replaceState sync its router URL; carrying the existing
    // `__NA` marker would skip that sync and a refresh would drop `c`.
    window.history.replaceState(embedded ? null : window.history.state, '', url.toString());
  }, [embedded]);

  /**
   * `pendingQuestion` auto-submits below (via `autoSubmitInitialInput` on
   * `CoachHelmChat`). Strip `q` from the address bar the moment that submit is
   * kicked off — not later, when the server mints a conversation id and
   * `adoptConversationInUrl` above would eventually remove it too — so a
   * refresh or back-navigation in the gap before that response arrives can
   * never resend the same question. `history.replaceState`, not
   * `router.replace`, for the same reason as `adoptConversationInUrl`: a
   * router navigation re-runs the page and would remount the chat mid-send.
   *
   * Guarded by a ref, not just `[pendingQuestion]`, because React StrictMode
   * double-invokes mount effects — a second invocation must not re-derive a
   * `q`-bearing URL from `window.location` a second time and no-op only by
   * coincidence (it already would here, `q` being gone after the first run),
   * but the guard is what makes that true by construction rather than by luck.
   */
  const strippedPendingQuestionRef = React.useRef(false);
  // DATA-15: only a question the Brief tab handed off in THIS tab moments ago
  // sends itself. A bare `?q=` (a pasted link, a crawler, an email) pre-fills
  // the composer and waits for the coach to press Send. Read once at mount
  // (the composer's auto-submit is mount-only). It changes no markup, so
  // reading the browser's storage here cannot cause a hydration mismatch.
  const [autoSubmitPendingQuestion] = React.useState(
    () => typeof window !== 'undefined' && !!pendingQuestion && hasAskHandoff(pendingQuestion),
  );
  React.useEffect(() => {
    if (!pendingQuestion || strippedPendingQuestionRef.current) return;
    strippedPendingQuestionRef.current = true;
    clearAskHandoff();
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', url.toString());
    // Mount-only: `pendingQuestion` is a one-time seed from the URL this page
    // loaded with, not a value that should re-fire the strip on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // `--fw-shell-offset` is the shell's real chrome above + below this page
    // (AppShell declares it; the golf shell re-declares it for the coach FAB
    // pad). The old `7rem` fallback was a guess that undercounted the mobile
    // tab bar and the desktop FAB clearance, so this box was taller than the
    // space it had: the page scrolled 41px at 390x844 and 97px at 1440x900,
    // and the composer — the one control this surface exists for — sat under
    // the bottom tab bar. Keep a fallback for any host that doesn't set it.
    <div
      className="flex min-h-0 flex-col"
      data-slot="ask-surface"
      // This surface sizes itself against the keyboard, so CapacitorProvider's
      // keyboardWillShow scroll-into-view must leave it alone — centring the
      // composer in a viewport the keyboard covers would scroll the thread
      // header off the top for nothing.
      data-fw-keyboard-aware
      style={{
        // Embedded: never shorter than a usable thread plus composer, even on
        // a landscape phone (the host page scrolls instead).
        minHeight: embedded ? '26rem' : undefined,
        // The keyboard term was missing entirely. The iOS WebView does not
        // resize for the keyboard (`resize: 'ionic'`, no <ion-app>) and Safari
        // does not resize its layout viewport, so this column kept its full
        // height and PromptComposer — its last child — sat under the keys.
        // Same defect the team-message composer had (#1739); CoachHelm's
        // full-page Ask surface never received the fix. The drawer variant did
        // (CoachHelmDrawer is keyboard-aware), which is why it only bit here.
        //
        // Subtracting `max(0px, keyboard - bottom-nav)` rather than the whole
        // keyboard, because `--fw-shell-offset` ALREADY reserves the 56px nav
        // plus its safe-area inset on mobile — and while the keyboard is up the
        // nav is underneath it, so that height is not owed twice. Taking the
        // full keyboard here would shrink the thread by roughly a nav bar for
        // nothing. Resolves to 0 on desktop and whenever the keyboard is down.
        height: `calc(100dvh - var(--fw-shell-offset, 7rem)${embed ? ` - ${embed.offset}` : ''} - max(0px, calc(var(--keyboard-height, 0px) - 56px - env(safe-area-inset-bottom, 0px))))`,
      }}
    >
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
            'inline-flex min-h-[40px] items-center gap-2 rounded-fw-md px-2.5 [@media(pointer:coarse)]:min-h-[44px]',
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
          href={newHref}
          onClick={startNewThread}
          className={cn(
            'inline-flex min-h-[40px] items-center gap-1.5 rounded-fw-md px-2.5 [@media(pointer:coarse)]:min-h-[44px]',
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
                <span className="font-fw-sans text-caption text-text-tertiary">
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
                        href={conversationHref(c.id)}
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
            key={thread.key}
            players={players}
            suggestions={suggestions}
            conversationId={thread.conversationId}
            initialMessages={thread.fresh ? NO_MESSAGES : initialMessages}
            onConversationId={adoptConversationInUrl}
            onStartNew={startNewAfterLostConversation}
            variant="page"
            // The page's pending question belongs to the thread it arrived
            // with. A later "New" must not seed, or re-send, it.
            initialInput={thread.key === 0 ? (pendingQuestion ?? undefined) : undefined}
            autoSubmitInitialInput={thread.key === 0 && autoSubmitPendingQuestion}
            greeting={<Greeting teamName={teamName} as={embedded ? 'h2' : 'h1'} />}
            opening={(ask) => (
              <ProgramOpening
                items={pulseItems}
                coverage={coverage}
                asOfLabel={asOfLabel}
                onAsk={ask}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

function Greeting({ teamName, as: Heading = 'h1' }: { teamName: string; as?: 'h1' | 'h2' }) {
  return (
    <div className="mb-1">
      <Heading className="font-fw-display text-h2 font-semibold tracking-[-0.02em] text-text-primary">
        What do you want to know about {teamName}?
      </Heading>
      <p className="mt-1.5 font-fw-sans text-body-sm text-text-tertiary">
        Answers come from your recorded rounds, signals and schedule.
      </p>
    </div>
  );
}
