'use client';

/**
 * Admin Event Logger (Client-Side)
 * 
 * Use this to log events from client components.
 * Events are sent to an API route which inserts them via service role.
 */

import type { AdminEventType, AdminEventSeverity } from './admin-logger';

// ============================================
// TYPES
// ============================================

interface ClientEventInput {
  eventType: AdminEventType;
  title: string;
  severity?: AdminEventSeverity;
  message?: string;
  metadata?: Record<string, unknown>;
  url?: string;
  stackTrace?: string;
}

interface BrowserInfo {
  userAgent: string;
  language: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  pixelRatio: number;
  timezone: string;
  online: boolean;
  cookiesEnabled: boolean;
}

// ============================================
// BROWSER INFO CAPTURE
// ============================================

function getBrowserInfo(): BrowserInfo {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    cookiesEnabled: navigator.cookieEnabled,
  };
}

// ============================================
// API CALL
// ============================================

async function sendToAPI(event: ClientEventInput & { browserInfo: BrowserInfo }): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    
    if (!response.ok) {
      console.error('[AdminLoggerClient] API error:', response.status);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[AdminLoggerClient] Failed to send event:', err);
    return false;
  }
}

// ============================================
// MAIN LOGGER
// ============================================

/**
 * Log an event from the client
 */
async function logClientEvent(input: ClientEventInput): Promise<boolean> {
  const browserInfo = getBrowserInfo();
  const url = input.url ?? window.location.href;
  
  return sendToAPI({
    ...input,
    url,
    browserInfo,
  });
}

// ============================================
// ERROR HELPERS
// ============================================

/**
 * Log a client-side error
 */
async function logClientError(
  error: Error | unknown,
  context: {
    title?: string;
    severity?: AdminEventSeverity;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<boolean> {
  const err = error instanceof Error ? error : new Error(String(error));
  
  return logClientEvent({
    eventType: 'error',
    title: context.title ?? err.message.slice(0, 200),
    severity: context.severity ?? 'error',
    message: err.message,
    stackTrace: err.stack,
    metadata: {
      ...context.metadata,
      errorName: err.name,
      errorMessage: err.message,
    },
  });
}

/**
 * Log a critical client-side error
 */
async function logCriticalClientError(
  error: Error | unknown,
  context: {
    title?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<boolean> {
  return logClientError(error, { ...context, severity: 'critical' });
}

// ============================================
// FEATURE TRACKING
// ============================================

/**
 * Log feature usage from the client
 */
async function logClientFeatureUse(
  featureName: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return logClientEvent({
    eventType: 'feature_use',
    title: `Feature used: ${featureName}`,
    severity: 'info',
    metadata: { featureName, ...metadata },
  });
}

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

let isGlobalHandlerSetup = false;
let pendingErrors: Array<{ error: Error; errorInfo?: { componentStack?: string } }> = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Flush pending errors to the API
 * Batches errors to reduce API calls
 */
async function flushPendingErrors() {
  if (pendingErrors.length === 0) return;
  
  const errors = [...pendingErrors];
  pendingErrors = [];
  
  // Log each error (could be batched in future)
  for (const { error, errorInfo } of errors) {
    await logClientError(error, {
      title: `Unhandled error: ${error.message.slice(0, 100)}`,
      severity: 'error',
      metadata: {
        componentStack: errorInfo?.componentStack,
        isUnhandled: true,
      },
    });
  }
}

/**
 * Schedule a flush of pending errors
 */
function scheduleFlush() {
  if (flushTimeout) return;
  
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushPendingErrors();
  }, 1000); // Batch errors for 1 second
}

/**
 * Add an error to the pending queue
 */
function queueError(error: Error, errorInfo?: { componentStack?: string }) {
  pendingErrors.push({ error, errorInfo });
  scheduleFlush();
}

/**
 * Setup global error handlers
 * Call this once in your app's root layout
 */
export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') return;
  if (isGlobalHandlerSetup) return;
  
  isGlobalHandlerSetup = true;
  
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    // Ignore cross-origin script errors (no useful info)
    if (!event.error) return;
    
    queueError(event.error);
  });
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    queueError(error);
  });
  
  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (pendingErrors.length > 0) {
      // Use sendBeacon for reliability on page unload
      const browserInfo = getBrowserInfo();
      for (const { error, errorInfo } of pendingErrors) {
        const payload = JSON.stringify({
          eventType: 'error',
          title: `Unhandled error: ${error.message.slice(0, 100)}`,
          severity: 'error',
          message: error.message,
          stackTrace: error.stack,
          url: window.location.href,
          browserInfo,
          metadata: {
            componentStack: errorInfo?.componentStack,
            isUnhandled: true,
            isBeforeUnload: true,
          },
        });
        navigator.sendBeacon('/api/admin/log-event', payload);
      }
      pendingErrors = [];
    }
  });
  
  console.log('[AdminLoggerClient] Global error handler installed');
}

// ============================================
// REACT ERROR BOUNDARY HELPER
// ============================================

/**
 * Log error from a React Error Boundary
 * Use in componentDidCatch or error boundary component
 */
async function logReactError(
  error: Error,
  errorInfo: { componentStack?: string }
): Promise<boolean> {
  return logClientError(error, {
    title: `React error: ${error.message.slice(0, 100)}`,
    severity: 'error',
    metadata: {
      componentStack: errorInfo.componentStack,
      isReactError: true,
    },
  });
}

// ============================================
// PERFORMANCE TRACKING
// ============================================

/**
 * Log slow page load
 */
async function logSlowPageLoad(
  loadTimeMs: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return logClientEvent({
    eventType: 'system',
    title: 'Slow page load detected',
    severity: loadTimeMs > 10000 ? 'warning' : 'info',
    message: `Page took ${loadTimeMs}ms to load`,
    metadata: {
      loadTimeMs,
      ...metadata,
    },
  });
}

/**
 * Track and log page performance
 * Call after page is fully loaded
 */
export function trackPagePerformance(slowThresholdMs = 5000) {
  if (typeof window === 'undefined') return;
  
  // Wait for page to be fully loaded
  if (document.readyState === 'complete') {
    measurePerformance();
  } else {
    window.addEventListener('load', measurePerformance);
  }
  
  function measurePerformance() {
    // Use Performance API if available
    const perfEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const navEntry = perfEntries[0];
    
    if (navEntry) {
      const loadTime = navEntry.loadEventEnd - navEntry.startTime;
      
      if (loadTime > slowThresholdMs) {
        logSlowPageLoad(loadTime, {
          domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.startTime,
          firstContentfulPaint: getFirstContentfulPaint(),
          timeToInteractive: navEntry.domInteractive - navEntry.startTime,
        });
      }
    }
  }
  
  function getFirstContentfulPaint(): number | null {
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    return fcp ? fcp.startTime : null;
  }
}
