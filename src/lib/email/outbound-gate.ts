/**
 * Outbound customer-email kill switch (owner decision, 2026-09-06).
 *
 * No player/coach/parent-facing or Lift Lab customer email leaves the
 * product while `HELM_CUSTOMER_EMAIL_ENABLED` is not exactly `'true'`. This
 * is a suppression switch, not a deletion: every gated send path stays in
 * place and calls `gateCustomerEmail()` first. Flipping the var back to
 * `'true'` in Vercel (Production) and redeploying is the entire re-enable
 * procedure — no code change required.
 *
 * OUT OF SCOPE, deliberately: Supabase Auth email (signup confirmation,
 * recovery, email change — not in this repo's send path), the app-sent
 * password reset (`src/lib/auth/send-password-reset.ts`), owner-facing ops
 * mail whose only recipients come from `OPS_DIGEST_TO` /
 * `SUPER_ADMIN_USER_IDS` (`src/lib/admin/digest/transport.ts`), and — by
 * owner decision 2026-09-07 — every CRM outreach send path (batch send,
 * sequences, the Gmail-API transport, and the operator batch scripts). None
 * of those call this gate.
 *
 * See memory/features/email_outbound.md for the full on/off list.
 */

import { logEmailSuppressed } from '@/lib/admin-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';

/**
 * Reads `HELM_CUSTOMER_EMAIL_ENABLED`. Enabled ONLY for the exact string
 * `'true'` — unset, empty, `'TRUE'`, `'1'`, anything else is OFF. A strict
 * exact-match (not a truthy check) so a typo in Vercel env config fails
 * closed rather than silently re-enabling customer email.
 */
export function isCustomerEmailEnabled(): boolean {
  return process.env.HELM_CUSTOMER_EMAIL_ENABLED === 'true';
}

export interface GateContext {
  /** What kind of send this is, e.g. 'task_reminder', 'lifting_invite', 'coachhelm_v3'. */
  kind: string;
  /** How many recipients this attempt covers (1 for a single send). */
  recipientCount: number;
  /** Call-site identifier for the suppression log, e.g. a file/route name. */
  source: string;
}

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: 'customer_email_disabled' };

/**
 * Call before any Resend / fetch-to-Resend / Gmail-API customer send. When
 * customer email is disabled, records one throttled `admin_events` row
 * (severity info, event type `email.suppressed`, kind/source/recipientCount
 * only — no addresses) and returns the disallow result.
 *
 * Synchronous by design: the logging write is fire-and-forget so a Bridge
 * outage can never delay or block a caller deciding whether to send. Every
 * failure mode here (throttle bookkeeping, the admin-event write itself) is
 * swallowed — this gate must never throw.
 */
export function gateCustomerEmail(ctx: GateContext): GateResult {
  if (isCustomerEmailEnabled()) return { allowed: true };

  try {
    // Collapse repeated suppressions from the same (kind, source) pair into
    // one admin_events row per window — a fanned-out send (e.g. a team
    // announcement to 200 players) would otherwise write hundreds of
    // near-identical info rows for a single suppressed action.
    const throttleKey = `email.suppressed:${ctx.kind}:${ctx.source}`;
    if (shouldEmit(throttleKey)) {
      const collapsedCount = drainCollapsedCount(throttleKey);
      void logEmailSuppressed({
        kind: ctx.kind,
        source: ctx.source,
        recipientCount: ctx.recipientCount,
        collapsedCount,
      }).catch(() => {
        // Fail-open: a failed log write must never surface to the caller.
      });
    }
  } catch {
    // Fail-open: throttle/logging bookkeeping must never block the gate.
  }

  return { allowed: false, reason: 'customer_email_disabled' };
}
