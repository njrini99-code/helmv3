'use client';

import { createContext } from 'react';
import type { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { activeNavItem, routeLabel } from './nav';

/**
 * What the Ask sheet body and the quick chat share (the sparkle key and its provider are retired): the context the quick chat provides, the "Looking at" label, and the chat type.
 */
/** The chat implementation: the production hook, or the preview's stand-in. */
export type ChAskSheetChat = typeof useCoachHelmChat;

interface AskSheetCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Mounts the sheet closed ahead of a likely open (pointer over or focus on the key), so opening rises. */
  warm: () => void;
  available: boolean;
}
export const AskSheetContext = createContext<AskSheetCtx>({ open: false, setOpen: () => {}, warm: () => {}, available: false });

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
