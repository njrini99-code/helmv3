'use client';

/**
 * W32-pt3 — slide-over chat drawer (coach-only).
 *
 * Behavior:
 *   - Closed by default. Opens via the launcher button or by setting
 *     `defaultOpen` on the wrapper.
 *   - First open creates no conversation yet — the first message kicks
 *     off a new one via POST /api/coachhelm/v3/chat/send.
 *   - Subsequent sends reuse the same conversation_id.
 *   - "New chat" button clears state without deleting the prior thread
 *     (it's still accessible from /dashboard/coachhelm/chat).
 *
 * Persistence is server-side — this component only stores the active
 * conversation_id + the message stream.
 *
 * fab-vs-nav (2026-07-10): the launcher is desktop-only (`hidden md:flex`).
 * Below `md` it used to float at `bottom-6 right-6` — the SAME bottom-right
 * corner as FairwayBottomNav's 5th ("More") column, and at `z-40` (above the
 * bar's `z-[var(--fw-z-nav)]`=20), so it sat directly on top of the tab,
 * occluding it. Rather than re-offset it to clear the bar, it's removed on
 * phone: "Ask" already has a one-tap nav destination there (bottom nav →
 * CoachHelm tab → CoachHelmSubNav's own "Ask" tab, nav-registry.ts), and on
 * CoachHelm cluster routes (e.g. the Brief) "Ask" is already a visible tab in
 * that page's own sub-nav strip — a second, redundant floating entry point
 * competing with the SAME bar's chrome fails Doctrine Rule 7 (no desktop
 * chrome on phones) as much as it fails the FAB-collision rule. Desktop keeps
 * the launcher unchanged (no bottom nav there to collide with).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { Button, IconButton } from '@/components/ui/button';
import { useCoachChatSend } from '@/components/fairway/pages/coachhelm/useCoachChatSend';
import {
  drawerVariants,
  drawerTransition,
  backdropVariants,
  backdropTransition,
  badgeVariants,
  badgeTransition,
  liftHover,
  tapPress,
  enterVariants,
  enterTransition,
  stagger,
} from '@/lib/coachhelm/v3/motion';

const QUICK_PROMPTS = [
  'Who needs the most help this week?',
  'Compare two players on lag putting',
  'What patterns are showing up team-wide?',
];

export interface ChatDrawerProps {
  defaultOpen?: boolean;
}

export function ChatDrawer({ defaultOpen = false }: ChatDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Dead-code cleanup: the optimistic send/rollback logic that used to live
  // inline here is now the ONE shared `useCoachChatSend` hook (a byte-for-byte
  // extraction). The drawer still owns conversationId + messages; the hook owns
  // only the in-flight `pending` flag + last `error`. Behavior is identical.
  const { send, pending, error, clearError } = useCoachChatSend({
    conversationId,
    setConversationId,
    setMessages,
  });

  const handleSend = (text: string) => {
    void send(text);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  function newChat() {
    setConversationId(null);
    setMessages([]);
    clearError();
  }

  return (
    <>
      {/* ----- Launcher (helm green pill, premium SVG icon) ----- */}
      <AnimatePresence>
        {!open && (
          <m.button
            key="chat-launcher"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open coach chat"
            variants={badgeVariants}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            transition={badgeTransition}
            whileHover={prefersReducedMotion ? undefined : liftHover}
            whileTap={prefersReducedMotion ? undefined : tapPress}
            // Desktop-only (see file header "fab-vs-nav"): below `md` this
            // collided with FairwayBottomNav's More tab in the same corner.
            // "Ask" already has a bottom-nav destination on phone, so the
            // launcher is hidden there rather than re-offset to clear the bar.
            className="hidden md:flex fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary-600 text-white shadow-[0_10px_24px_-12px_rgba(22,163,74,0.55)] hover:bg-primary-700 items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H11l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5v-9Z"
                fill="currentColor"
              />
            </svg>
          </m.button>
        )}
      </AnimatePresence>

      {/* ----- Drawer ----- */}
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="chat-backdrop"
              aria-hidden
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={backdropTransition}
              className="fixed inset-0 bg-warm-900/35 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setOpen(false)}
            />
            <m.aside
              key="chat-drawer"
              role="dialog"
              aria-label="Coach chat"
              data-testid="chat-drawer"
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={drawerTransition}
              className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[420px] z-50 surface-lift flex flex-col"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-warm-200">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-warm-900">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-primary-600" />
                    <span className="font-medium tracking-[-0.01em]">CoachHelm chat</span>
                  </span>
                  {conversationId && (
                    <Button variant="ghost"
                      type="button"
                      onClick={newChat}
                      className="text-eyebrow uppercase tracking-[0.1em] text-warm-500 hover:text-warm-800 transition"
                    >
                      New
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    href="/golf/dashboard/coachhelm/chat"
                    className="text-eyebrow uppercase tracking-[0.1em] text-warm-500 hover:text-warm-800 transition"
                  >
                    History →
                  </Link>
                  <IconButton variant="default"
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close chat"
                    className="text-warm-500 hover:text-warm-900 transition"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                      <path
                        d="M3 3 L13 13 M13 3 L3 13"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </IconButton>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 bg-warm-50/40">
                {messages.length === 0 && !pending && (
                  <m.div
                    variants={enterVariants}
                    initial={prefersReducedMotion ? false : 'hidden'}
                    animate="visible"
                    transition={{ ...enterTransition, delay: prefersReducedMotion ? 0 : 0.15 }}
                    className="mt-10 max-w-sm mx-auto text-center"
                  >
                    <span aria-hidden className="inline-flex h-10 w-10 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-3">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H11l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5v-9Z" fill="currentColor" />
                      </svg>
                    </span>
                    <p className="text-sm text-warm-700">
                      Ask about a player, compare two players, or have me draft a goal.
                    </p>
                    <div className="mt-5 flex flex-col gap-2">
                      {QUICK_PROMPTS.map((q, i) => (
                        <m.button
                          key={q}
                          type="button"
                          onClick={() => void handleSend(q)}
                          variants={enterVariants}
                          initial={prefersReducedMotion ? false : 'hidden'}
                          animate="visible"
                          transition={{
                            ...enterTransition,
                            delay: prefersReducedMotion ? 0 : 0.25 + stagger(i),
                          }}
                          whileHover={prefersReducedMotion ? undefined : liftHover}
                          whileTap={prefersReducedMotion ? undefined : tapPress}
                          className="text-left text-body-sm px-3 py-2 rounded-xl border border-warm-200 bg-cream-50 hover:border-primary-300 hover:bg-primary-50/40 text-warm-800 transition"
                        >
                          {q}
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}
                <ChatMessageList messages={messages} pending={pending} />
                {error && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}
              </div>

              <ChatComposer onSend={handleSend} disabled={pending} />
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
