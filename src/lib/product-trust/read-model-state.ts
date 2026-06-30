// =============================================================================
// Product-trust load-state resolver for BaseballHelm read models.
//
// Distinguishes empty success, load failure, and unauthorized envelopes so UI
// surfaces never collapse a failed load into a healthy "no data yet" state.
// =============================================================================

export type ReadModelLoadState =
  | 'unauthorized'
  | 'error'
  | 'empty'
  | 'ready'
  | 'partial';

export interface ReadModelLoadInput {
  authorized: boolean;
  error: string | null;
  hasData: boolean;
  /** True when some sub-feeds loaded but others failed. */
  partial?: boolean;
}

/**
 * Resolve how a staff read model should render.
 *
 * Contract:
 *   - unauthorized: authorized === false, error === null (not staff)
 *   - error: authorized === true, error !== null (sub-read failed)
 *   - empty: authorized === true, error === null, hasData === false
 *   - partial: authorized === true, partial === true (some feeds failed/empty)
 *   - ready: authorized === true, hasData === true, error === null
 */
export function resolveReadModelLoadState(input: ReadModelLoadInput): ReadModelLoadState {
  if (!input.authorized) return 'unauthorized';
  if (input.error) return input.partial ? 'partial' : 'error';
  if (!input.hasData) return 'empty';
  if (input.partial) return 'partial';
  return 'ready';
}

export function readModelStateLabel(state: ReadModelLoadState): string {
  switch (state) {
    case 'unauthorized':
      return 'You do not have access to this team data.';
    case 'error':
      return 'Some data could not be loaded. Try refreshing.';
    case 'partial':
      return 'Some sections loaded; others are temporarily unavailable.';
    case 'empty':
      return 'No data yet — this is a healthy empty state.';
    case 'ready':
      return 'Data loaded.';
  }
}
