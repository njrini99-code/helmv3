/**
 * One place that decides WHICH ACCOUNT an LLM call bills.
 *
 * The AI SDK accepts either a provider object or a bare `'provider/model'`
 * string. Those are not two spellings of the same thing — they are two
 * different accounts:
 *
 *   anthropic('claude-sonnet-5')      -> ANTHROPIC_API_KEY, billed to Anthropic
 *   'anthropic/claude-sonnet-5'       -> Vercel AI Gateway. With no
 *                                        AI_GATEWAY_API_KEY set it authenticates
 *                                        with the project's OIDC token and bills
 *                                        the VERCEL TEAM balance.
 *
 * Until 2026-08-13 that choice was made independently at each call site, and
 * only one of the three made it correctly:
 *
 *   chat/stream/route.ts   had the branch      -> coach chat kept working
 *   v3/llm/compose.ts      passed the string   -> every round review served
 *                                                 its template from 07-29
 *   golf/schedule-vision.ts passed the string  -> every class-schedule import
 *                                                 failed
 *
 * The Vercel gateway account was on the free tier and answered all three with
 * "Free tier users do not have access to this model. Upgrade to paid credits".
 * Because coach chat was healthy the whole time, the platform looked fine, and
 * topping up the ANTHROPIC console — the obvious response to an out-of-credit
 * message — changed nothing for the two paths that were actually failing.
 *
 * Hence one exported function rather than a third copy of the same three lines.
 * A new call site that forgets to use it regresses only itself; a new call site
 * that uses it cannot pick the wrong account.
 */

import { anthropic } from '@ai-sdk/anthropic';

const ANTHROPIC_PREFIX = 'anthropic/';

/**
 * Resolve a gateway-style model id to the provider that should serve it.
 *
 * Returns the direct Anthropic provider when `ANTHROPIC_API_KEY` is configured
 * and the id names an Anthropic model; otherwise returns `modelId` unchanged so
 * the call routes through the gateway exactly as before. Both are valid
 * `model` arguments to `generateText` / `generateObject` / `streamText`.
 *
 * IMPORTANT — pass the ORIGINAL `modelId`, not this return value, to anything
 * that prices, budgets or logs the call. Cost tables and spend ledgers in this
 * repo are keyed by the gateway-prefixed id, and an unrecognised key falls to a
 * conservative worst-case rate (15x the real Haiku rate in
 * `MODEL_COST_USD_PER_MTOK`). Only the object handed to the AI SDK should
 * change.
 */
export function resolveModelProvider(modelId: string): ReturnType<typeof anthropic> | string {
  // Trimmed, not just truthy. `vercel env pull` writes masked or empty values
  // for sensitive vars, so a blank-but-present ANTHROPIC_API_KEY is a realistic
  // local state — and picking the direct provider on one turns every call into
  // an auth error instead of degrading to the gateway, which is the whole point
  // of having two accounts.
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (key && modelId.startsWith(ANTHROPIC_PREFIX)) {
    return anthropic(modelId.slice(ANTHROPIC_PREFIX.length));
  }
  return modelId;
}
