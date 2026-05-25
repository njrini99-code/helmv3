/**
 * v3 feature-flag provider — GrowthBook.
 *
 * Per Part XXVIII locked decision: GrowthBook with per-coach granularity.
 * Server-side flag evaluation (no client SDK). The client never sees
 * which flags are on for which coach — flags are evaluated server-side
 * during data assembly, then their effects ship as plain data.
 *
 * v3 flag use-cases (initial — will grow):
 *   - W30+ `llm_narrative` rollout per coach (gates LLM compose paths)
 *   - W37   weekly-email A/B (which template variant lands)
 *   - W38   practice-rx model variant (which prompt template runs)
 *   - W42   notification category defaults (per-cohort overrides)
 *
 * Env vars (added to .env.example in W9-pt3):
 *   - GROWTHBOOK_API_HOST      (e.g. https://cdn.growthbook.io)
 *   - GROWTHBOOK_CLIENT_KEY    (SDK-specific public key)
 *
 * Returns `null` from `getFlagsClient()` when env vars are missing so
 * dev / preview environments degrade gracefully (all flags = default).
 */

import { GrowthBook } from '@growthbook/growthbook';

const GROWTHBOOK_API_HOST = process.env.GROWTHBOOK_API_HOST;
const GROWTHBOOK_CLIENT_KEY = process.env.GROWTHBOOK_CLIENT_KEY;

/** Identity attributes used for flag bucketing. Add fields as use-cases grow. */
export interface FlagAttributes {
  /** Coach ID (primary bucketing unit for v3). */
  coach_id?: string;
  /** Player ID (secondary — used for player-side LLM gating). */
  player_id?: string;
  /** Team ID (cohort-level overrides). */
  team_id?: string;
  /** Organization ID (org-wide killswitches). */
  organization_id?: string;
  /** Deployment env (production / preview / development). */
  deployment_env?: string;
}

/**
 * Lazy-create a GrowthBook instance scoped to the given attributes.
 * Each request gets its own instance — GrowthBook is cheap to construct
 * and instances aren't safely shareable across requests with mutating
 * attributes.
 *
 * Returns null when env vars are missing. Callers should treat null as
 * "all flags = default value" so dev / preview deploys behave
 * predictably without remote config.
 */
export async function getFlagsClient(
  attributes: FlagAttributes,
): Promise<GrowthBook | null> {
  if (!GROWTHBOOK_API_HOST || !GROWTHBOOK_CLIENT_KEY) return null;

  const gb = new GrowthBook({
    apiHost: GROWTHBOOK_API_HOST,
    clientKey: GROWTHBOOK_CLIENT_KEY,
    attributes,
    enableDevMode: process.env.NODE_ENV !== 'production',
  });

  try {
    await gb.loadFeatures({ timeout: 2000 });
  } catch {
    // If GrowthBook is slow or down, fall through to default-value
    // evaluation. The instance still returns defaults via isOn / getValue.
  }

  return gb;
}

/**
 * Evaluate a single boolean flag for the given attributes. Returns the
 * default value when GrowthBook isn't configured or the flag is unknown.
 *
 * @param flagKey      GrowthBook feature key (e.g. "llm_narrative_v1")
 * @param attributes   Identity attributes for bucketing
 * @param defaultValue Value returned when flags are unavailable
 */
export async function isFlagOn(
  flagKey: string,
  attributes: FlagAttributes,
  defaultValue = false,
): Promise<boolean> {
  const gb = await getFlagsClient(attributes);
  if (!gb) return defaultValue;
  try {
    const result = gb.isOn(flagKey);
    gb.destroy();
    return result;
  } catch {
    return defaultValue;
  }
}

/**
 * Evaluate a single value flag (string / number / object). Returns
 * `defaultValue` when GrowthBook isn't configured.
 */
export async function getFlagValue<T>(
  flagKey: string,
  attributes: FlagAttributes,
  defaultValue: T,
): Promise<T> {
  const gb = await getFlagsClient(attributes);
  if (!gb) return defaultValue;
  try {
    // GrowthBook's getFeatureValue returns WidenPrimitives<T>; the value is
    // safe to narrow back to T because we passed defaultValue: T as the
    // fallback. Cast through unknown to satisfy TS's strict inference.
    const result = gb.getFeatureValue(flagKey, defaultValue) as unknown as T;
    gb.destroy();
    return result;
  } catch {
    return defaultValue;
  }
}
