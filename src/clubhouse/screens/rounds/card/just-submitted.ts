'use client';

import * as nav from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * P011: was this page opened straight from Post round? The submit path links to the review with `?just=submitted`
 * (entry/RoundRuntime.tsx); the page reads it once, keeps it for the life of the page and takes it out of the address,
 * so a reload or a shared link does not play the moment again. It is read where the server renders too, so the card
 * arrives already set to settle rather than flashing in first.
 *
 * `useSearchParams` is looked up once at load: a host that has no such hook (a test that mocks `next/navigation` with
 * the few exports it needs) simply never has a moment.
 */
const useSearch: () => URLSearchParams | null = (() => {
  try {
    const hook = (nav as { useSearchParams?: () => URLSearchParams | null }).useSearchParams;
    return typeof hook === 'function' ? hook : () => null;
  } catch {
    return () => null;
  }
})();

export const JUST_PARAM = 'just';
export const JUST_VALUE = 'submitted';

export function useJustSubmitted(): boolean {
  const search = useSearch();
  const [just] = useState(() => search?.get(JUST_PARAM) === JUST_VALUE);
  useEffect(() => {
    if (!just) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get(JUST_PARAM) !== JUST_VALUE) return;
      url.searchParams.delete(JUST_PARAM);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // A blocked history API only costs the replay on reload.
    }
  }, [just]);
  return just;
}
