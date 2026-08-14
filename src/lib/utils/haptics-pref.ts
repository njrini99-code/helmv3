/**
 * ============================================================================
 * Haptics on/off — the single source of truth
 * ----------------------------------------------------------------------------
 * This lives in its own leaf module ON PURPOSE. Two layers need to read the
 * preference and they already point at each other:
 *
 *     lib/fairway/haptics.ts  ──imports triggerHaptic──▶  lib/utils/capacitor.ts
 *
 * Putting the preference in either one and importing it from the other closes
 * a cycle. This module imports nothing, so both can depend on it safely.
 *
 * WHY THE GATE MOVED DOWN. The preference used to be private to
 * lib/fairway/haptics.ts, which meant it only governed the 13 call sites using
 * `fwHaptic`. The other 164 sites call `triggerHaptic` from capacitor.ts
 * directly and bypassed it entirely — so a user who switched haptics off would
 * still have felt roughly 93% of them. A switch that silences 13 of 177 things
 * is not an off switch. The gate now sits at the bottom layer that every path
 * funnels through.
 * ========================================================================== */

const PREF_KEY = 'helm-haptics-enabled';

/** Cached so a drag handler firing 60x/sec doesn't hit localStorage each time. */
let prefCache: boolean | null = null;

/**
 * Default ON. iOS already honours the system-wide haptics switch, so this is a
 * narrower per-app opt-out layered on top of it — defaulting off would silence
 * the app for people who never asked for that.
 */
export function areHapticsEnabled(): boolean {
  if (prefCache !== null) return prefCache;
  if (typeof window === 'undefined') return true;
  try {
    prefCache = window.localStorage.getItem(PREF_KEY) !== 'false';
  } catch {
    // Private browsing / storage disabled — fail to the default rather than
    // throwing inside a tap handler.
    prefCache = true;
  }
  return prefCache;
}

export function setHapticsEnabled(enabled: boolean): void {
  prefCache = enabled;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // Storage unavailable — the in-memory cache still applies for this session,
    // so the toggle works now even if it won't survive a reload.
  }
}

/** TEST-ONLY. Module-scoped cache outlives a single test otherwise. */
export function __resetHapticsPrefCache(): void {
  prefCache = null;
}
