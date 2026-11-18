'use client';

import { useSyncExternalStore } from 'react';

/** The browser's online and offline events, as a store subscription (one copy; was in Ask, the quick chat and Classes). */
export function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Whether the browser says it is online. The server render assumes it is. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
