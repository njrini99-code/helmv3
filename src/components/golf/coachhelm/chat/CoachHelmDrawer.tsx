'use client';

/**
 * ============================================================================
 * CoachHelm · the side drawer
 * ----------------------------------------------------------------------------
 * The same conversation, alongside whatever the coach is looking at.
 *
 * It runs the SHARED chat surface — same transport, composer, renderer,
 * approval flow. What the drawer adds is exactly two things:
 *
 *   ROUTE CONTEXT. The current page contributes a chip: a player page
 *   contributes that player, the calendar contributes the selected event. The
 *   chip is VISIBLE and REMOVABLE. Sending hidden page context would make the
 *   assistant feel arbitrary — the same question answered differently on two
 *   screens, with nothing on screen explaining why.
 *
 *   CONTINUITY. "Open full page" carries the conversation to the Ask surface
 *   rather than abandoning it, because the moment a coach wants more room is
 *   the moment the answer got interesting.
 *
 * Desktop: a 456px full-height panel that pushes nothing and covers no primary
 * control. Phone: a near-full-height sheet with a sticky composer, safe-area
 * padding, and no conversation rail — the desktop rail on a 390px screen is the
 * classic way this pattern becomes unusable.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, m } from 'framer-motion';
import { MessageSquare, X, Maximize2, Plus } from 'lucide-react';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { CoachHelmChat } from './CoachHelmChat';
import type { ComposerPlayer } from './PromptComposer';
import type { ChatContextChip } from './useCoachHelmChat';

export interface CoachHelmDrawerProps {
  players: ComposerPlayer[];
  suggestions: string[];
  teamName: string;
}

export function CoachHelmDrawer({ players, suggestions, teamName }: CoachHelmDrawerProps) {
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const pathname = usePathname();
  const reduced = useReducedMotionGuard() ?? false;

  const panel = React.useRef<HTMLElement>(null);
  const opener = React.useRef<HTMLButtonElement>(null);

  const routeContext = useRouteContext(pathname, players);

  // Focus moves into the panel on open and back to the launcher on close. A
  // drawer that opens without moving focus strands keyboard and screen-reader
  // users at the top of the page behind it.
  React.useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        // The composer, not whatever button happens to come first in the
        // header — a drawer that opens with focus on its own close button is
        // a drawer you have to tab out of before you can use it.
        const target =
          panel.current?.querySelector<HTMLElement>('textarea') ??
          panel.current?.querySelector<HTMLElement>('button');
        target?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }
    opener.current?.focus();
    return undefined;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <m.button
            key="coachhelm-launcher"
            ref={opener}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask CoachHelm"
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.9 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            // Desktop only. On a phone the bottom-right corner belongs to the
            // tab bar, and CoachHelm already has a nav destination there.
            className={cn(
              'fixed bottom-6 right-6 z-[var(--fw-z-nav,40)] hidden h-14 w-14 items-center justify-center md:flex',
              'rounded-full bg-accent-700 text-text-on-accent shadow-soft',
              'transition-colors hover:bg-accent-800',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
          >
            <MessageSquare aria-hidden className="h-5 w-5" />
          </m.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Scrim on phone only — on desktop the drawer sits beside the page
                and the page stays readable and usable behind it. */}
            <m.button
              key="coachhelm-scrim"
              type="button"
              aria-label="Close CoachHelm"
              onClick={() => setOpen(false)}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              className="fixed inset-0 z-[var(--fw-z-overlay,45)] bg-canvas/70 md:hidden"
            />

            <m.aside
              key="coachhelm-drawer"
              ref={panel}
              role="dialog"
              aria-modal="false"
              aria-label="Ask CoachHelm"
              data-testid="coachhelm-drawer"
              initial={reduced ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={reduced ? undefined : { x: '100%' }}
              transition={{ type: 'tween', duration: reduced ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
              className={cn(
                'fixed z-[var(--fw-z-drawer,50)] flex flex-col border-border-subtle bg-canvas',
                // Phone: a near-full-height sheet, clear of the status bar.
                'inset-x-0 bottom-0 top-[max(3rem,env(safe-area-inset-top))] rounded-t-fw-lg border-t',
                // Desktop: full-height panel, 456px.
                'md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[456px] md:rounded-none md:border-l md:border-t-0',
              )}
            >
              <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-2">
                <span className="flex items-center gap-2 px-1">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-600" />
                  <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                    CoachHelm
                  </span>
                </span>

                <span className="flex-1" />

                {/* eslint-disable-next-line helm/no-raw-button -- icon-only drawer header affordance */}
                <button
                  type="button"
                  onClick={() => setSession((n) => n + 1)}
                  aria-label="Start a new conversation"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-fw-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                >
                  <Plus aria-hidden className="h-4 w-4" />
                </button>
                <Link
                  href="/golf/dashboard/coachhelm/chat"
                  aria-label="Open the full Ask CoachHelm page"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-fw-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                >
                  <Maximize2 aria-hidden className="h-4 w-4" />
                </Link>
                {/* eslint-disable-next-line helm/no-raw-button -- icon-only drawer close */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close CoachHelm"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-fw-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </header>

              <CoachHelmChat
                key={session}
                players={players}
                suggestions={suggestions}
                initialContext={routeContext}
                variant="drawer"
                greeting={
                  <p className="font-fw-sans text-body-sm text-text-tertiary">
                    Ask about {teamName} — or about whatever is on screen.
                  </p>
                }
              />
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Derive a context chip from the current route.
 *
 * Only routes that carry an unambiguous subject produce one. Guessing on a
 * generic route would put a chip in front of the coach that they did not choose
 * and cannot explain, which is worse than no context at all.
 */
function useRouteContext(pathname: string, players: ComposerPlayer[]): ChatContextChip[] {
  return React.useMemo(() => {
    const player = /\/dashboard\/players\/([0-9a-f-]{36})/i.exec(pathname);
    if (player?.[1]) {
      const found = players.find((p) => p.id === player[1]);
      if (found) return [{ kind: 'player', id: found.id, label: found.name }];
    }
    return [];
  }, [pathname, players]);
}
