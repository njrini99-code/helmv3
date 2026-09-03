/**
 * `recordLoginOutcome` — split out of `src/app/golf/actions/auth.ts`
 * deliberately, not for organization but for correctness: that file opens
 * with `'use server'`, and Next.js requires EVERY export from a `'use
 * server'` file to be an async Server Action. This helper is neither async
 * nor an action — it is a synchronous, fire-and-forget observability call —
 * so exporting it from auth.ts directly (done once, then reverted) broke
 * that constraint and additionally tripped
 * `coverage-contract.observability.test.ts`'s "every direct export of a
 * `'use server'` golf action file is either `withAdminObserved`-wrapped or
 * an accepted exception" gate, since a bare helper export looks exactly like
 * an unwrapped action to that scan.
 *
 * `deleteInProgressRoundImpl`'s sibling helper (`recordDiscardRoundOutcome`
 * in golf.ts) avoids the same trap by staying un-exported and local to that
 * file — not an option here, because this one needs to be unit-testable
 * directly (see auth-login-observability.test.ts) without dragging in
 * `loginActionImpl`'s ~15 other dependencies (rate limiter, account lockout,
 * GoTrue, demo/super-admin/coach-entry resolution, several logging modules)
 * just to reach a function that itself has none of them.
 */
import { recordAuth } from './metrics';
import { helmLog } from './structured-log';

/**
 * Emits `helm.auth.*` (metrics.ts `recordAuth`) + one `helmLog` line for a
 * golf login attempt. Called from `loginActionImpl` at each of its existing
 * return branches — see that function in auth.ts.
 */
export function recordLoginOutcome(outcome: string, errorCode?: string): void {
  recordAuth({ action: 'golf.login', outcome, runtime: process.env.NEXT_RUNTIME, errorCode });
  helmLog[outcome === 'success' ? 'info' : 'warn']('golf.auth.login_finished', {
    sport: 'golf',
    feature: 'auth_onboarding',
    action: 'golf.login',
    result: outcome,
    runtime: process.env.NEXT_RUNTIME,
    error_code: errorCode,
  });
}
