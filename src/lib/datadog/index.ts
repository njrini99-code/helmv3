// Datadog RUM (Real User Monitoring) and Browser Logs initialization
// This runs on the client side to track user sessions, errors, and performance

import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

let isInitialized = false;

export function initDatadog() {
  if (isInitialized || typeof window === 'undefined') {
    return;
  }

  const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID;
  const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN;
  const site = process.env.DD_SITE || 'datadoghq.com';
  const service = process.env.DD_SERVICE || 'helm-sports-labs';
  const env = process.env.DD_ENV || 'development';

  // Only initialize if we have the required credentials
  if (!applicationId || !clientToken || applicationId === 'YOUR_APPLICATION_ID') {
    console.log('[Datadog] Skipping initialization - missing credentials');
    return;
  }

  try {
    // Initialize RUM (Real User Monitoring)
    datadogRum.init({
      applicationId,
      clientToken,
      site,
      service,
      env,
      version: '1.0.0',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask-user-input',
      allowedTracingUrls: [
        { match: /https:\/\/.*\.supabase\.co/, propagatorTypes: ['tracecontext'] },
        { match: window.location.origin, propagatorTypes: ['tracecontext'] },
      ],
    });

    // Initialize Browser Logs
    datadogLogs.init({
      clientToken,
      site,
      service,
      env,
      forwardErrorsToLogs: true,
      sessionSampleRate: 100,
    });

    isInitialized = true;
    console.log('[Datadog] Initialized successfully');
  } catch (error) {
    console.error('[Datadog] Failed to initialize:', error);
  }
}

// Set user context after login
export function setDatadogUser(user: { id: string; email?: string; name?: string }) {
  if (typeof window === 'undefined') return;

  datadogRum.setUser({
    id: user.id,
    email: user.email,
    name: user.name,
  });
}

// Clear user context on logout
export function clearDatadogUser() {
  if (typeof window === 'undefined') return;
  datadogRum.clearUser();
}

// Log custom actions
export function trackAction(name: string, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  datadogRum.addAction(name, context);
}

// Log custom errors
export function trackError(error: Error, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  datadogRum.addError(error, context);
}

// Log to Datadog
export function logInfo(message: string, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  datadogLogs.logger.info(message, context);
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  datadogLogs.logger.warn(message, context);
}

export function logError(message: string, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  datadogLogs.logger.error(message, context);
}
