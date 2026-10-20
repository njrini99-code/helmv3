import { describeError } from '@/lib/utils/describe-error';

/**
 * The browser client's own request deadline (src/lib/supabase/client.ts)
 * firing on a slow connection. supabase-js RESOLVES it as a plain error
 * object; Chrome words it `TimeoutError: signal timed out`, WebKit
 * `AbortError: Fetch is aborted` with the hint `Request was aborted (timeout
 * or manual cancellation)`. That is the connection, not the table being read,
 * so call sites that retry on their own keep their user-facing state but do
 * not report it. Shared by use-message-reactions (Bridge 9b8ad988) and the
 * conversation rail in use-golf-messages (Bridge af4c2c9d); use-presence
 * matches the same wordings.
 */
const CLIENT_DEADLINE_ABORT_PATTERNS: readonly RegExp[] = [
  /timeouterror:\s*signal timed out/i,
  /aborterror:\s*fetch is aborted/i,
  /request was aborted \(timeout or manual cancellation\)/i,
];

export function isClientDeadlineAbort(cause: unknown): boolean {
  const e = typeof cause === 'object' && cause !== null ? (cause as { message?: unknown; hint?: unknown }) : null;
  const text = [
    describeError(cause),
    typeof e?.message === 'string' ? e.message : '',
    typeof e?.hint === 'string' ? e.hint : '',
  ].join(' ');
  return CLIENT_DEADLINE_ABORT_PATTERNS.some((pattern) => pattern.test(text));
}
