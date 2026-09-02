/**
 * The suggested-time chips crashed the calendar in production on 2026-08-19:
 *
 *   TypeError: e.start.toLocaleTimeString is not a function
 *     at Array.map (<anonymous>)
 *     /golf/dashboard/calendar
 *
 * `checkScheduleConflicts` DELIBERATELY serializes its alternative slots to
 * ISO strings, and its own return type says `Date | string`. Both calendar
 * editors declared their local copy of that shape as `{ start: Date }` and
 * bridged the gap with `as ConflictData` — an assertion, so the compiler had
 * nothing to say about it.
 *
 * The lie was invisible while the list was always empty (`suggestions` read a
 * key the conflicts library never returned, so no chip ever rendered). Fixing
 * that one-word mismatch made the chips appear, and they threw on first paint.
 *
 * These tests pin the WIRE shape — ISO strings, which is what the action
 * actually sends. A test written with Date objects would reproduce the exact
 * assumption that hid the bug for as long as it hid.
 */

import { describe, it, expect } from 'vitest';

/** The action's serialization, reproduced verbatim from golf.ts. */
function serializeSuggestions(
  suggestedTimes: Array<{ start: Date; end: Date }>,
): Array<{ start: string; end: string }> {
  return suggestedTimes.map((s) => ({
    start: s.start instanceof Date ? s.start.toISOString() : s.start,
    end: s.end instanceof Date ? s.end.toISOString() : s.end,
  }));
}

/**
 * The normalizer both editors now run at the `setConflicts` boundary. Kept in
 * step with the copies in FairwayEventEditor.tsx / EventDetailModal.tsx.
 */
function normalizeSuggestions(
  raw: Array<{ start: Date | string; end: Date | string }> | undefined,
): Array<{ start: Date; end: Date }> {
  const toDate = (value: Date | string): Date =>
    value instanceof Date ? value : new Date(value);
  return (raw ?? [])
    .map((s) => ({ start: toDate(s.start), end: toDate(s.end) }))
    .filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()));
}

describe('conflict suggestions — wire shape vs render shape', () => {
  it('the action really does send strings, not Dates', () => {
    const wire = serializeSuggestions([
      { start: new Date('2026-08-20T14:00:00.000Z'), end: new Date('2026-08-20T16:00:00.000Z') },
    ]);

    expect(typeof wire[0]!.start).toBe('string');
    expect(wire[0]!.start).toBe('2026-08-20T14:00:00.000Z');
  });

  it('reproduces the production crash when the wire shape is used unconverted', () => {
    const wire = serializeSuggestions([
      { start: new Date('2026-08-20T14:00:00.000Z'), end: new Date('2026-08-20T16:00:00.000Z') },
    ]);

    // Exactly what the chip did: `s.start.toLocaleTimeString(...)` inside .map
    expect(() =>
      wire.map((s) =>
        (s as unknown as { start: Date }).start.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }),
      ),
    ).toThrow(TypeError);
  });

  it('normalizing at the boundary makes the chip render', () => {
    const wire = serializeSuggestions([
      { start: new Date('2026-08-20T14:00:00.000Z'), end: new Date('2026-08-20T16:00:00.000Z') },
    ]);

    const suggestions = normalizeSuggestions(wire);

    expect(suggestions).toHaveLength(1);
    expect(() =>
      suggestions.map((s) => s.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    ).not.toThrow();
  });

  it('normalizing also makes SELECTING a chip work, not just displaying it', () => {
    // selectSuggestedTime calls toISOString() and toTimeString(). Patching only
    // the render would have moved the crash from paint to click.
    const suggestions = normalizeSuggestions([
      { start: '2026-08-20T14:00:00.000Z', end: '2026-08-20T16:00:00.000Z' },
    ]);
    const slot = suggestions[0]!;

    expect(() => slot.start.toISOString()).not.toThrow();
    expect(slot.start.toISOString()).toBe('2026-08-20T14:00:00.000Z');
    expect(typeof slot.end.toTimeString()).toBe('string');
  });

  it('passes Dates through untouched, so a future non-serialized caller still works', () => {
    const start = new Date('2026-08-20T14:00:00.000Z');
    const suggestions = normalizeSuggestions([{ start, end: new Date('2026-08-20T16:00:00.000Z') }]);

    expect(suggestions[0]!.start.getTime()).toBe(start.getTime());
  });

  it('drops unparseable slots rather than rendering "Invalid Date"', () => {
    // `new Date('nonsense')` does not throw — it yields an Invalid Date that
    // formats as the literal string "Invalid Date" and goes NaN the moment
    // somebody picks it. A dropped chip is honest; a broken one is not.
    const suggestions = normalizeSuggestions([
      { start: 'not-a-date', end: '2026-08-20T16:00:00.000Z' },
      { start: '2026-08-20T14:00:00.000Z', end: '2026-08-20T16:00:00.000Z' },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.start.toISOString()).toBe('2026-08-20T14:00:00.000Z');
  });

  it('an absent suggestions key is empty, not a crash', () => {
    expect(normalizeSuggestions(undefined)).toEqual([]);
  });
});
