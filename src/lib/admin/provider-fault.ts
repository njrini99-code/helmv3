/**
 * Provider faults — "the account behind an upstream service cannot serve this
 * request", as distinct from "our code is wrong".
 *
 * WHY THIS EXISTS. Over five days the Helm Bridge's single largest incident
 * source was one exhausted model account:
 *
 *   n=19  warning  chat/stream: model error — Your credit balance is too low to
 *                  access the Anthropic API. Please go to Plans & Billing…
 *   n=3   warning  compose() LLM call failed for task=round_review: Free tier
 *                  users do not have access to this model. Upgrade to…
 *   n=1   error    Free tier users do not have access to this model. Upgrade to
 *                  paid credits at https://vercel.com/d?to=%2F%5Bteam%5D…
 *   n=1   error    Couldn't read this image right now. Please try again in a
 *                  moment, or use the Paste Text option.
 *   n=1   warning  Failed to send coachhelm/round.submitted to Inngest…
 *
 * Every AI surface in the product was down for 33 hours and nobody topped the
 * account up, because of how those rows read rather than any missing signal:
 *
 *   - They arrived as five unrelated-looking incidents across three severities,
 *     so the outage never presented as one thing.
 *   - The 19 that mattered most were tiered 'warning', and the Bridge overview
 *     counts only error+critical — so the KPI that an operator watches stayed
 *     green while CoachHelm answered nothing.
 *   - Three call sites each carried their own regex for this class
 *     (`sanitiseStreamError`, `isModelAccessError`, and no check at all in
 *     compose()), so which wording a coach saw and which severity an operator
 *     saw depended on which feature they happened to touch.
 *
 * The fix is not to hide these — an exhausted account genuinely needs a human.
 * It is to make them arrive as ONE actionable incident that names the provider
 * and the remedy, tiered by whether a human must act, with Sentry skipped
 * because there is no code change that resolves a billing state.
 *
 * Dependency LEAF: no imports, safe from server-only modules and client
 * components alike.
 */

export type ProviderFaultKind =
  /** The account's balance/credit is spent. Retrying cannot succeed. */
  | 'credit_exhausted'
  /** The model exists but the account's plan may not call it. */
  | 'plan_gated_model'
  /** No credential configured for the provider in this environment. */
  | 'missing_credential'
  /** A credential is present and the provider rejected it. */
  | 'invalid_credential'
  /** Transient upstream throttling — self-healing, no operator needed. */
  | 'rate_limited';

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'vercel_ai_gateway'
  | 'inngest'
  | 'unknown';

export interface ProviderFault {
  kind: ProviderFaultKind;
  provider: ProviderId;
  /**
   * Stable `admin_events.error_code`. The incident signature is
   * (severity, errorCode, route, message prefix), so a fixed code is what
   * makes retries from one outage collapse into one row.
   */
  code: string;
  /**
   * One line, free of ids, URLs and counts: what is wrong and who fixes it.
   * Safe to show an end user — it deliberately contains no provider internals.
   */
  summary: string;
  /**
   * True when neither a retry nor a code change can help, only a human
   * changing the account. Drives severity: an operator-blocking fault is a
   * real outage ('error'); a rate limit is not ('warning').
   */
  needsOperator: boolean;
}

interface FaultRule {
  kind: ProviderFaultKind;
  pattern: RegExp;
}

/**
 * Ordered most-specific-first. `credit_exhausted` must precede
 * `plan_gated_model`: the Vercel AI Gateway's out-of-credit response is
 * literally "Free tier users do not have access to this model. Upgrade to paid
 * credits", which reads as a plan gate but is a spend state, and it is worded
 * the same whichever model you ask for.
 */
