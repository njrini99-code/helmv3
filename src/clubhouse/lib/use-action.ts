'use client';

import { useCallback, useRef, useState } from 'react';
import { friendlyReason } from './friendly-reason';

export { friendlyReason };
import { chReport, chTrail } from './track';
import { chSignal, reportingSignal } from './signal';
import { useDelayedToast, useToast } from '../ui/Toast';
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
  /** `false` when trying again can't change the answer, so the failure toast has no action; a string names the action instead of "Try again". */
  retry?: false | string;
  /**
   * Whether this action counts as offline, in place of `navigator.onLine` alone. A round screen passes the engine's
   * own reading (the connection probe as well), because WKWebView reports false on some reachable networks.
   */
  offline?: () => boolean;
}

/** After this long, a save that hasn't answered says so once (CH-1902). */
export const CH_SLOW_SAVE_AFTER = 5000;

/**
 * After this long, a save still out offers to stop waiting (CH-1990): "This is taking longer than usual" with Cancel. Its
 * notice stays until the save answers or someone acts on it; closed, it offers again after as long once more.
 */
export const CH_SLOW_SAVE_GIVE_UP = 20_000;

/** The give-up notice holds this long at most (a timer needs a number); then it offers again. */
const GIVE_UP_HOLD_MS = 10 * 60_000;
/** The slow notices replace one another: never "Still saving…" beside "This is taking longer than usual". */
const SLOW_SAVE_KEY = 'ch-slow-save';

/** A Postgres or PostgREST code in a failure's message (`PGRST116`, `code 42501`), for the Bridge's server-code column. */
export function serverCodeIn(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return /\b(PGRST\d{3})\b/.exec(message)?.[1] ?? /\b(?:code|sqlstate)\W{0,3}([0-9][0-9A-Z]{4})\b/i.exec(message)?.[1];
}

