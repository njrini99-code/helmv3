// Plain module (no 'use client') so server modules can share the copy rule
// with the mutation wrapper in use-action.ts.
import { isTransientNetworkErrorMessage } from '@/lib/transient-network-error';

/**
 * The browser's own wording for a request that never got an answer: transport failures (`isTransientNetworkErrorMessage`,
 * WebKit's "Load failed" among them), plus the abort, timeout and connect texts engines raise for a fetch. None of it is
 * copy for a person: Safari's toast read "Load failed." (audit A-06). Exact phrases, not a bare /timeout|aborted/, so app
 * copy such as "Your session timed out" still passes through.
 */
const BROWSER_FAILURE =
  /^(?:\w*Error:\s*)?(?:the operation was aborted|signal is aborted without reason|signal timed out|the operation timed out|the user aborted a request|could not connect to the server|the request timed out)\.?$/i;

export function isRawBrowserFailure(message: string): boolean {
  return isTransientNetworkErrorMessage(message) || BROWSER_FAILURE.test(message.trim());
}

/**
 * Server error strings are sometimes written for developers. Pass through
 * short, sentence-like messages; replace anything technical with nothing so
 * the caller's hint is shown instead.
 */
export function friendlyReason(error: string | undefined): string | null {
  if (!error) return null;
  const e = error.trim();
  if (e.length > 140 || isRawBrowserFailure(e) || /[{}<>]|PGRST|violates|constraint|null value|TypeError|undefined|stack|JWT|\bRPC\b|42\d{3}/i.test(e)) {
    return null;
  }
  if (/not authenticated|session/i.test(e)) return 'Your session ended. Sign in again, then retry.';
  if (/permission|not allowed|forbidden|unauthori[sz]ed/i.test(e)) return 'Your account doesn’t have access to do this.';
  return /[.?]$/.test(e) ? e : `${e}.`;
}