const FAULT_RULES: readonly FaultRule[] = [
  { kind: 'credit_exhausted', pattern: /credit balance is too low|insufficient[_ ]quota|out of credit|upgrade to paid credits|exceeded your current quota|billing hard limit/i },
  { kind: 'plan_gated_model', pattern: /free tier users do not have access|do not have access to this model|model_not_found|unknown model|does not exist or you do not have access/i },
  // "404 Event key not found" is what Inngest returns for a key that is set but
  // no longer valid — a rotated or wrong-environment key. It is an INVALID
  // credential, not a missing one: `isInngestConfigured()` sees the env var and
  // reports the integration as configured, so "missing" would send an operator
  // looking for an unset variable that is in fact set.
  { kind: 'invalid_credential', pattern: /invalid[_ ]api[_ ]key|incorrect api key|authentication[_ ]error|unauthorized.*api key|invalid signing key|signature verification failed|(?:event|signing|api) key not found/i },
  { kind: 'missing_credential', pattern: /no api key|api key (?:is )?(?:not set|missing)|missing (?:the )?(?:api|event|signing) key|(?:event|signing) key (?:is )?(?:not set|missing)|failed to find [a-z ]*key/i },
  { kind: 'rate_limited', pattern: /rate[_ ]limit|429|too many requests|overloaded_error|service is temporarily overloaded/i },
];

const PROVIDER_RULES: readonly { provider: ProviderId; pattern: RegExp }[] = [
  { provider: 'inngest', pattern: /inngest/i },
  { provider: 'vercel_ai_gateway', pattern: /vercel\.com|ai gateway|gateway(?:internalserver|authentication)?error/i },
  { provider: 'anthropic', pattern: /anthropic|claude|toolu_/i },
  { provider: 'openai', pattern: /openai|gpt-/i },
];

interface ProviderCopy {
  /** How to name the account an operator has to go and change. */
  account: string;
  /** What stops working while the fault lasts. */
  capability: string;
}

const PROVIDER_COPY: Record<ProviderId, ProviderCopy> = {
  anthropic: { account: 'the Anthropic account', capability: 'AI features' },
  openai: { account: 'the OpenAI account', capability: 'AI features' },
  vercel_ai_gateway: { account: 'the Vercel AI Gateway account', capability: 'AI features' },
  inngest: { account: 'the Inngest account', capability: 'Durable background jobs' },
  unknown: { account: 'the upstream provider account', capability: 'AI features' },
};

/**
 * Wording rules. These strings land in `admin_events.message` AND are shown to
 * end users, so they must (a) never contain an id, URL, model slug or count, or
 * the incident signature fragments per occurrence, and (b) say plainly whether
 * retrying is worth it — "try again in a moment" was actively misleading on an
 * exhausted account, where no amount of trying again would ever work.
 */
function summarise(kind: ProviderFaultKind, provider: ProviderId): string {
  const { account, capability } = PROVIDER_COPY[provider];
  switch (kind) {
    case 'credit_exhausted':
      return `${capability} are unavailable: ${account} is out of credit. Retrying will not help until it is topped up.`;
    case 'plan_gated_model':
      return `${capability} are unavailable: ${account} is not permitted to call the configured model. Retrying will not help until the plan or the model is changed.`;
    case 'invalid_credential':
      return `${capability} are unavailable: ${account} rejected the configured credential. It is set, but no longer valid — retrying will not help until the key is replaced.`;
    case 'missing_credential':
      return `${capability} are unavailable: no credential is configured for ${account} in this environment.`;
    case 'rate_limited':
      // "This clears on its own" USED TO BE STATED FLATLY HERE, and it is a
      // promise about the future that a 429 does not support. Providers return
      // 429 for a throttled-but-healthy account AND for one that has run out of
      // credit, and the two are indistinguishable without a message body.
      //
      // On 2026-08-07 at 17:39 a Guilford player retried a schedule-image
      // import three times in fifty seconds because this line told him to wait
      // it out. The Anthropic account had been out of credit since that morning,
      // so waiting could never have worked.
      //
      // The request-was-not-lost half is true and stays. The recovery promise
      // is replaced by the one thing that is honest in both cases.
      return `${account} is rate-limiting requests. The request was not lost. If it keeps happening, the account is more likely out of credit than merely busy.`;
  }
}

