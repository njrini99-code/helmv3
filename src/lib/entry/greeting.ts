/**
 * Time-aware greeting + remembered-visitor personalization for the Entry
 * World scenes (docs/baseball/ENTRY_SCENES_DESIGN.md family rule #6:
 * "Time-aware personalization"). Shared by every `src/app/baseball/(auth)/`
 * page via `BaseballAuthShell` — plain functions, no React/'use client'
 * needed (mirrors `src/lib/utils/capacitor.ts`'s `typeof window` guards so
 * it's safe to import from server or client code).
 *
 * Personalization is entirely optional/best-effort: every read is wrapped
 * so a private-browsing/storage-disabled visitor just sees the time-of-day
 * greeting with no first name, never a thrown error.
 */

const LAST_FIRST_NAME_KEY = 'helm:lastFirstName';

export type SceneVariant = 'dawn' | 'dusk';

/**
 * Local-hour → scene variant. Dawn: 5am–11:59am. Dusk: everything else
 * (afternoon/evening/night). The Yard's primary mood is dusk, the Iron
 * Room's is dawn — both scenes accept either variant (spec: "two
 * sky-gradient states, subtle").
 */
function variantFromHour(hour: number): SceneVariant {
  return hour >= 5 && hour < 12 ? 'dawn' : 'dusk';
}

/**
 * Reads the `?scene-variant=dawn|dusk` dev override from the current URL.
 * Uses plain `window.location.search` rather than `useSearchParams()` so
 * callers don't inherit its Suspense-boundary requirement.
 */
function sceneVariantOverride(): SceneVariant | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('scene-variant');
  return value === 'dawn' || value === 'dusk' ? value : null;
}

/** Resolves the active scene variant: URL override wins, else the local clock. */
export function resolveSceneVariant(date: Date = new Date()): SceneVariant {
  return sceneVariantOverride() ?? variantFromHour(date.getHours());
}

/** Safe localStorage read — SSR-safe, and swallows private-browsing throws. */
export function getRememberedFirstName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_FIRST_NAME_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Writes the remembered first name. Called ONLY from the login page's
 * success path (`src/app/baseball/(auth)/login/page.tsx`, on the Supabase
 * `SIGNED_IN` auth event) — never from signup/forgot/reset, so those flows
 * stay byte-identical.
 */
export function setRememberedFirstName(firstName: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = firstName.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(LAST_FIRST_NAME_KEY, trimmed);
  } catch {
    // Private browsing / storage disabled — personalization is optional, never fatal.
  }
}

/**
 * Time-of-day greeting, personalized with a remembered first name when
 * known (family rule #6: "'Good morning' / 'Good evening' + remembered
 * first name via localStorage: 'Welcome back, Nick'").
 */
export function getGreeting(firstName: string | null, date: Date = new Date()): string {
  if (firstName) return `Welcome back, ${firstName}.`;
  const hour = date.getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}
