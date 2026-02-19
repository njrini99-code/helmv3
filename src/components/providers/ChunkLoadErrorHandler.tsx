'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'chunk-error-reload';

/**
 * Handles stale deployment chunk load errors.
 *
 * When a new deployment goes live, users with cached HTML still reference
 * old JS chunk hashes that no longer exist on the CDN. This causes:
 *   - "Loading chunk XXXX failed"
 *   - "Cannot read properties of undefined (reading 'call')"
 *
 * This component catches those errors globally and triggers a single hard
 * reload to fetch the fresh deployment manifest. A sessionStorage flag
 * prevents infinite reload loops.
 */
export function ChunkLoadErrorHandler() {
  useEffect(() => {
    function isChunkLoadError(message: string): boolean {
      const lower = message.toLowerCase();
      return (
        lower.includes('loading chunk') ||
        lower.includes('loading css chunk') ||
        lower.includes('chunkloaderror') ||
        // Webpack module call failure from missing chunk
        (lower.includes("cannot read properties of undefined") &&
          lower.includes("'call'"))
      );
    }

    function handleReload() {
      // Only auto-reload once per session to prevent loops
      const hasReloaded = sessionStorage.getItem(RELOAD_KEY);
      if (hasReloaded) return;

      sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.message || '')) {
        event.preventDefault();
        handleReload();
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason?.message || event.reason?.toString() || '';
      if (isChunkLoadError(message)) {
        event.preventDefault();
        handleReload();
      }
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Clear the reload flag after successful load — the fresh deployment works
    sessionStorage.removeItem(RELOAD_KEY);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
