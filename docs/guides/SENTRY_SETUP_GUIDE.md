# Sentry Setup Guide for GolfHelm
**Purpose:** Error tracking, performance monitoring, and real-time alerts
**Framework:** Next.js 14 (App Router) + TypeScript + Supabase

---

## 1. Installation

```bash
# Install Sentry SDK for Next.js
npm install --save @sentry/nextjs

# Run Sentry setup wizard (recommended)
npx @sentry/wizard@latest -i nextjs
```

The wizard will:
- Create Sentry account (or link existing)
- Add Sentry config files
- Update next.config.js
- Create .env.local with DSN

**Manual Installation (if wizard fails):**
```bash
npm install --save @sentry/nextjs
```

---

## 2. Configuration Files

### **sentry.client.config.ts** (Root directory)

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Custom error filtering
  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Filter out known non-critical errors
    const error = hint.originalException;

    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as Error).message;

      // Ignore Supabase auth refresh errors (common and harmless)
      if (message?.includes('Auth session missing')) {
        return null;
      }

      // Ignore network errors (user loses connection)
      if (message?.includes('NetworkError') || message?.includes('Failed to fetch')) {
        return null;
      }
    }

    return event;
  },

  // Add user context for better debugging
  beforeSendTransaction(event) {
    // You can modify or filter transactions here
    return event;
  },

  // Environment
  environment: process.env.NODE_ENV,
});
```

---

### **sentry.server.config.ts** (Root directory)

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Custom error filtering for server
  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Filter out database connection timeout errors (usually temporary)
    const error = hint.originalException;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as Error).message;

      if (message?.includes('Connection timeout')) {
        return null;
      }
    }

    return event;
  },

  // Environment
  environment: process.env.NODE_ENV,
});
```

---

### **sentry.edge.config.ts** (Root directory)

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Environment
  environment: process.env.NODE_ENV,
});
```

---

### **instrumentation.ts** (Root directory - Next.js 14+)

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

---

### **next.config.js** (Update existing file)

```javascript
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing Next.js config
  reactStrictMode: true,
  // ... other configs
};

// Sentry configuration
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "your-org-name", // Replace with your Sentry org
  project: "golfhelm", // Replace with your Sentry project

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
};

// Make sure adding Sentry options is the last code to run before exporting
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
```

---

### **.env.local** (Add Sentry DSN)

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id

# Auth Token for uploading source maps (keep secret!)
SENTRY_AUTH_TOKEN=your-sentry-auth-token

# Optional: Customize Sentry environment
SENTRY_ENVIRONMENT=development
```

**Get your DSN:**
1. Go to https://sentry.io
2. Create project (Next.js type)
3. Copy DSN from project settings

---

## 3. Usage in Your App

### **Capturing Errors in Server Actions**

```typescript
// src/app/golf/actions/golf.ts
'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export async function createEvent(eventData: EventData) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('golf_events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      // Capture database errors
      Sentry.captureException(error, {
        tags: {
          action: 'createEvent',
          table: 'golf_events',
        },
        contexts: {
          event: {
            title: eventData.title,
            team_id: eventData.team_id,
          },
        },
      });

      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    // Capture unexpected errors
    Sentry.captureException(error, {
      tags: {
        action: 'createEvent',
        type: 'unexpected',
      },
    });

    throw error;
  }
}
```

---

### **Capturing Errors in Client Components**

```typescript
// src/components/golf/calendar/EventDetailModal.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

export function EventDetailModal() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    try {
      e.preventDefault();

      const result = await createEvent(formData);

      if (!result.success) {
        setError(result.error);

        // Log to Sentry
        Sentry.captureMessage('Event creation failed', {
          level: 'warning',
          tags: {
            component: 'EventDetailModal',
          },
          contexts: {
            form: formData,
            error: result.error,
          },
        });
      }
    } catch (error) {
      // Capture unexpected errors
      Sentry.captureException(error, {
        tags: {
          component: 'EventDetailModal',
          action: 'handleSubmit',
        },
      });

      setError('An unexpected error occurred');
    }
  }

  return (
    // ... component JSX
  );
}
```

---

### **Error Boundary Component**

```typescript
// src/components/ErrorBoundary.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  eventId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    Sentry.withScope((scope) => {
      scope.setContext('errorInfo', errorInfo);
      const eventId = Sentry.captureException(error);
      this.setState({ eventId });
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Something went wrong
              </h2>
              <p className="text-slate-500 mb-4">
                We've been notified and will fix this as soon as possible.
              </p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Try again
              </button>
              {this.state.eventId && (
                <p className="text-xs text-slate-400 mt-4">
                  Error ID: {this.state.eventId}
                </p>
              )}
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

**Usage in Layout:**
```typescript
// src/app/layout.tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

---

### **Tracking User Context**

```typescript
// src/app/golf/(dashboard)/layout.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      // Set user context
      Sentry.setUser({
        id: user.id,
        email: user.email,
        // Add custom fields
        role: user.role,
        sport: user.sport,
      });
    } else {
      // Clear user context on logout
      Sentry.setUser(null);
    }
  }, [user]);

  return <>{children}</>;
}
```

---

### **Performance Monitoring**

```typescript
// Track slow database queries
import * as Sentry from '@sentry/nextjs';

export async function getCalendarEvents(teamId: string) {
  const transaction = Sentry.startTransaction({
    name: 'getCalendarEvents',
    op: 'db.query',
  });

  try {
    const span = transaction.startChild({
      op: 'db.query',
      description: 'Fetch calendar events',
    });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', teamId);

    span.finish();

    if (error) throw error;
    return data;
  } finally {
    transaction.finish();
  }
}
```

