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
      return `${account} is rate-limiting requests. This clears on its own; the request was not lost.`;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Providers routinely nest the informative text one level down (the AI SDK
    // wraps gateway responses, Inngest wraps fetch failures), and the outer
    // message can be as bare as "Bad Request".
    const cause = (error as { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
    return `${error.name} ${error.message} ${causeText}`;
  }
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = ['message', 'error', 'detail', 'type', 'code']
      .map((key) => (typeof record[key] === 'string' ? (record[key] as string) : ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  return '';
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
  const text = messageOf(error);
  if (!text.trim()) return null;

  for (const rule of FAULT_RULES) {
    if (!rule.pattern.test(text)) continue;
    const provider = detectProvider(text);
    return {
      kind: rule.kind,
      provider,
      code: `provider_${rule.kind}`,
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
