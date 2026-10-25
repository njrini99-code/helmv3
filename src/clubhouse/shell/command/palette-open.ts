'use client';

import { useSyncExternalStore } from 'react';

/** The command layer is for a keyboard and a pointer that hovers, on the desktop layout; the phone has none of it. */
export const CH_COMMAND_DESKTOP = '(hover: hover) and (min-width: 821px)';

/** True where the command layer runs (CH_COMMAND_DESKTOP); false on the server and on the phone. */
export function useCommandDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(CH_COMMAND_DESKTOP);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(CH_COMMAND_DESKTOP).matches,
    () => false,
  );
}

/** The event the command layer listens for: something other than Cmd or Ctrl K (the top bar's search pill) opens the palette. */
export const CH_PALETTE_EVENT = 'ch:palette';

/** Opens the one command palette (CommandLayer), the same way Cmd or Ctrl K does. Nothing listens off the desktop layout. */
export function openCommandPalette(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CH_PALETTE_EVENT));
}
