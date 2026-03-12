'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'chunk-error-reload';
const RELOAD_PARAM = '__deployment_refresh';

/**
 * Complements the beforeInteractive recovery script by clearing its
 * one-shot markers after the fresh deployment has hydrated successfully.
 */
export function ChunkLoadErrorHandler() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(RELOAD_PARAM)) {
        url.searchParams.delete(RELOAD_PARAM);
        window.history.replaceState(window.history.state, document.title, url.toString());
      }
    } catch {
      // Ignore malformed URLs and preserve current location
    }

    sessionStorage.removeItem(RELOAD_KEY);
  }, []);

  return null;
}
