'use client';

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Screen state that comes back when the coach returns (PAGE_PERFORMANCE.md rule 1): a list's filter, its search, a
 * picked set of players. Kept in sessionStorage for this tab, under the page's route and team (`RouteScope`, from
 * `RouteFrame`), so another team's page never opens on this one's search.
 *
 * Restored only when the page mounts in the browser after the app is running (a tap back, Back, a tab). The first
 * page of a hard load renders the default, as the server did, so hydration never disagrees.
 */
export const RouteScope = createContext<string>('');

let appRunning = false;
/** RouteFrame marks the app running once its first page has hydrated. */
export function markAppRunning(): void {
  appRunning = true;
}

const PREFIX = 'ch:screen:';

function read<T>(key: string): T | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown, initial: unknown): void {
  try {
    if (JSON.stringify(value) === JSON.stringify(initial)) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the state still works for this visit.
  }
}

export function useChSessionState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(RouteScope);
  const key = `${PREFIX}${scope}\u0000${name}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined' || !appRunning || !scope) return initial;
    return read<T>(key) ?? initial;
  });
  useEffect(() => {
    if (scope) write(key, value, initial);
    // `initial` is a default, read for comparison only.
  }, [key, scope, value]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue];
}
