import { classifyCredential } from '@/lib/admin/credential-shape.mjs';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import { scheduleBridgeWrite } from '@/lib/admin/schedule-bridge-write';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Inngest credential STATE, and the Bridge row a bad state produces.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * A MISMATCHED signing key was diagnosed carefully (src/app/api/inngest/
 * route.ts measures clock skew against key mismatch and writes an
 * `admin_events` row saying which). A MISSING one was invisible. With
 * `INNGEST_SIGNING_KEY` absent:
 *
 *   - the SDK `console.error`s "In cloud mode but no signing key found" and
 *     returns 500 to Inngest Cloud — that line reached Sentry (4 events on
 *     release fb425aa2b after the 2026-09-01 14:31Z deploy, via
 *     captureConsoleIntegration) and `admin_events` got NOTHING;
 *   - `isInngestConfigured()` returned false, so every round submit skipped
 *     the durable path and ran inline, silently;
 *   - the `integrations` feature has no heartbeat on purpose (silence between
 *     a Monday cron and a round submit is normal), so it could not go red.
 *
 * "Only genuine failures are reported, never unconfigured" is the right rule
 * for an OPTIONAL Bridge integration (integration-health.ts: a missing Vercel
 * token degrades one panel). It is the wrong rule here. In production Inngest
 * is not optional: round analysis, reminders and the reliability automation
 * depend on it, and the send path degrades without a trace. So in production
 * an absent or unusable Inngest credential IS a fault, and it is written down.
 *
 * Reported once per process per 60s (`emit-throttle`) and absorbed into the
 * open row across processes (`durable-collapse`, keyed on the `provider_`
 * code) so a cold start per lambda cannot flood the queue. Feature
 * `integrations`, code `provider_inngest_missing_credential`, which
 * `incident-classification` maps to `integration` (actionable) and
 * `buildIncidentSignature` folds into one incident across every trigger.
 *
 * The message names VARIABLES, never values.
 */

export type InngestCredentialStatus = 'ok' | 'missing' | 'placeholder' | 'malformed';

export interface InngestCredentialState {
  signingKey: InngestCredentialStatus;
  eventKey: InngestCredentialStatus;
  /** Both usable — the only state in which durable delivery can work end to end. */
  usable: boolean;
}

export type InngestCredentialTrigger = 'startup' | 'send' | 'inbound';

/** `process.env`, or a test's stand-in. Plain record on purpose: this repo's
 *  `NodeJS.ProcessEnv` augmentation requires NODE_ENV, which a fixture should
 *  not have to carry. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export const INNGEST_MISSING_CREDENTIAL_CODE = 'provider_inngest_missing_credential';

export function inngestCredentialState(env: EnvLike = process.env): InngestCredentialState {
  const signingKey = classifyCredential('inngest_signing_key', env.INNGEST_SIGNING_KEY);
  const eventKey = classifyCredential('inngest_event_key', env.INNGEST_EVENT_KEY);
  return { signingKey, eventKey, usable: signingKey === 'ok' && eventKey === 'ok' };
}

/** One clause per faulty variable. Empty when both are usable. */
export function describeInngestCredentialFault(state: InngestCredentialState): string[] {
  const clauses: string[] = [];
  if (state.signingKey !== 'ok') clauses.push(`INNGEST_SIGNING_KEY is ${state.signingKey}`);
  if (state.eventKey !== 'ok') clauses.push(`INNGEST_EVENT_KEY is ${state.eventKey}`);
  return clauses;
}

const TRIGGER_COPY: Record<InngestCredentialTrigger, string> = {
  startup: 'Detected at process start.',
  send: 'Detected when a caller asked whether to send an event durably — it will run inline instead, with no retry and no crash recovery.',
  inbound: 'Detected when Inngest Cloud called /api/inngest with a signed request — the SDK answers 500 and the function does not execute.',
};

function isProductionRuntime(env: EnvLike): boolean {
  return env.VERCEL_ENV === 'production';
}

/**
 * Write the Bridge row for an unusable credential state. Production only —
 * preview and local runs opt out of Inngest legitimately. Throttled, durable,
 * scheduled past the response when a request scope exists (awaited under a
 * bound otherwise). Resolves `true` when a write was scheduled/awaited.
 * Never throws.
 */
export async function reportInngestCredentialFault(
  trigger: InngestCredentialTrigger,
  env: EnvLike = process.env,
): Promise<boolean> {
  try {
    if (!isProductionRuntime(env)) return false;
    const state = inngestCredentialState(env);
    if (state.usable) return false;

    const throttleKey = 'integration:inngest:missing_credential';
    if (!shouldEmit(throttleKey)) return false;
    const collapsed = drainCollapsedCount(throttleKey);

    const clauses = describeInngestCredentialFault(state).join('; ');
    await scheduleBridgeWrite(() =>
      logServerError(
        `[inngest] Durable background jobs are OFF in production: ${clauses}. ` +
          'Every round submit runs its analysis inline, and scheduled reminders, coach insights and the ' +
          'reliability automation do not run at all. Fix: copy the CURRENT event + signing keys from ' +
          'app.inngest.com into Vercel Production (or let the Inngest<->Vercel integration manage them), then ' +
          'REDEPLOY — Vercel bakes env vars in at build time. Verify with `node scripts/inngest-health-check.mjs`.',
        {
          action: `inngest.credentials.${trigger}`,
          source: 'integrity',
          feature: 'integrations',
          sport: 'shared',
          errorCode: INNGEST_MISSING_CREDENTIAL_CODE,
          errorHint: TRIGGER_COPY[trigger],
          // Sentry already has the SDK's own console.error for this; the
          // Bridge is the destination that was missing.
          skipSentry: true,
          handled: true,
          extra: { signingKey: state.signingKey, eventKey: state.eventKey, trigger },
          ...(collapsed > 0 ? { metadata: { collapsed_count: collapsed } } : {}),
        },
        'error',
      ),
    );
    return true;
  } catch {
    return false;
  }
}
