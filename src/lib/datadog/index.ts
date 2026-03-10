// Datadog RUM (Real User Monitoring) and Browser Logs initialization
// This runs on the client side to track user sessions, errors, and performance
// SDKs are lazy-loaded to avoid blocking initial page render (~150KB savings)

let isInitialized = false;

export function initDatadog() {
  if (isInitialized || typeof window === 'undefined') {
    return;
  }

  const applicationId = process.env.NEXT_PUBLIC_DD_APPLICATION_ID;
  const clientToken = process.env.NEXT_PUBLIC_DD_CLIENT_TOKEN;

  // Bail early before loading any SDK code if credentials are missing
  if (!applicationId || !clientToken || applicationId === 'YOUR_APPLICATION_ID') {
    return;
  }

  // Skip in development — no need for RUM locally
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  isInitialized = true;

  const site = process.env.DD_SITE || 'datadoghq.com';
  const service = process.env.DD_SERVICE || 'helm-sports-labs';
  const env = process.env.DD_ENV || 'development';

  // Lazy-load SDKs after initial page render to avoid blocking
  requestIdleCallback(async () => {
    try {
      const [{ datadogRum }, { datadogLogs }] = await Promise.all([
        import('@datadog/browser-rum'),
        import('@datadog/browser-logs'),
      ]);

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

      datadogLogs.init({
        clientToken,
        site,
        service,
        env,
        forwardErrorsToLogs: true,
        sessionSampleRate: 100,
      });
    } catch (error) {
      console.error('[Datadog] Failed to initialize:', error);
    }
  });
}

// Helper to get the RUM SDK (lazy — only available after init)
async function getRum() {
  if (typeof window === 'undefined' || !isInitialized) return null;
  const { datadogRum } = await import('@datadog/browser-rum');
  return datadogRum;
}

async function getLogs() {
  if (typeof window === 'undefined' || !isInitialized) return null;
  const { datadogLogs } = await import('@datadog/browser-logs');
  return datadogLogs;
}

// Set user context after login
async function setDatadogUser(user: { id: string; email?: string; name?: string }) {
  const rum = await getRum();
  rum?.setUser({ id: user.id, email: user.email, name: user.name });
}

// Clear user context on logout
async function clearDatadogUser() {
  const rum = await getRum();
  rum?.clearUser();
}

// Log custom actions
async function trackAction(name: string, context?: Record<string, unknown>) {
  const rum = await getRum();
  rum?.addAction(name, context);
}

// Log custom errors
async function trackError(error: Error, context?: Record<string, unknown>) {
  const rum = await getRum();
  rum?.addError(error, context);
}

// Log to Datadog
async function logInfo(message: string, context?: Record<string, unknown>) {
  const logs = await getLogs();
  logs?.logger.info(message, context);
}

async function logWarn(message: string, context?: Record<string, unknown>) {
  const logs = await getLogs();
  logs?.logger.warn(message, context);
}

async function logError(message: string, context?: Record<string, unknown>) {
  const logs = await getLogs();
  logs?.logger.error(message, context);
}
