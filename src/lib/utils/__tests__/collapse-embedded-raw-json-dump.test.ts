import { describe, it, expect } from 'vitest';
import { collapseEmbeddedRawJsonDump } from '@/lib/utils/describe-error';

/**
 * The real payload from 2026-08-03: `insight-delivery.getInsightsForCoach`
 * interpolated a raw `error.message` that turned out to be postgrest-js's
 * `{ message: body }` fallback for an unparseable 2xx response — the RAW,
 * truncated JSON row array, not a real error. `error_logs.message` ended up
 * holding an entire coach's insight feed (a player's putting percentages,
 * coaching evidence, drill content).
 *
 * Same harm as the HTML-gateway-page case this mirrors: every occurrence
 * carries different row content, so each one minted its own incident group
 * instead of collapsing into one. These tests pin the same two properties —
 * the caller's prefix survives (so you know WHICH call failed), and the
 * output is byte-stable across occurrences with different row content (so an
 * outage is one incident with a count) — plus that no row content leaks.
 */
const rowDump = (n: number, tag = 'putting') =>
  '[' +
  Array.from(
    { length: n },
    (_, i) =>
      `{"id":"0138a7f6-8015-465c-93a6-0c1781ee6c${i}","player_id":"faced578-b271-416f-b757-ac3aee5bd9e5","category":"${tag}","content":"padding-to-simulate-a-real-row-payload-so-the-length-gate-fires"}`,
  ).join(',') +
  ']';

describe('collapseEmbeddedRawJsonDump', () => {
  it('keeps the caller prefix and collapses only the JSON dump', () => {
    const msg = `getInsightsForCoach failed: ${rowDump(5)}`;
    const out = collapseEmbeddedRawJsonDump(msg);

    expect(out).toContain('getInsightsForCoach failed:');
    expect(out).toContain('truncated row dump');
    expect(out).not.toContain('faced578');
    expect(out).not.toContain('"id"');
  });

  it('is byte-stable across occurrences with a DIFFERENT row count and content', () => {
    // Real occurrences of a truncated response never cut off at the same row
    // count. A summary that varied with size or content would still mint a
    // new incident group per occurrence — exactly the fragmentation this
    // collapse exists to stop, same as the HTML gateway-page case above.
    const a = collapseEmbeddedRawJsonDump(`x failed: ${rowDump(3, 'putting')}`);
    const b = collapseEmbeddedRawJsonDump(`x failed: ${rowDump(40, 'chipping')}`);

    expect(a).toBe(b);
    expect(a).not.toContain('putting');
    expect(b).not.toContain('chipping');
  });

  it('returns null for a message with no embedded JSON dump, so callers pass through', () => {
    expect(collapseEmbeddedRawJsonDump('plain failure: column does not exist')).toBeNull();
    expect(collapseEmbeddedRawJsonDump('')).toBeNull();
  });

  it('handles the dump at the very start (no prefix) without a leading space', () => {
    const out = collapseEmbeddedRawJsonDump(rowDump(5));
    expect(out).not.toBeNull();
    expect(out!.startsWith(' ')).toBe(false);
    expect(out).toContain('truncated row dump');
  });

  it('does not fire on a short, genuine jsonb-detail error message', () => {
    // Real Postgrest error text can legitimately contain a short embedded
    // JSON fragment (e.g. a jsonb column in a constraint-violation detail).
    // The length gate is what keeps this from being misread as a dump.
    expect(
      collapseEmbeddedRawJsonDump('duplicate key: Key (metadata)=({"a":1}) already exists.'),
    ).toBeNull();
  });

  it('does not fire on prose that merely mentions JSON', () => {
    expect(collapseEmbeddedRawJsonDump('failed to parse json response body')).toBeNull();
  });
});
