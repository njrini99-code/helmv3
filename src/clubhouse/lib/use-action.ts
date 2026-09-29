'use client';

import { useCallback, useState } from 'react';
import { chReport, chTrail } from './track';
import { useToast } from '../ui/Toast';
import { haptic } from './haptics';

/** Helm server actions return either shape; useAction normalises both. */
export type ServerResult<T = unknown> = { success?: boolean; ok?: boolean; data?: T; error?: string };
export type ActionResult<T = unknown> = { success: true; data?: T } | { success: false; error?: string };

function normalise<T>(r: ServerResult<T> | null | undefined): ActionResult<T> {
  if (r && (r.success === true || r.ok === true)) return { success: true, data: r.data };
  return { success: false, error: r?.error };
}

export interface ActionCopy {
  /** Shown on success, for example "Reminder sent to Eli". */
  done: string;
  /** What failed, in the coach's words: "Couldn't send the reminder to Eli". */
  failed: string;
  /** What to do next when retrying won't help, for example "Check that Eli is still on the roster". */
  hint?: string;
}

/**
 * Every Clubhouse button that changes something goes through this. The coach
 * is always told the outcome: success is a toast with a commit haptic, and
 * failure is an error toast that says what failed, why if the server said, and
 * offers Retry, with an error haptic. Failures are reported to Sentry with
 * the action name. Nothing fails silently, and a button can't double-submit.
 */
export function useAction<A extends unknown[], T>(
  name: string,
  action: (...args: A) => Promise<ServerResult<T>>,
  copy: ActionCopy | ((...args: A) => ActionCopy),
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: A): Promise<ActionResult<T>> => {
      if (pending) return { success: false, error: 'busy' };
      const c = typeof copy === 'function' ? copy(...args) : copy;
      setPending(true);
      chTrail(`action ${name}`);
      let result: ActionResult<T>;
      try {
        result = normalise(await action(...args));
      } catch (err) {
        chReport(err, { surface: name.split('.')[0] ?? name, action: name });
        result = { success: false, error: undefined };
      } finally {
        setPending(false);
      }
      if (result.success) {
        haptic('commit');
        toast({ title: c.done });
      } else {
        // A handled failure (the action returned success: false) is still tracked, at low severity.
        if (result.error !== 'busy') chReport(new Error(result.error || 'action failed'), { surface: name.split('.')[0] ?? name, action: name, severity: 'low' });
        haptic('error');
        toast({
          tone: 'error',
          title: c.failed,
          body: friendlyReason(result.error) ?? c.hint ?? 'Check your connection and try again.',
          action: { label: 'Retry', run: () => void run(...args) },
        });
      }
      return result;
    },
    [action, copy, name, pending, toast],
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
