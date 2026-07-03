# Observability convention

**Last updated:** 2026-04-21 (Team F, Phase 1)

## TL;DR — where errors go

| Surface | Where to see it | How to send to it |
|---|---|---|
| **Server actions** (`src/app/**/actions/*.ts`) | Sentry → Issues (tag: `scope=actions.<file>.<fn>`) + admin_events table | `await logServerError(message, { action, metadata })` |
| **Route handlers** (`src/app/api/**/route.ts`) | Same as above | Same as above |
| **Server components** (`page.tsx` fetching data) | Same as above | Same as above |
| **Client components** (`'use client'`) | Sentry → Browser Issues + Datadog RUM | `useEffect` error boundary; last resort `console.error` only |
| **Client-side actions (mutations triggered from browser)** | Still land in Sentry (server action runs server-side) | Same as server actions |
| **Background jobs** (Vercel cron) | Same as server actions | Same as server actions |

## The rule

**Never `console.error` a handled server-side error.** If you catch it and
return a structured response, you're telling the user "we handled it" —
but the incident still needs to reach the on-call page. That means
Sentry. `console.error` silently dumps to Vercel Function logs which
nobody watches.

```typescript
// WRONG — invisible to on-call
try { ... } catch (e) {
  console.error('failed to do thing:', e);
  return { error: 'failed' };
}

// RIGHT — page-able
import { logServerError } from '@/lib/server-error-logger';

try { ... } catch (e) {
  await logServerError(
    `[actionName] failed: ${e instanceof Error ? e.message : String(e)}`,
    { action: 'feature.actionName', userId, metadata: { extra: 'context' } },
  );
  return { error: 'failed' };
}
```

## `logServerError` API

```typescript
logServerError(
  message: string,
  context: {
    action: string;        // REQUIRED. Format: 'file.functionName'.
    featureArea?: string;  // e.g. 'coachhelm', 'rounds', 'messages'
    userId?: string | null;
    userEmail?: string | null;
    errorCode?: string;    // e.g. Postgres error code '23505'
    statusCode?: number;
    metadata?: Record<string, unknown>;  // Anything else
    tags?: Record<string, string | number | boolean | null | undefined>;
    fingerprint?: string[]; // Override Sentry grouping
  },
  severity?: 'warning' | 'error' | 'critical', // defaults to 'error'
): Promise<void>
```

Writes to:
1. `Sentry.captureException` (Issues page, Slack, pager) — tagged with
   `action`, `error_source`, `feature_area`, and user context.
2. `error_logs` table (admin dashboard "Errors" tab).
3. `admin_events` table (admin dashboard "Events" stream).

## Non-async contexts

`logServerError` is async. If you're inside a `.catch(cb)` or a
synchronous helper, use `void logServerError(...)` — it's a tracked
fire-and-forget. The function swallows its own errors internally, so
it's safe to detach.

## Client-side errors

Client components can't import `server-only` modules. Use the existing
`src/lib/error-logging.ts` `logError` helper or Sentry's
`@sentry/nextjs` `captureException` directly. For error boundaries, let
the existing `global-error.tsx` and per-route `error.tsx` components
handle it — they're already wired to Sentry.

## Verifying an error shows up in Sentry

1. In a preview deploy, throw a deliberate error in a server action.
2. Hit the action from the UI.
3. Within 60s, the error should appear in Sentry → Issues with:
   - `scope: actions.<file>.<fn>` tag
   - User context (if `userId` was passed)
   - Stack trace pointing at the right line
4. Remove the deliberate throw and redeploy.

If it doesn't show up:
- Confirm `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel for the env
- Check `instrumentation.ts` for runtime filters (NEXT_NOT_FOUND /
  NEXT_REDIRECT are suppressed on purpose)
- Check the Sentry org/project env vars in `next.config.mjs`