---

## 4. Custom Sentry Alerts

### **Create Alert Rules**

1. Go to Sentry Dashboard → Alerts → Create Alert
2. Configure conditions:

**High Error Rate Alert:**
```
When: Error count is more than 10
In: 1 hour
Then: Send email/Slack notification
```

**Database Error Alert:**
```
When: Error with tag "table" = "golf_events"
Count: more than 5
In: 5 minutes
Then: Send notification
```

**Performance Alert:**
```
When: Transaction duration is more than 2000ms
For: getCalendarEvents
Then: Send notification
```

---

## 5. Sentry Integration with Supabase Errors

```typescript
// src/lib/supabase/error-handler.ts
import * as Sentry from '@sentry/nextjs';
import { PostgrestError } from '@supabase/supabase-js';

export function handleSupabaseError(
  error: PostgrestError | null,
  context: {
    operation: string;
    table: string;
    details?: Record<string, any>;
  }
): void {
  if (!error) return;

  // Map Supabase error codes to severity
  const severity = getErrorSeverity(error.code);

  Sentry.captureException(new Error(error.message), {
    level: severity,
    tags: {
      database: 'supabase',
      table: context.table,
      operation: context.operation,
      error_code: error.code,
    },
    contexts: {
      supabase: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
      operation: context.details,
    },
  });
}

function getErrorSeverity(code: string): Sentry.SeverityLevel {
  // RLS violations are warnings (expected in some cases)
  if (code === 'PGRST301') return 'warning';

  // Permission denied
  if (code === '42501') return 'error';

  // Unique violation
  if (code === '23505') return 'warning';

  // Other errors
  return 'error';
}
```

**Usage:**
```typescript
const { data, error } = await supabase
  .from('golf_events')
  .insert(eventData);

handleSupabaseError(error, {
  operation: 'insert',
  table: 'golf_events',
  details: { team_id: eventData.team_id },
});
```

---

## 6. Testing Sentry Integration

### **Test Error Capture**

Create a test route:

```typescript
// src/app/api/sentry-test/route.ts
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export async function GET() {
  // Test different error types

  // 1. Captured exception
  Sentry.captureException(new Error('Test error from API route'));

  // 2. Captured message
  Sentry.captureMessage('Test message', 'info');

  // 3. Throw error (will be caught automatically)
  if (Math.random() > 0.5) {
    throw new Error('Random test error');
  }

  return NextResponse.json({ message: 'Sentry test triggered' });
}
```

**Test it:**
```bash
curl http://localhost:3000/api/sentry-test
```

Check Sentry dashboard for errors.

---

## 7. Sentry Dashboard Setup

### **Create Custom Dashboards**

1. **Error Overview Dashboard:**
   - Total errors (last 24h)
   - Error rate trend
   - Top 10 errors
   - Errors by environment

2. **Performance Dashboard:**
   - Average response time
   - Slowest transactions
   - Database query performance
   - P95 response time

3. **User Impact Dashboard:**
   - Affected users count
   - Error-free sessions %
   - User feedback

---

## 8. Best Practices

### ✅ DO:
- ✅ Set user context early (in auth hook)
- ✅ Add meaningful tags to errors
- ✅ Filter out expected errors (auth refresh)
- ✅ Use different sample rates for dev/prod
- ✅ Add breadcrumbs for debugging
- ✅ Set up alerts for critical errors

### ❌ DON'T:
- ❌ Send errors in development (filter them out)
- ❌ Log sensitive user data (PII)
- ❌ Send every network error (too noisy)
- ❌ Forget to upload source maps
- ❌ Use 100% replay sampling in production (expensive)

---

## 9. Deployment Checklist

- [ ] Sentry DSN added to environment variables
- [ ] Auth token added (for source maps upload)
- [ ] Source maps configured in next.config.js
- [ ] Error filtering configured (beforeSend)
- [ ] User context tracking implemented
- [ ] Error boundary added to layout
- [ ] Test error sent and received in dashboard
- [ ] Alerts configured for critical errors
- [ ] Team invited to Sentry project

---

## 10. Monitoring Checklist

After deploying, monitor:
- [ ] Error rate (should be low)
- [ ] Source maps working (stack traces readable)
- [ ] User context appearing in errors
- [ ] Alerts firing correctly
- [ ] Performance metrics collecting

---

## 11. Cost Optimization

**Free Tier Limits:**
- 5,000 errors/month
- 10,000 performance transactions/month
- 50 replay sessions/month

**To Stay Within Limits:**
```typescript
// Adjust sample rates based on environment
const tracesSampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
const replaysSessionSampleRate = process.env.NODE_ENV === 'production' ? 0.01 : 0.1;
```

---

## 12. Common Issues

### **Source Maps Not Uploading**
```bash
# Check Sentry auth token
echo $SENTRY_AUTH_TOKEN

# Manually upload source maps
npx @sentry/cli sourcemaps upload --org your-org --project golfhelm .next
```

### **Errors Not Appearing**
- Check DSN is correct
- Check `debug: true` in Sentry config
- Check beforeSend isn't filtering all errors
- Check environment matches

### **Too Many Errors**
- Add better error filtering in beforeSend
- Lower sample rate
- Fix recurring errors

---

**Setup Time:** ~30 minutes
**Difficulty:** Easy
**Value:** High - Critical for production monitoring

Next: Set up Playwright for automated testing!
