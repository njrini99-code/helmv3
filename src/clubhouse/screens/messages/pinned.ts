'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Pinned conversations (Messages redesign 11b): an ordered list of up to three conversation ids, kept per viewer and team in
 * localStorage, so pins are per device until 11h. Storage can be absent or refuse writes (private mode, quota): every access is
 * guarded, and the list in memory still works for the visit. A new pin goes at the end, so a coach's arrangement stays steady.
 */
export const PIN_LIMIT = 3;
const keyOf = (viewer: string, team: string) => `ch:msg:pinned:${viewer}:${team}`;

export function readPinned(viewer: string, team: string): string[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(keyOf(viewer, team));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, PIN_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writePinned(viewer: string, team: string, ids: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (ids.length === 0) localStorage.removeItem(keyOf(viewer, team));
    else localStorage.setItem(keyOf(viewer, team), JSON.stringify(ids));
  } catch {
    // A refused write keeps the pins for this visit only.
  }
}

/** The list with `id` pinned or unpinned; the same list when nothing changes, including a pin past the limit. */
export function withPin(ids: readonly string[], id: string, pin: boolean): readonly string[] {
  if (ids.includes(id) === pin) return ids;
  if (!pin) return ids.filter((x) => x !== id);
  return ids.length >= PIN_LIMIT ? ids : [...ids, id];
}

export interface ChPins {
  /** Pinned ids still in the inbox, in pin order. */
  ids: readonly string[];
  has: (id: string) => boolean;
  atLimit: boolean;
  toggle: (id: string) => void;
}

/** `convIds`: what the inbox holds. A pin on a conversation that's gone is dropped from the list shown, and stays stored until it loads. */
export function usePinned(viewer: string, team: string, convIds: readonly string[], enabled: boolean, seed?: readonly string[]): ChPins {
  const [stored, setStored] = useState<readonly string[]>(seed ?? []);
  useEffect(() => {
    if (enabled && !seed) setStored(readPinned(viewer, team));
  }, [enabled, seed, viewer, team]);
  const known = convIds.join('\u0000');
  const ids = useMemo(() => {
    const set = new Set(known ? known.split('\u0000') : []);
    return stored.filter((id) => set.has(id));
  }, [stored, known]);
  const toggle = useCallback(
    (id: string) => {
      setStored((cur) => {
        const next = withPin(cur, id, !cur.includes(id));
        if (next !== cur && !seed) writePinned(viewer, team, next);
        return next;
      });
    },
    [seed, viewer, team],
  );
  return useMemo(() => ({ ids, has: (id: string) => ids.includes(id), atLimit: ids.length >= PIN_LIMIT, toggle }), [ids, toggle]);
}
