/**
 * Typed access to the boot-installed recovery coordinator.
 *
 * The coordinator itself is the string in `boot-recovery-source.ts`, run
 * before interactive. Nothing else in the app may call `location.reload()`
 * or `location.replace()` for a stale asset — route through `requestRecovery`
 * so there is one budget, one latch and one work-state check.
 *
 * If the boot script did not run, every call reports `unavailable` and no
 * navigation happens. That is the correct failure direction: a recovery that
 * silently does not fire costs a manual refresh, and one that fires over
 * unsaved work costs the work.
 */

export type RecoveryWorkState = 'clean' | 'dirty' | 'unknown';

export type RecoveryStatus =
  /** Claimed the attempt; a document replacement is queued. */
  | 'scheduled'
  /** Another handler already claimed this one. */
  | 'in-flight'
  /** The session's attempt budget is spent. */
  | 'budget-spent'
  /** Work state is dirty or unknown — the document must not be replaced. */
  | 'unsafe-work'
  /** Not a stale-asset error. */
  | 'ineligible'
  /** The boot script is not installed. */
  | 'unavailable';

interface HelmRecovery {
  version: number;
  isAssetRecoveryMessage: (message: unknown) => boolean;
  requestRecovery: (message: unknown) => Exclude<RecoveryStatus, 'unavailable'>;
  workState: () => RecoveryWorkState;
  attempts: () => number;
  registerWork: (id: string, state: 'clean' | 'dirty') => void;
  releaseWork: (id: string) => void;
  markProviderMounted: () => void;
  absorbUrlMarker: () => boolean;
}

declare global {
  interface Window {
    __helmRecovery?: HelmRecovery;
  }
}

export function getRecovery(): HelmRecovery | null {
  if (typeof window === 'undefined') return null;
  return window.__helmRecovery ?? null;
}

/** Ask the one coordinator to recover from a suspected stale asset. */
export function requestRecovery(message: unknown): RecoveryStatus {
  return getRecovery()?.requestRecovery(message) ?? 'unavailable';
}

export function isAssetRecoveryMessage(message: unknown): boolean {
  return getRecovery()?.isAssetRecoveryMessage(message) ?? false;
}

export function recoveryWorkState(): RecoveryWorkState {
  // No coordinator means no knowledge, and no knowledge is not safety.
  return getRecovery()?.workState() ?? 'unknown';
}
