'use client';

import { useCallback, useEffect, useState } from 'react';

/** The history entry a link's sheet sits on: Back closes the sheet before it leaves the screen. */
type DeepState = { chDeep?: string } | null;

function hasParam(param: string, value?: string): boolean {
  const v = new URL(window.location.href).searchParams.get(param);
  return v !== null && (value === undefined || v === value);
}

/**
 * A sheet a URL opens (`roster?tab=requests`, `?invite=1`, `classes?new=1`; classes-roster-home 05 CP.3). On arrival the page is
 * rewritten to the bare address with the param pushed back on top, so one Back closes the sheet and a second leaves the screen; it
 * shows at rest (`atRest`), with no rise. Closing by hand steps back through that entry, so a reload shows the plain screen and the
 * next Back does what it says. A sheet opened by a tap has no entry, as today. Off when `enabled` is false (the lane's flag, or a
 * player's roster, which never reads these params). Survives the remount the address change can cause: the entry is already marked.
 */
export function useDeepLinkSheet(param: string, { value, enabled = true }: { value?: string; enabled?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [atRest, setAtRest] = useState(false);

  useEffect(() => {
    if (!enabled || !hasParam(param, value)) return;
    const on = (window.history.state as DeepState)?.chDeep === param;
    if (!on) {
      const url = new URL(window.location.href);
      const bare = new URL(url);
      bare.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', bare.pathname + bare.search);
      window.history.pushState({ ...((window.history.state as object | null) ?? {}), chDeep: param }, '', url.pathname + url.search);
    }
    setAtRest(true);
    setOpen(true);
    // Once, on arrival.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;
    const onPop = () => {
      if (!hasParam(param, value)) {
        setOpen(false);
        setAtRest(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled, param, value]);

  const close = useCallback(() => {
    setOpen(false);
    setAtRest(false);
    if ((window.history.state as DeepState)?.chDeep === param) window.history.back();
  }, [param]);

  return { open, atRest, close, setOpen };
}
