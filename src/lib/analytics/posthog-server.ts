/**
 * Server-side PostHog capture helper (posthog-node).
 *
 * Guards:
 *   - No-ops silently when NEXT_PUBLIC_POSTHOG_KEY is absent (CI, local dev
 *     without the key set, etc.).
 *   - Never throws — callers use fire-and-forget; errors are swallowed so a
 *     tracing failure never breaks a user-facing flow.
 *
 * Usage:
 *   import { captureServer, flush } from '@/lib/analytics/posthog-server';
 *   captureServer('demo_coach_entered', userId, { ip }).catch(() => {});
 */

import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  if (!_client) {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
    _client = new PostHog(key, {
      host,
      // Flush immediately — Next.js serverless functions are short-lived.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

/**
 * Emit a server-side PostHog event.
 *
 * @param event      PostHog event name (e.g. DEMO_ENTER_EVENT)
 * @param distinctId User/anonymous identifier — use auth.users.id when available
 * @param properties Additional event properties (ip, email, etc.)
 */
export async function captureServer(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  client.capture({ distinctId, event, properties: properties ?? {} });
  await client.flush();
}

/**
 * Flush any buffered events. Call at the end of a server action that batches
 * multiple capture() calls before flushing once.
 */
export async function flush(): Promise<void> {
  if (!_client) return;
  await _client.flush();
}