/** How long the Bridge keeps an action's duration at most (the signal envelope's cap). */
const SIGNAL_DURATION_MAX = 600_000;

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
  const delayedToast = useDelayedToast();
  const [pending, setPending] = useState(false);
  // The gate is a ref, not `pending`: a toast's Retry and a second quick tap both call a `run` made in an earlier render,
  // whose `pending` is stale (true after the action settled, false before it started).
  const inFlight = useRef(false);
  // A save someone stopped waiting for (CH-1991) that is still out: a second Save would send it twice (a second plan, a
  // second message), so it waits for that answer and says so.
  const stoppedOut = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<ActionResult<T>> => {
      if (inFlight.current) {
        // E2 (Bridge plan §4.2): only the wait the coach is told about is counted; a double tap is not an outcome.
        if (stoppedOut.current) {
          chSignal({ kind: 'action', outcome: 'busy', code: 'CH-1991', act: name });
          toast({ title: 'Your last save hasn’t answered yet', body: 'You’ll see here when it does. Then you can save again.', code: 'CH-1991', replace: SLOW_SAVE_KEY });
        }
        return { success: false, error: 'busy' };
      }
      let c = typeof copy === 'function' ? copy(...args) : copy;
      chTrail(`action ${name}`);
      if ((c.offline ?? isOffline)()) {
        // CH-1903: nothing is sent while offline; say so instead of spinning.
        haptic('error');
        chSignal({ kind: 'action', outcome: 'offline', code: 'CH-1903', act: name });
        toast({ tone: 'error', title: `${c.failed}: you’re offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903', reported: true, action: { label: 'Try again', run: () => void run(...args) } });
        return { success: false, error: 'offline' };
      }
      inFlight.current = true;
      setPending(true);
      const startedAt = Date.now();
      const elapsed = () => Math.min(SIGNAL_DURATION_MAX, Math.max(0, Date.now() - startedAt));
      chSignal({ kind: 'action', outcome: 'start', act: name });
      const stopSlow = delayedToast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902', replace: SLOW_SAVE_KEY }, CH_SLOW_SAVE_AFTER);
      // CH-1990 (GAP-S-31): a save still out after 20 seconds offers Cancel. A server action can't be called back, so
      // Cancel stops waiting: the button is free again and what was typed stays (the caller sees a failure, so it keeps
      // its form). Closing the notice keeps waiting, and it offers again later.
      let settled = false;
      let stopWaiting = () => {};
      const stopped = new Promise<'stopped'>((resolve) => (stopWaiting = () => resolve('stopped')));
      const offers: Array<() => void> = [];
      const offerCancel = () => {
        offers.push(
          delayedToast(
            {
              title: 'This is taking longer than usual',
              body: 'You can keep waiting, or cancel. Your changes are kept.',
              code: 'CH-1990',
              replace: SLOW_SAVE_KEY,
              holdMs: GIVE_UP_HOLD_MS,
              action: { label: 'Cancel', run: stopWaiting },
              onExpire: () => {
                if (!settled) offerCancel();
              },
            },
            CH_SLOW_SAVE_GIVE_UP,
          ),
        );
      };
      offerCancel();
      const surface = name.split('.')[0] ?? name;
      // A throw is reported once, when its outcome is told (below), at medium severity, with its signal's place.
      let thrown: { error: unknown } | null = null;
      const work = (async (): Promise<ActionResult<T>> => {
        try {
          return normalise(await action(...args));
        } catch (err) {
          thrown = { error: err };
          return { success: false, error: undefined };
        }
      })();
      /** Counts how the save ended and reports a failure once, with the signal that names it (E2, Bridge plan §4.2). */
      const record = (result: ActionResult<T>) => {
        if (result.success) {
          chSignal({ kind: 'action', outcome: 'success', code: 'CH-1702', act: name, durationMs: elapsed() });
          return;
        }
        const threw = thrown as { error: unknown } | null;
        // A handled failure (the action returned success: false) is still tracked, at low severity, unless another
        // surface owns it (quiet) or it is the busy gate. A quiet one is still counted, and the Bridge keeps its row.
        const reports = threw != null || (!c.quiet && result.error !== 'busy');
        const message = threw != null ? (threw.error instanceof Error ? threw.error.message : String(threw.error)) : result.error;
        const ref = chSignal({
          kind: 'action',
          outcome: 'failure',
          code: c.code ?? 'CH-1703',
          act: name,
          durationMs: elapsed(),
          message: message || 'action failed',
          serverCode: serverCodeIn(message),
          reported: reports,
        });
        reportingSignal(ref, () => {
          if (threw != null) chReport(threw.error, { surface, action: name });
          else if (reports) chReport(new Error(result.error || 'action failed'), { surface, action: name, severity: 'low' });
        });
      };
      /** Says how the save ended (the success or the failure pattern), unless another surface owns the outcome. */
      const tell = (result: ActionResult<T>): ActionResult<T> => {
        if (refine) c = refine(result, c);
        record(result);
        // Another surface owns this outcome (a dialog, the page that took over): nothing to say twice.
        if (c.quiet) return result;
        if (result.success) {
          // CH-1702: a save or send that lands gives the success pattern; CH-1703: a failure the error pattern (below).
          haptic('success');
          if (c.done) toast({ title: c.done });
        } else {
          haptic('error');
          toast({
            tone: 'error',
            title: c.failed,
            body: (refine ? c.hint : undefined) ?? friendlyReason(result.error) ?? c.hint ?? 'Try again.',
            action: c.retry === false ? undefined : { label: c.retry ?? 'Try again', run: () => void run(...args) },
            code: c.code,
            reported: true,
          });
        }
        return result;
      };
      const first = await Promise.race([work, stopped]);
      settled = true;
      stopSlow();
      for (const stop of offers) stop();
      setPending(false);
      if (first === 'stopped') {
        chTrail(`action ${name} stopped waiting`);
        chSignal({ kind: 'action', outcome: 'stopped-waiting', code: 'CH-1991', act: name, durationMs: elapsed() });
        toast({ title: 'Stopped waiting', body: 'Your changes are kept. If it saves after all, you’ll see it here.', code: 'CH-1991', replace: SLOW_SAVE_KEY });
        // Its answer still lands, and is told as any other: saved, or what failed with Try again.
        // The button is free again, but the gate stays shut until that answer lands, so nothing is sent twice.
        stoppedOut.current = true;
        void work.then((late) => {
          inFlight.current = false;
          stoppedOut.current = false;
          tell(late);
        });
        return { success: false, error: 'cancelled' };
      }
      inFlight.current = false;
      return tell(first);
    },
    [action, copy, delayedToast, name, refine, toast],
  );

  return { run, pending };
}
