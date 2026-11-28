'use client';

import { useEffect } from 'react';
import { setupGlobalErrorHandlers } from '@/lib/error-logging';

/**
 * Makes sure the Bridge's window handlers (error, unhandledrejection) are installed. instrumentation-client.ts
 * installs them before the page hydrates; this is the fallback for a page that loads without it, and does nothing
 * when they are already there. Renders nothing — drop into root layout.
 */
export function GlobalErrorHandlerSetup() {
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  return null;
}
