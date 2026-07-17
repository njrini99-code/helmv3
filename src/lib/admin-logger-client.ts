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
      // 401 is the expected response on unauthenticated routes (login,
      // signup, password reset, public marketing). Browser-level error
      // handlers were forwarding these to Sentry as
      //   "[AdminLoggerClient] API error: 401"
      // which produced cosmetic but actionable-looking issues. Silently
      // swallow 401 — there's nothing useful to log when the user isn't
      // signed in yet.
      if (response.status !== 401) {
        console.error('[AdminLoggerClient] API error:', response.status);
      }
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
// Rate limiter: max 3 of the same error per minute to prevent spam
const _dedupMap = new Map<string, { n: number; t: number }>();

async function logClientEvent(input: ClientEventInput): Promise<boolean> {
  if (input.eventType === "error") {
    const k = (input.title || "").slice(0, 80) + ":" + (input.message || "").slice(0, 80);
    const now = Date.now();
    const e = _dedupMap.get(k);
    if (e && now - e.t < 60000 && e.n >= 3) return false;
    _dedupMap.set(k, { n: (e && now - e.t < 60000) ? e.n + 1 : 1, t: now });
  }
  const browserInfo = getBrowserInfo();
  const url = input.url ?? window.location.href;
  
  return sendToAPI({
    ...input,
    url,
    browserInfo,
  });
}

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

/**
 * No longer registers window 'error'/'unhandledrejection' listeners — those
 * duplicated the canonical handlers in `@/lib/error-logging`
 * (`setupGlobalErrorHandlers`, mounted via `GlobalErrorHandlerSetup` in the
 * root layout for both golf and baseball), which classify richer context
 * (chunk-load, hydration, stale-server-action) and already write to Sentry +
 * error_logs. Two listener pairs meant every uncaught error and rejection
 * was logged twice, to two different tables. Kept as an exported no-op
 * (rather than deleted) because `AdminErrorHandler` still calls it alongside
 * `trackPagePerformance`, which remains this module's live responsibility.
 */
export function setupGlobalErrorHandler() {
  // Intentionally empty — see comment above.
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