/**
 * Extract every string this error carries that a fault rule could match.
 *
 * WHY THIS IS BELT-AND-BRACES RATHER THAN ONE TIDY PATH. On 2026-07-29 a
 * production Inngest failure went unclassified even though its message matches
 * `invalid_credential` exactly:
 *
 *     admin_events.metadata.extra.stack:
 *       "Error: Inngest API Error: 404 Event key not found
 *            at a.getResponseError (…/chunks/22064.js:6:6199)"
 *     admin_events.metadata.errorCode: null      <- the classifier returned null
 *
 * The stack's first line proves `err instanceof Error` with that exact
 * `.message`, so the previous single-path implementation should have matched and
 * did not — reproduced against the deployed regex in node, where it DOES match.
 * That discrepancy is unexplained (see the test file for what was ruled out).
 *
 * So this deliberately stops depending on one extraction being right. It
 * concatenates every candidate source — name, message, cause (recursively, and
 * for object causes too), the stack, and a JSON view of own enumerable
 * properties. A rule can then match text carried by ANY of them.
 *
 * Concatenating cannot lose a match that previously succeeded: the old output is
 * a substring of the new one. It can only add matches. The one cost is that a
 * signature appearing anywhere in a long stack now counts — acceptable, because
 * every FAULT_RULES pattern is a provider-specific credential/quota phrase, not
 * a word that shows up incidentally in a file path.
 */
/**
 * ⚠️ THE STACK IS DELIBERATELY EXCLUDED FROM PROVIDER DETECTION.
 *
 * Caught by an existing test failing when the stack was first included
 * everywhere: a Vercel AI Gateway credit error came back
 * `provider: 'inngest'`. A stack is full of FILE PATHS, and this repo has
 * `src/lib/inngest/client.ts` — so `PROVIDER_RULES`' `/inngest/i`, which is
 * checked first, matched a path segment and mis-attributed the account an
 * operator would go and fix.
 *
 * The asymmetry is the point:
 *   - FAULT KIND is matched against everything including the stack. Every rule
 *     is a credential/quota phrase ("event key not found", "credit balance is
 *     too low") that does not occur in a path.
 *   - PROVIDER is matched against the message-ish text only. Provider names
 *     absolutely do occur in paths, and a wrong provider sends a human to the
 *     wrong dashboard.
 */
interface ErrorText {
  /** Everything, stack included — for matching the fault KIND. */
  full: string;
  /** Message-ish text only, no stack — for detecting the PROVIDER. */
  identifying: string;
}

function extractText(error: unknown): ErrorText {
  const parts: string[] = [];
  const identifying: string[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown, depth: number): void => {
    if (value == null || depth > 3) return;
    // Cyclic `cause` chains are rare but real, and this runs inside an error
    // handler where a second throw would lose the original failure entirely.
    if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
    }

    const add = (text: string, identifies: boolean): void => {
      parts.push(text);
      if (identifies) identifying.push(text);
    };

    if (typeof value === 'string') {
      add(value, true);
      return;
    }

    if (value instanceof Error) {
      add(value.name, true);
      add(value.message, true);
      // The stack's first line is `Name: message`, but providers that wrap a
      // fetch also leave the informative text further down it. Fault-kind only —
      // see the comment above ErrorText for why it must not identify a provider.
      if (typeof value.stack === 'string') add(value.stack, false);
      walk((value as { cause?: unknown }).cause, depth + 1);
      return;
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      // Named keys first, in the original order, so the common shapes read the
      // same way they always did.
      for (const key of ['message', 'error', 'detail', 'type', 'code', 'body', 'statusText']) {
        const v = record[key];
        if (typeof v === 'string') add(v, true);
        else if (typeof v === 'number') add(String(v), true);
      }
      // Then the nested containers providers actually use — `{response:{...}}`
      // and `{data:{...}}` both returned an EMPTY string before this change.
      walk(record.cause, depth + 1);
      walk(record.response, depth + 1);
      walk(record.data, depth + 1);
      // Finally a JSON view, so a shape nobody anticipated still contributes its
      // text instead of classifying as "not a provider fault". Excluded from
      // provider identification: a serialized object can contain a `stack` field
      // and so drag paths back in through the side door.
      try {
        const json = JSON.stringify(value);
        if (json && json !== '{}') add(json, false);
      } catch {
        // circular or BigInt — the named keys above already contributed.
      }
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      add(String(value), true);
    }
  };

  walk(error, 0);
  return {
    full: parts.filter(Boolean).join(' '),
    identifying: identifying.filter(Boolean).join(' '),
  };
}

