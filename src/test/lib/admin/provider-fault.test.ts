/**
 * The five-day Helm Bridge window this pins down.
 *
 * One exhausted model account produced the single largest block of incidents in
 * the feed, spread across five differently-worded rows and three severities:
 *
 *   n=19  warning  chat/stream: model error — Your credit balance is too low…
 *   n=3   warning  compose() LLM call failed for task=round_review: Free tier…
 *   n=1   error    Free tier users do not have access to this model. Upgrade…
 *   n=1   error    Couldn't read this image right now. Please try again in a moment…
 *   n=1   warning  Failed to send coachhelm/round.submitted to Inngest: 404 Event key not found
 *
 * Nothing was topped up for 33 hours. These assertions cover the three
 * properties that failure depended on: the class is recognised at all, the
 * message it produces is stable enough to group, and an operator-blocking fault
 * is not filed at the same tier as a self-healing rate limit.
 */

import { describe, it, expect } from 'vitest';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';

/** Verbatim provider text, as it reached admin_events. */
const REAL_MESSAGES = {
  anthropicCredit:
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
  gatewayFreeTier:
    'Free tier users do not have access to this model. Upgrade to paid credits at https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys',
  inngestKey: 'Inngest API Error: 404 Event key not found',
};

describe('classifyProviderFault', () => {
  it('recognises an exhausted Anthropic balance as an operator-blocking fault', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.anthropicCredit));
    expect(fault).not.toBeNull();
    expect(fault!.kind).toBe('credit_exhausted');
    expect(fault!.provider).toBe('anthropic');
    expect(fault!.code).toBe('provider_anthropic_credit_exhausted');
    expect(fault!.needsOperator).toBe(true);
  });

  /**
   * The gateway's out-of-credit response is worded as a plan gate ("Free tier
   * users do not have access to this model"), and it says that whichever model
   * you ask for. Order in FAULT_RULES is what keeps it out of the
   * plan_gated_model bucket, so pin the order, not just the match.
   */
  it('reads the gateway\'s "free tier" wording as a spend state, not a model gate', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.gatewayFreeTier));
    expect(fault!.kind).toBe('credit_exhausted');
    expect(fault!.provider).toBe('vercel_ai_gateway');
  });

  /**
   * `isInngestConfigured()` returns true for a rotated key, so telling an
   * operator the credential is MISSING would send them hunting for an env var
   * that is present. It has to classify as invalid.
   */
  it('classifies a rotated Inngest event key as invalid, not missing', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.inngestKey));
    expect(fault!.kind).toBe('invalid_credential');
    expect(fault!.provider).toBe('inngest');
    expect(fault!.code).toBe('provider_inngest_invalid_credential');
    expect(fault!.summary).toContain('Durable background jobs');
    expect(fault!.summary).toContain('set, but no longer valid');
  });

  it('treats a rate limit as transient — no operator, lower tier', () => {
    const fault = classifyProviderFault(new Error('429 Too Many Requests'));
    expect(fault!.kind).toBe('rate_limited');
    expect(fault!.needsOperator).toBe(false);
    expect(providerFaultSeverity(fault!).severity).toBe('warning');
  });

  it('tiers an operator-blocking fault as an outage, and never sends it to Sentry', () => {
    for (const text of Object.values(REAL_MESSAGES)) {
      const fault = classifyProviderFault(new Error(text))!;
      const { severity, skipSentry } = providerFaultSeverity(fault);
      expect(severity).toBe('error');
      // No code change resolves a billing state — Sentry is the wrong destination.
      expect(skipSentry).toBe(true);
    }
  });

  /**
   * The summary is written into `admin_events.message`, which is what the
   * incident signature hashes. A billing URL or model slug in there mints a new
   * incident group per occurrence — the exact failure being fixed.
   */
  it('produces a message with no ids, URLs or counts in it', () => {
    for (const text of Object.values(REAL_MESSAGES)) {
      const { summary } = classifyProviderFault(new Error(text))!;
      expect(summary).not.toMatch(/https?:\/\//);
      expect(summary).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(summary).not.toMatch(/\d{3,}/);
    }
  });

  it('reads the informative text out of a nested cause and a raw provider object', () => {
    const wrapped = new Error('Bad Request');
    (wrapped as { cause?: unknown }).cause = new Error(REAL_MESSAGES.anthropicCredit);
    expect(classifyProviderFault(wrapped)!.kind).toBe('credit_exhausted');

    // The AI SDK's onError hands over whatever the transport produced, which is
    // often the provider's parsed JSON body rather than an Error.
    expect(
      classifyProviderFault({ type: 'invalid_request_error', message: REAL_MESSAGES.anthropicCredit })!.kind,
    ).toBe('credit_exhausted');
  });

  /**
   * 2026-07-29. The Inngest key fault above is asserted from `new Error(msg)`
   * and passes — yet the SAME failure reached production unclassified:
   *
   *   admin_events.metadata.extra.stack:
   *     "Error: Inngest API Error: 404 Event key not found
   *          at a.getResponseError (…/chunks/22064.js:6:6199)"
   *   admin_events.metadata.errorCode: null   <- classifier returned null
   *   message: "…falling back to direct postRoundTrigger: Inngest API Error:
   *             404 Event key not found"      <- the fault==null branch
   *
   * Three daily occurrences (07-27, 07-28, 07-29), the last of them AFTER the
   * 18:37Z deploy of the commit containing this classifier.
   *
   * RULED OUT, each by checking rather than reasoning:
   *   - the pattern not matching the text (tested in node against the DEPLOYED
   *     regex, extracted from `git show <sha>`: it matches);
   *   - the classifier not being in the deployed build (`git show` confirms the
   *     file and both `key not found` clauses are present);
   *   - the call site not invoking it (present in the deployed golf.ts);
   *   - `messageOf` losing an Error's `.message` (the stack's first line proves
   *     the shape is a plain Error carrying the full text).
   *
   * STILL UNEXPLAINED. So `messageOf` was widened to stop depending on any one
   * extraction being the right one, and these cases pin the shapes it previously
   * returned an EMPTY STRING for — each of which classified as "not a provider
   * fault" and would have produced exactly the symptom observed.
   */
  it('classifies provider faults out of shapes that previously extracted nothing', () => {
    // Verified against the pre-change implementation: each of these produced ''
    // from messageOf and therefore classifyProviderFault(...) === null.
    const previouslyBlind: unknown[] = [
      { response: { message: REAL_MESSAGES.inngestKey } },
      { data: { error: REAL_MESSAGES.inngestKey } },
      { status: 404, body: 'Event key not found' },
      Object.assign(new Error('Inngest API Error'), { cause: { message: '404 Event key not found' } }),
    ];

    for (const shape of previouslyBlind) {
      const fault = classifyProviderFault(shape);
      expect(fault, `should classify: ${JSON.stringify(shape)}`).not.toBeNull();
      expect(fault!.kind).toBe('invalid_credential');
    }
  });

  /**
   * The stack rescues the KIND but deliberately cannot name the PROVIDER, and
   * this asserts that asymmetry rather than papering over it.
   *
   * My first version of this test expected `provider: 'inngest'` and failed. The
   * code was right and the expectation was wrong: stacks are excluded from
   * provider detection on purpose, because they are full of file paths and this
   * repo has `src/lib/inngest/client.ts`. Allowing the stack to identify a
   * provider is exactly what made a Vercel AI Gateway credit error report
   * `provider: 'inngest'` — caught by the pre-existing gateway test.
   *
   * So the honest contract is: signature-in-stack-only gets you a correctly
   * classified, correctly tiered, operator-blocking fault whose account is
   * reported as generic. Better than silence, worse than a named account, and
   * far better than confidently naming the WRONG account.
   */
  it('rescues the fault KIND from a stack trace, but will not name a provider from it', () => {
    // The exact production stack, first line included, with the outer message
    // emptied so the stack is the only carrier.
    const bare = new Error('');
    bare.stack = [
      'Error: Inngest API Error: 404 Event key not found',
      '    at a.getResponseError (/var/task/.next/server/chunks/22064.js:6:6199)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)',
    ].join('\n');

    const fault = classifyProviderFault(bare);
    expect(fault).not.toBeNull();
    expect(fault!.kind).toBe('invalid_credential');
    expect(fault!.needsOperator).toBe(true);
    expect(fault!.provider).toBe('unknown');
  });

  it('will not let a file path in a stack decide which account is at fault', () => {
    // The regression the pre-existing gateway test caught. A path segment naming
    // one provider must not override the message naming another.
    const err = new Error(REAL_MESSAGES.anthropicCredit);
    err.stack = [
      `Error: ${REAL_MESSAGES.anthropicCredit}`,
      '    at sendEvent (/var/task/src/lib/inngest/client.js:12:9)',
    ].join('\n');

    const fault = classifyProviderFault(err);
    expect(fault!.kind).toBe('credit_exhausted');
    expect(fault!.provider).toBe('anthropic');
  });

  it('is cycle-safe — a self-referencing cause must not throw inside an error handler', () => {
    // This runs in a catch block. A second throw here loses the original
    // failure entirely, which is strictly worse than failing to classify.
    const a = new Error('Inngest API Error: 404 Event key not found');
    const b = new Error('wrapper');
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;

    expect(() => classifyProviderFault(b)).not.toThrow();
    expect(classifyProviderFault(b)!.kind).toBe('invalid_credential');
  });

  it('leaves everything that is not a provider/account fault alone', () => {
    for (const notAFault of [
      new Error('new row violates row-level security policy for table "golf_conversations"'),
      new Error('canceling statement due to statement timeout'),
      new Error("Cannot read properties of undefined (reading 'id')"),
      'No active team membership for player',
      null,
      undefined,
      {},
      '',
    ]) {
      expect(classifyProviderFault(notAFault)).toBeNull();
    }
  });
});

