// Plain module (no 'use client') so server modules can share the copy rule
// with the mutation wrapper in use-action.ts.

/**
 * Server error strings are sometimes written for developers. Pass through
 * short, sentence-like messages; replace anything technical with nothing so
 * the caller's hint is shown instead.
 */
export function friendlyReason(error: string | undefined): string | null {
  if (!error) return null;
  const e = error.trim();
  if (e.length > 140 || /[{}<>]|PGRST|violates|constraint|null value|TypeError|undefined|stack|JWT|\bRPC\b|42\d{3}/i.test(e)) {
    return null;
  }
  if (/not authenticated|session/i.test(e)) return 'Your session ended. Sign in again, then retry.';
  if (/permission|not allowed|forbidden|unauthori[sz]ed/i.test(e)) return 'Your account doesn’t have access to do this.';
  return /[.?]$/.test(e) ? e : `${e}.`;
}
