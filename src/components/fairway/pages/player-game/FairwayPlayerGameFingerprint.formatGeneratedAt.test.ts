/**
 * ============================================================================
 * FairwayPlayerGameFingerprint.tsx — `formatGeneratedAt` determinism
 * (prod React #418 on /players/[id]/game)
 * ----------------------------------------------------------------------------
 * ROOT CAUSE: the "Generated …" footnote called
 * `new Date(generatedAt).toLocaleString()` with no locale/timeZone argument,
 * which resolves to the CALLING PROCESS's own default locale + timezone.
 * `FairwayPlayerGameFingerprint` is the default tab on the route (mounted on
 * both the SSR pass and the first client render whenever `?tab` isn't
 * `scouting`), so a Vercel Lambda (ambient UTC) and a visitor's browser (any
 * locale/zone) computed two different strings for the SAME instant — a
 * hydration text mismatch.
 *
 * These tests pin a known instant and assert `formatGeneratedAt` produces
 * the IDENTICAL string no matter what the process's own ambient `TZ` happens
 * to be — the exact property the bug violated — mirroring the pattern
 * already established in `src/test/lib/calendar/timezone.test.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { formatGeneratedAt } from './FairwayPlayerGameFingerprint';

const ORIGINAL_TZ = process.env.TZ;

describe('formatGeneratedAt — deterministic, process-independent formatting', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  const GENERATED_AT = '2026-07-20T22:15:00Z';

  it('is IDENTICAL regardless of the executing process\'s own local timezone', () => {
    // This is the exact bug: a bare `.toLocaleString()` would produce a
    // DIFFERENT string under each of these ambient zones for the SAME
    // instant — the mismatch React's hydration diff caught in prod.
    const ambientZones = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo'];
    const results = ambientZones.map((tz) => {
      process.env.TZ = tz;
      return formatGeneratedAt(GENERATED_AT);
    });
    expect(new Set(results).size).toBe(1);
  });

  it('anchors to the fixed DEFAULT_TIMEZONE, not the ambient process zone', () => {
    process.env.TZ = 'UTC';
    const underUtc = formatGeneratedAt(GENERATED_AT);
    // 2026-07-20T22:15:00Z is 6:15 PM in America/New_York during EDT
    // (UTC-4) — if this ever regresses to reading the ambient zone, the
    // UTC-process run would report "10:15 PM" instead.
    expect(underUtc).toContain('6:15');
    expect(underUtc).not.toContain('10:15');
  });

  it('returns an empty string for an unparseable timestamp (never "Invalid Date")', () => {
    expect(formatGeneratedAt('not-a-real-timestamp')).toBe('');
  });
});
