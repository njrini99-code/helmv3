'use client';

import { Sparkles } from 'lucide-react';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { haptic } from '../lib/haptics';
import { Icon } from '../ui/Icon';
import { useClubhouseRole } from './context';
import { useCrumbTrail } from './crumbs';
import { activeNavItem, routeLabel } from './nav';

/**
 * Ask as a sheet (owner, 2026-10-08): the same CoachHelm Ask, reachable over any screen from the top bar, with a
 * "Looking at" chip naming the page (and the player, when the page is one player's) so the question has its context.
 * No new model or spend: it is the production chat hook and route, and the thread is saved like any other (it opens
 * in CoachHelm afterwards). Coaches only, as Ask is; not on CoachHelm itself, which is the full Ask.
 *
 * The body (and the chat's code and styles) loads only when the sheet first opens.
 */
const AskSheetBody = lazy(() => import('./AskSheetBody'));

/** The chat implementation: the production hook, or the preview's stand-in. */
export type ChAskSheetChat = typeof useCoachHelmChat;

interface AskSheetCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  available: boolean;
}
const Ctx = createContext<AskSheetCtx>({ open: false, setOpen: () => {}, available: false });

/** What the sheet says it is looking at, from the address and the page's own trail ("Stats · Jonah Okafor"). */
export function lookingAt(
  pathname: string,
  search: string,
  trail: string[] | null,
): { label: string; playerId: string | null; playerName: string | null } {
  const item = activeNavItem(pathname, 'coach');
  const base = trail?.length ? trail.join(' \u00b7 ') : (item?.label ?? routeLabel(pathname) ?? 'Home');
  const playerId = new URLSearchParams(search).get('player');
  // A one-player page names the player last in its trail ("Stats › Jonah Okafor"): that is the chat's context chip.
  const playerName = playerId && trail && trail.length > 1 ? (trail[trail.length - 1] ?? null) : null;
  return { label: base, playerId, playerName };
}

export function AskSheetProvider({
  pathname,
  search,
  chat,
  enabled = false,
  children,
}: {
  pathname: string;
  search: string;
  /** CoachHelm is on for this coach (the shell's read of the same switch the Ask page checks). */
  enabled?: boolean;
  /** The preview's stand-in; the live shell leaves it to the production hook. */
  chat?: ChAskSheetChat;
  children: ReactNode;
}) {
  const role = useClubhouseRole();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onCoachHelm = pathname === '/golf/dashboard/coachhelm' || pathname.startsWith('/golf/dashboard/coachhelm/');
  const available = enabled && role === 'coach' && !onCoachHelm;
  const trail = useCrumbTrail();
  const looking = lookingAt(pathname, search, trail);

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  // A new page (or another player on the same page) is a new context: the sheet closes, and the next one starts fresh.
  useEffect(() => setOpen(false), [pathname, search]);

  const value = useMemo(() => ({ open, setOpen, available }), [open, available]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {available && loaded && (
        <Suspense fallback={null}>
          <AskSheetBody key={`${pathname}?${search}`} open={open} onClose={() => setOpen(false)} looking={looking} chat={chat} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

/** For anything that opens the sheet from the page (a "Ask about this" link). */
export function useAskSheet(): { open: () => void; available: boolean } {
  const { setOpen, available } = useContext(Ctx);
  const open = useCallback(() => setOpen(true), [setOpen]);
  return { open, available };
}

/** The top bar's Ask key (coach only, never on CoachHelm itself). */
export function AskSheetButton() {
  const { open, setOpen, available } = useContext(Ctx);
  if (!available) return null;
  return (
    <button
      type="button"
      className="ch-btn ch-btn--ghost ch-iconbtn ch-topbar__ask"
      aria-label="Ask CoachHelm"
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Ask CoachHelm"
      data-ch-code="CH-1840"
      onClick={() => {
        haptic('select');
        setOpen(true);
      }}
    >
      <Icon icon={Sparkles} size={16} />
    </button>
  );
}
