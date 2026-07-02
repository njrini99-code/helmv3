// =============================================================================
// src/components/baseball/performance/lift-onboarding/onboarding-storage.ts
//
// localStorage fallback for "has this athlete completed the Lift Lab
// first-run tour" — the durable onboarded_at column
// (supabase/migrations/20260702120000_baseball_helm_lifting_athletes_onboarded_at.sql)
// is db_gated (NOT applied), so until it ships this file IS the source of
// truth for "never shown again once completed" on THIS device/browser.
//
// Scoped per-athlete-id (not a single global flag) so a shared/borrowed
// device that later signs in as a different athlete still sees the tour.
// All reads/writes are best-effort: private browsing / storage-disabled
// environments degrade to "not onboarded yet" (shows the tour again) rather
// than throwing — never blocks the app.
// =============================================================================

const STORAGE_PREFIX = 'helm.baseball.liftlab.onboarded.v1';

function storageKey(athleteId: string): string {
  return `${STORAGE_PREFIX}:${athleteId}`;
}

/** True when this athlete has already dismissed/completed the tour on this device. */
export function readLiftOnboardingFlag(athleteId: string | null): boolean {
  if (!athleteId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(athleteId)) === '1';
  } catch {
    return false;
  }
}

/** Best-effort — marks the tour complete for this athlete on this device. */
export function writeLiftOnboardingFlag(athleteId: string | null): void {
  if (!athleteId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(athleteId), '1');
  } catch {
    // Storage disabled/full — the tour may show again next visit, which is
    // a minor UX cost, never a functional break.
  }
}
