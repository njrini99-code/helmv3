'use client';

import { useCallback, useRef, useState } from 'react';
import { chReport, chTrail } from './track';
import { useToast } from '../ui/Toast';
import { haptic } from './haptics';

/** Helm server actions return either shape; useAction normalises both. */
export type ServerResult<T = unknown> = { success?: boolean; ok?: boolean; data?: T; error?: string };
export type ActionResult<T = unknown> = { success: true; data?: T } | { success: false; error?: string; data?: T };

export function normalise<T>(r: ServerResult<T> | null | undefined): ActionResult<T> {
  if (r && (r.success === true || r.ok === true)) return { success: true, data: r.data };
  return { success: false, error: r?.error, data: r?.data };
}

export interface ActionCopy {
  /** Shown on success, for example "Reminder sent to Eli". Empty for a switch, whose new position is the confirmation. */
  done: string;
  /** What failed, in the coach's words: "Couldn't send the reminder to Eli". */
  failed: string;
  /** What to do next when retrying won't help, for example "Check that Eli is still on the roster". */
  hint?: string;
  /** Catalog number of the failure toast (docs/clubhouse/catalog). */
  code?: string;
  /**
   * The outcome is drawn by another surface (a dialog that opened, the page that took over), so this action says
   * nothing and ticks nothing, success or failure. Set it from `refine`, once the result is known.
   */
  quiet?: boolean;
  /** `false` when trying again can't change the answer, so the failure toast has no action; a string names the action instead of "Retry". */
  retry?: false | string;
  /**
   * Whether this action counts as offline, in place of `navigator.onLine` alone. A round screen passes the engine's
   * own reading (the connection probe as well), because WKWebView reports false on some reachable networks.
   */
  offline?: () => boolean;
}

/** After this long, a save that hasn't answered says so once (CH-1902). */
export const CH_SLOW_SAVE_AFTER = 5000;

/** True when the browser says it has no network. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Every Clubhouse button that changes something goes through this. The coach
 * is always told the outcome: success is a toast with the success haptic (D-70), and
 * failure is an error toast that says what failed, why if the server said, and
 * offers Retry, with an error haptic. Failures are reported to Sentry with
 * the action name. Nothing fails silently, and a button can't double-submit.
 *
 * `refine` rewrites the copy once the result is in, for an action whose
 * outcome decides the words (Approve all names who failed and counts who was
 * added). A refined hint is shown as written.
 */
export function useAction<A extends unknown[], T>(
  name: string,
  action: (...args: A) => Promise<ServerResult<T>>,
  copy: ActionCopy | ((...args: A) => ActionCopy),
  refine?: (result: ActionResult<T>, copy: ActionCopy) => ActionCopy,
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  // The gate is a ref, not `pending`: a toast's Retry and a second quick tap both call a `run` made in an earlier render,
  // whose `pending` is stale (true after the action settled, false before it started).
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<ActionResult<T>> => {
      if (inFlight.current) return { success: false, error: 'busy' };
      let c = typeof copy === 'function' ? copy(...args) : copy;
      chTrail(`action ${name}`);
      if ((c.offline ?? isOffline)()) {
        // CH-1903: nothing is sent while offline; say so instead of spinning.
        haptic('error');
        toast({ tone: 'error', title: `${c.failed}: you're offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903', action: { label: 'Retry', run: () => void run(...args) } });
        return { success: false, error: 'offline' };
      }
      inFlight.current = true;
      setPending(true);
      const slow = window.setTimeout(() => toast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902' }), CH_SLOW_SAVE_AFTER);
      let result: ActionResult<T>;
      try {
        result = normalise(await action(...args));
      } catch (err) {
        chReport(err, { surface: name.split('.')[0] ?? name, action: name });
        result = { success: false, error: undefined };
      } finally {
        window.clearTimeout(slow);
        inFlight.current = false;
        setPending(false);
      }
      if (refine) c = refine(result, c);
      // Another surface owns this outcome (a dialog, the page that took over): nothing to say twice.
      if (c.quiet) return result;
      if (result.success) {
        // CH-1702: a save or send that lands gives the success pattern; CH-1703: a failure the error pattern (below).
        haptic('success');
        if (c.done) toast({ title: c.done });
      } else {
        // A handled failure (the action returned success: false) is still tracked, at low severity.
        if (result.error !== 'busy') chReport(new Error(result.error || 'action failed'), { surface: name.split('.')[0] ?? name, action: name, severity: 'low' });
        haptic('error');
        toast({
          tone: 'error',
          title: c.failed,
          body: (refine ? c.hint : undefined) ?? friendlyReason(result.error) ?? c.hint ?? 'Check your connection and try again.',
          action: c.retry === false ? undefined : { label: c.retry ?? 'Retry', run: () => void run(...args) },
          code: c.code,
        });
      }
      return result;
    },
    [action, copy, name, refine, toast],
  );

  return { run, pending };
}

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