describe('rate_limited copy does not promise recovery it cannot know', () => {
  /**
   * A 429 means "throttled" OR "out of credit" — providers use it for both, and
   * without a message body the two are indistinguishable. The copy used to say
   * flatly "This clears on its own", and on 2026-08-07 at 17:39 a Guilford
   * player retried a schedule-image import three times in fifty seconds on the
   * strength of it. The Anthropic account had been out of credit since that
   * morning, so waiting could never have worked.
   */
  it('never tells the user it will clear on its own', () => {
    const fault = classifyProviderFault(new Error('Request failed with status 429'));

    expect(fault?.kind).toBe('rate_limited');
    expect(fault?.summary).not.toMatch(/clears on its own/i);
  });

  it('still says the request was not lost, and names out-of-credit as the likelier cause', () => {
    const fault = classifyProviderFault(new Error('rate limit exceeded'));

    expect(fault?.summary).toMatch(/was not lost/i);
    expect(fault?.summary).toMatch(/out of credit/i);
  });

  it('an explicit out-of-credit error still classifies as credit_exhausted, not rate_limited', () => {
    const fault = classifyProviderFault(new Error('Your credit balance is too low to access the API'));

    expect(fault?.kind).toBe('credit_exhausted');
    expect(fault?.summary).toMatch(/retrying will not help/i);
  });
});
