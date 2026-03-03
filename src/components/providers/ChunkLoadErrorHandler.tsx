'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'chunk-error-reload';

/**
 * Handles stale deployment errors globally.
 *
 * When a new deployment goes live, users with cached HTML/JS encounter:
 *
 * 1. **Chunk load errors** — old JS chunk hashes no longer exist on the CDN:
 *    - "Loading chunk XXXX failed"
 *    - Chrome: "Cannot read properties of undefined (reading 'call')"
 *    - Safari: "undefined is not an object (evaluating 'f[e].call')"
 *
 * 2. **Stale server action errors** — old server action IDs no longer exist:
 *    - "Server Action was not found on the server" (UnrecognizedActionError)
 *    - Manifests as "cannot connect to the server" to the user
 *
 * This component catches both globally and triggers a single hard reload
 * to fetch the fresh deployment. A sessionStorage flag prevents infinite
 * reload loops.
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
        // Chrome: "Cannot read properties of undefined (reading 'call')"
        (lower.includes("cannot read properties of undefined") &&
          lower.includes("'call'")) ||
        // Safari: "undefined is not an object (evaluating 'f[e].call')"
        (lower.includes("undefined is not an object") &&
          lower.includes(".call"))
      );
    }

    function isStaleServerActionError(message: string): boolean {
      const lower = message.toLowerCase();
      return (
        lower.includes('server action') &&
        (lower.includes('not found on the server') ||
          lower.includes('was not found'))
      );
    }

    function isStaleDeploymentError(message: string): boolean {
      return isChunkLoadError(message) || isStaleServerActionError(message);
    }

    function handleReload() {
      // Only auto-reload once per session to prevent loops
      const hasReloaded = sessionStorage.getItem(RELOAD_KEY);
      if (hasReloaded) return;

      sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      if (isStaleDeploymentError(event.message || '')) {
        event.preventDefault();
        handleReload();
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason?.message || event.reason?.toString() || '';
      if (isStaleDeploymentError(message)) {
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