function detectProvider(text: string): ProviderId {
  for (const rule of PROVIDER_RULES) {
    if (rule.pattern.test(text)) return rule.provider;
  }
  return 'unknown';
}

/**
 * Classify an upstream failure as a provider/account fault, or return null when
 * it is anything else (a schema violation, our own bug, a network blip).
 *
 * Accepts an `Error`, a string, or a provider's raw JSON error object, because
 * the AI SDK's `onError` hands over whatever the transport produced.
 */
export function classifyProviderFault(error: unknown): ProviderFault | null {
  const { full, identifying } = extractText(error);
  if (!full.trim()) return null;

  for (const rule of FAULT_RULES) {
    if (!rule.pattern.test(full)) continue;
    // `identifying` deliberately excludes stacks and serialized blobs — a file
    // path must never decide which account a human is sent to. Falls back to
    // `full` only when there is no message-ish text at all, which is better than
    // reporting `unknown` and naming no account.
    const provider = detectProvider(identifying.trim() ? identifying : full);
    return {
      kind: rule.kind,
      provider,
      // Provider is part of the stable identity: an Anthropic rate limit and
      // an Inngest rate limit require different owners and remedies.
      code: `provider_${provider}_${rule.kind}`,
      summary: summarise(rule.kind, provider),
      needsOperator: rule.kind !== 'rate_limited',
    };
  }
  return null;
}

/**
 * Severity for a provider fault.
 *
 * An operator-blocking fault takes a whole capability offline until a human
 * changes the account, which is what 'error' is for — this is the tier the
 * exhausted-credit outage needed and did not get. A rate limit resolves
 * itself, so it stays a 'warning'.
 *
 * `skipSentry` is always true: Sentry exists to surface defects to engineers,
 * and no code change resolves any of these. The Bridge is the right and only
 * destination.
 */
export function providerFaultSeverity(
  fault: ProviderFault,
): { severity: 'warning' | 'error'; skipSentry: true } {
  return { severity: fault.needsOperator ? 'error' : 'warning', skipSentry: true };
}

/**
 * Kinds that ONLY a human can clear — a top-up, a rotated key, a plan change.
 * No deploy fixes any of these, and no amount of waiting does either.
 */
const OPERATOR_GATED_KINDS: ProviderFaultKind[] = [
  'credit_exhausted',
  'invalid_credential',
  'missing_credential',
  'plan_gated_model',
];

/**
 * Does this stored `error_code` describe a fault only an operator can clear?
 *
 * Reads the code back off a persisted row (`provider_<provider>_<kind>`) rather
 * than a live ProviderFault, because that is all the auto-resolver has.
 * Provider ids themselves contain underscores (`vercel_ai_gateway`), so match
 * on the kind SUFFIX rather than splitting on '_'.
 *
 * Why it exists: release-based auto-resolution assumes "stopped firing after a
 * deploy ⇒ the deploy fixed it". True for a code defect, false for a dead
 * credential — a provider fault only fires when something happens to exercise
 * that path, so a quiet weekend looks identical to a fix. In production every
 * one of these was auto-resolved while still broken: Inngest sat closed-but-dead
 * for 10 days, and both AI accounts were marked resolved while still out of
 * credit (verified 2026-08-06).
 */
export function isOperatorGatedFaultCode(errorCode: string | null | undefined): boolean {
  if (!errorCode || !errorCode.startsWith('provider_')) return false;
  return OPERATOR_GATED_KINDS.some((kind) => errorCode.endsWith(`_${kind}`));
}
