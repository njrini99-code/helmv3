export type LoadResult<T> =
  | { ok: true; data: T[]; stale?: boolean }
  | { ok: false; error: string; staleData?: T[] };

export type LoadViewState<T> =
  | { state: 'error'; message: string; staleData?: T[] }
  | { state: 'empty' }
  | { state: 'stale'; data: T[] }
  | { state: 'ready'; data: T[] };

export function mapLoadState<T>(result: LoadResult<T>): LoadViewState<T> {
  if (!result.ok) {
    return {
      state: 'error',
      message: result.error || 'Unable to load data.',
      staleData: result.staleData,
    };
  }
  if (result.stale && result.data.length > 0) return { state: 'stale', data: result.data };
  if (result.data.length === 0) return { state: 'empty' };
  return { state: 'ready', data: result.data };
}
