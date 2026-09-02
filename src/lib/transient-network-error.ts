/**
 * A fetch that never reached the server — the transport layer, not the app.
 *
 * Every engine words this differently, and the message is all we get: the
 * `TypeError` carries no status and no useful stack.
 *
 *   Safari / iOS WKWebView ... "Load failed"
 *   Chrome / Edge ............ "Failed to fetch"
 *   Firefox .................. "NetworkError when attempting to fetch resource."
 *   Stripe.js ................ "A network error occurred."
 *   WebKit, mid-request ...... "The network connection was lost."
 *
 * A 500 from our own API does NOT land here, because `fetch` resolves for any
 * HTTP response it actually received. That is what makes the class safe to
 * tier down (`error-logging`), to retry once (the message send), and to keep
 * out of the actionable queue (`incident-classification`). Three call sites
 * carrying three copies of this list is the drift this module prevents: the
 * classifier's copy only knew the generic "network error" wording, so the
 * overnight digest of 2026-09-02 paged on three WebKit "Load failed" rows.
 *
 * Deliberately NOT matched: `AbortError`. Aborts are our own timeouts firing
 * (`AbortSignal.timeout`), a budget we chose and may need to revisit — a
 * different question from the user's connection dropping.
 */
export function isTransientNetworkErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror when attempting to fetch') ||
    msg.includes('a network error occurred') ||
    msg.includes('network connection was lost') ||
    msg.includes('internet connection appears to be offline') ||
    msg.includes('net::err_')
  );
}

/**
 * Run `attempt`; if it fails with a transport-layer TypeError, run it once
 * more after `delayMs`. Any other failure, and a second transport failure,
 * propagate untouched.
 *
 * WHY ONE, AND WHY THAT IS SAFE ENOUGH HERE. A retry is only dangerous when
 * the first request actually reached the server and only the response was
 * lost — then the work happens twice. For the call this wraps (a chat message
 * send) the person taps Send again on the error toast anyway, which carries
 * exactly that risk; the retry adds nothing the manual path did not already
 * have, and removes the toast. A schema-backed idempotency key is the real
 * answer for a call where a duplicate is costly. This helper is not that.
 */
export async function withOneTransportRetry<T>(attempt: () => Promise<T>, delayMs: number): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientNetworkErrorMessage(message)) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return attempt();
  }
}
