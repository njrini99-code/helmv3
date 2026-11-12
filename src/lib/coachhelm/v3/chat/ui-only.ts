/**
 * The one key of a read's `detail` that the app draws from and the model never sees (CoachHelm Studio Phase 1, the Miss
 * Compass). It holds rows a coach can open: the shots behind a miss pattern. It is stored with the read like the rest of
 * `detail`, so a later "Ask about these shots" is resolved against the stored read (engine/about.ts), but everything that
 * turns a read into words or numbers for the model passes it over:
 *
 *   - the model's text (`plain` / `detailLines`, reader-kit.ts);
 *   - the figures an answer is checked against (`supportedNumbers`, grounding.ts);
 *   - the rows `summarise_data` counts over (`rowsOfEnvelope`, summarise-data.ts);
 *   - a `row:` reference from the browser (engine/about.ts; only its own `shots:` selection reads it);
 *   - the thread's generic tables (`detailTable`, coachhelm-chat-thread.ts).
 *
 * No dependencies, so the browser's code and the server's share it.
 */
export const UI_ONLY_KEY = 'ui_only';

/** `detail` without its UI-only key; the same object when it has none, so a read without one is untouched. */
export function withoutUiOnly(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail) || !Object.prototype.hasOwnProperty.call(detail, UI_ONLY_KEY)) return detail;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) if (k !== UI_ONLY_KEY) rest[k] = v;
  return rest;
}

/** The UI-only payload of a read's `detail`, or null. */
export function uiOnlyOf(detail: unknown): Record<string, unknown> | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const v = (detail as Record<string, unknown>)[UI_ONLY_KEY];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
