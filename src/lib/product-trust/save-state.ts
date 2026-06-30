export type SaveResult =
  | { ok: true; id?: string; stale?: boolean }
  | { ok: false; error: string };

export type SaveViewState =
  | { state: 'saved'; id?: string }
  | { state: 'failed'; message: string }
  | { state: 'saved_stale'; id?: string };

export function mapSaveState(result: SaveResult): SaveViewState {
  if (!result.ok) {
    return { state: 'failed', message: result.error || 'Save failed.' };
  }
  if (result.stale) return { state: 'saved_stale', id: result.id };
  return { state: 'saved', id: result.id };
}
