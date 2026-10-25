/**
 * The cookie that remembers which change marks this device has seen (`s`: the strike has been drawn) or cleared with
 * Got it (`g`), so the server paints a mark the viewer already saw, or hid, correctly on the first frame and the strike
 * draws once. A plain module for the same reason as clock-cookie.ts: the server reads it (phone-hint.ts) and the client
 * writes it (use-change-marks.tsx), and a constant exported from a 'use client' module is a client reference on the
 * server, not the string.
 *
 * Device-only (owner call 12.4, default a): it is not synced across devices. A change's session id keys it, never a
 * person, so a shared device shares what it has seen. The value is `id8:s` or `id8:g` entries, comma-separated, newest
 * first. At most 64 entries (about 700 bytes): past that the oldest `s` entries go first, then the oldest `g`, so an
 * overflow can only make a mark that was seen draw its strike once more, and can bring back a cleared one only when more
 * than 64 changes are live on one device, which the 72-hour life of a mark makes rare.
 */
export const CH_MARKS_COOKIE = 'ch_marks';

/** Eight days: well past a mark's 72-hour life. */
export const CH_MARKS_MAX_AGE = 8 * 24 * 60 * 60;

export const MARKS_CAP = 64;

export type MarkFlag = 's' | 'g';
/** Newest first. An array, not an object: a key such as "12345678" would be reordered as an integer index. */
export type MarkEntries = Array<[string, MarkFlag]>;

/** The cookie's key for a change: the first eight hex characters of its session id. */
export function markKey(changeId: string): string {
  return changeId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

export function parseMarks(value: string | null | undefined): MarkEntries {
  if (!value) return [];
  const out: MarkEntries = [];
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const m = /^([0-9a-f]{8}):([sg])$/.exec(part.trim());
    if (!m || seen.has(m[1]!)) continue;
    seen.add(m[1]!);
    out.push([m[1]!, m[2] as MarkFlag]);
  }
  return capMarks(out);
}

export function serializeMarks(entries: MarkEntries): string {
  return capMarks(entries)
    .map(([k, f]) => `${k}:${f}`)
    .join(',');
}

/** Drop the oldest `s` entries first, then the oldest `g`, until the cap holds. */
function capMarks(entries: MarkEntries): MarkEntries {
  const out = [...entries];
  for (const flag of ['s', 'g'] as const) {
    for (let i = out.length - 1; i >= 0 && out.length > MARKS_CAP; i--) if (out[i]![1] === flag) out.splice(i, 1);
  }
  return out;
}

/** Record a flag for a change at the front. Got it is stronger than seen: a seen flag never replaces it. */
export function withMark(entries: MarkEntries, changeId: string, flag: MarkFlag): MarkEntries {
  const key = markKey(changeId);
  const current = entries.find(([k]) => k === key)?.[1];
  const next: MarkFlag = current === 'g' && flag === 's' ? 'g' : flag;
  return capMarks([[key, next], ...entries.filter(([k]) => k !== key)]);
}

/** Show it again: the change keeps its seen flag (it has already drawn), without the cleared one. */
export function showAgain(entries: MarkEntries, changeId: string): MarkEntries {
  return withMark(entries.filter(([k]) => k !== markKey(changeId)), changeId, 's');
}

export function marksRecord(entries: MarkEntries): Record<string, MarkFlag> {
  return Object.fromEntries(entries);
}

export function entriesFromRecord(record: Record<string, MarkFlag>): MarkEntries {
  return capMarks(Object.entries(record).filter((e): e is [string, MarkFlag] => e[1] === 's' || e[1] === 'g'));
}
