# Error Monitoring Setup

The application has a built-in error monitoring infrastructure ready for production integration.

## Current State

- ✅ Error logging utilities (`/src/lib/error-monitoring.ts`)
- ✅ Client-side error reporting API (`/api/log-error`)
- ✅ Error boundaries in place (`/src/app/error.tsx`, `/src/app/global-error.tsx`)
- ✅ Rate limiting on error logging endpoint
- ⏳ Production monitoring service integration (Sentry recommended)

## Integrating Sentry (Recommended)

### 1. Install Sentry

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### 2. Configure Environment Variables

Add to `.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn_here
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project
SENTRY_AUTH_TOKEN=your_auth_token
```

### 3. Update Error Monitoring

In `/src/lib/error-monitoring.ts`, uncomment the Sentry integration code:

```typescript
import * as Sentry from '@sentry/nextjs';

// In sendToMonitoringService method:
Sentry.captureException(new Error(report.message), {
  level: this.mapSeverityToSentryLevel(report.severity),
  contexts: { error_context: report.context },
  extra: { timestamp: report.timestamp },
});
```

### 4. Initialize Sentry

The wizard will create:
- `sentry.client.config.ts` - Client-side initialization
- `sentry.server.config.ts` - Server-side initialization
- `sentry.edge.config.ts` - Edge runtime initialization

### 5. Set User Context on Auth

In your auth flow (after successful login), add:

```typescript
import { setUser } from '@/lib/error-monitoring';

// After successful login
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  setUser({
    id: user.id,
    email: user.email || '',
    role: userData.role,
  });
}
```

And on logout:

```typescript
import { clearUser } from '@/lib/error-monitoring';

// On logout
clearUser();
```

## Usage Examples

### Log an Error

```typescript
import { logError, ErrorSeverity } from '@/lib/error-monitoring';

try {
  await someOperation();
} catch (error) {
  logError(error as Error, ErrorSeverity.HIGH, {
    userId: user.id,
    page: '/dashboard',
    action: 'load_data',
  });
}
```

### Log a Critical Error

```typescript
import { logCritical } from '@/lib/error-monitoring';

if (!criticalDataAvailable) {
  logCritical('Critical data unavailable', {
    page: '/checkout',
    userId: user.id,
  });
}
```

### Log a Warning

```typescript
import { logWarning } from '@/lib/error-monitoring';

if (featureDeprecated) {
  logWarning('Using deprecated feature', {
    feature: 'old-api',
    userId: user.id,
  });
}
```

## Alternative Services

### LogRocket

```bash
npm install logrocket
```

Good for: Session replay + error tracking

### Datadog

```bash
npm install @datadog/browser-logs
```

Good for: Full observability stack (logs, metrics, traces)

### Rollbar

```bash
npm install rollbar
```

Good for: Error tracking with deployment tracking

## Production Checklist

Before deploying:

- [ ] Configure Sentry (or alternative)
- [ ] Set up error alerting (Slack/email)
- [ ] Configure source maps for stack traces
- [ ] Set up error grouping rules
- [ ] Configure sampling rate (100% in dev, 10-50% in prod)
- [ ] Test error reporting in staging
- [ ] Set up dashboard for error monitoring
- [ ] Configure alerts for critical errors

## Testing Error Monitoring

To test that error monitoring is working:

1. **Client-side error:**
```typescript
throw new Error('Test client error');
```

2. **Server-side error:**
```typescript
// In an API route
throw new Error('Test server error');
```

3. **Check Sentry dashboard** for the errors

## Best Practices

1. **Don't log sensitive data** (passwords, tokens, PII)
2. **Add context** to every error (user ID, page, action)
3. **Use appropriate severity levels** (don't mark everything critical)
4. **Set up alerts** for critical errors only (avoid alert fatigue)
5. **Review errors weekly** to identify patterns
6. **Create error budgets** and track error rates

## Current Error Boundaries

The app has error boundaries at:
- **Global:** `/src/app/global-error.tsx` - Catches layout errors
- **Route:** `/src/app/error.tsx` - Catches page errors
- **Component:** Can add `<ErrorBoundary>` components as needed

## Monitoring Dashboard

Recommended Sentry dashboard widgets:
- Error frequency over time
- Errors by page/route
- Errors by user
- New errors in last 24h
- Error rate vs traffic
- Release health (after deployments)
