'use client';

import { useEffect } from 'react';
import { setupGlobalErrorHandlers } from '@/lib/error-logging';

/**
 * Initializes global error handlers (window.onerror, unhandledrejection)
 * once on mount. Renders nothing — drop into root layout.
 */
export function GlobalErrorHandlerSetup() {
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  return null;
}
