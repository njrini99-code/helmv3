// =============================================================================
// Source health and freshness — per-source thresholds, and blind never reads
// as fresh.
//
// WHY THIS SUITE EXISTS. `sources.ts` exists because a single global
// staleness threshold cannot serve four collectors that refresh an order of
// magnitude apart: a live Sentry pull is seconds old, the reliability
// snapshot is up to three hours old. Pick a threshold that fits Sentry and
// the collector reads "stale" every three hours by design. Pick one that
// fits the collector and a genuinely dead Sentry pull reads "fresh" for
// hours. This suite pins the fix — a PER-SOURCE expectation — and, more
// importantly, pins the invariant `types.ts` states for the whole model: a
// source that could not be read is ABSENCE, never a healthy zero. A blind
// source with a recent timestamp is the sharpest version of that trap, and
// `canClaimAllClear` is the gate that stops it reaching the "No incidents"
// empty state.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildSourceFreshness,
  classifyFreshness,
  summarizeCoverage,
  canClaimAllClear,
  describeBlindness,
  type SourceReading,
} from '@/lib/admin/incidents/sources';
import {
  INCIDENT_SOURCES,
  type IncidentSourceName,
  type SourceFreshness,
} from '@/lib/admin/incidents/types';

/** Fixed instant so age math is deterministic instead of racing Date.now(). */
const NOW = new Date('2026-08-28T12:00:00.000Z').getTime();
const isoMinutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

/** A ready-to-use SourceFreshness row for summarizeCoverage / canClaimAllClear
 * / describeBlindness tests, which take rows directly rather than raw
 * readings. Defaults to a healthy 'app' row so each test only overrides what
 * it's actually exercising. */
function freshnessRow(over: Partial<SourceFreshness>): SourceFreshness {
  return {
    source: 'app',
    observedAt: isoMinutesAgo(1),
    ageMs: 60_000,
    expectedIntervalMs: 60_000,
    state: 'fresh',
    health: 'reading',
    ...over,
  };
}

describe('buildSourceFreshness — row shape and completeness', () => {
  it('returns exactly INCIDENT_SOURCES.length rows, in INCIDENT_SOURCES order, even with no readings', () => {
    // Asserted against the imported const, not a hand-written list of four
    // names — the whole point of the closed union in types.ts is that a
    // fifth source added there must not silently need a second edit here to
    // stay caught.
    const rows = buildSourceFreshness([], NOW);
    expect(rows).toHaveLength(INCIDENT_SOURCES.length);
    expect(rows.map((r) => r.source)).toEqual([...INCIDENT_SOURCES]);
  });

  it('a source missing from readings comes back unknown/unknown, not omitted', () => {
    // An omitted row renders as a shorter list, which reads as "there are
    // only three sources" — exactly the silent-drop failure the module's own
    // header calls out.
    const rows = buildSourceFreshness([], NOW);
    for (const row of rows) {
      expect(row.health).toBe('unknown');
      expect(row.state).toBe('unknown');
    }
  });
});

describe('buildSourceFreshness — per-source staleness thresholds', () => {
  it('a 30-minute-old supabase reading is fresh, while a 30-minute-old sentry reading is stale', () => {
    // THE test a single global threshold would fail. supabase's expectation
    // is the 3-hour collector cadence (180 min), so 30 minutes old is well
    // inside "fresh". sentry is read live on every request (1 min
    // expectation, stale past 3 min), so the same 30-minute age is fourteen
    // stale-multiples past its own threshold. One age, two correct verdicts,
    // only because each source carries its own expectation.
    const readings: SourceReading[] = [
      { source: 'supabase', health: 'reading', observedAt: isoMinutesAgo(30) },
      { source: 'sentry', health: 'reading', observedAt: isoMinutesAgo(30) },
    ];
    const rows = buildSourceFreshness(readings, NOW);
    expect(rows.find((r) => r.source === 'supabase')?.state).toBe('fresh');
    expect(rows.find((r) => r.source === 'sentry')?.state).toBe('stale');
  });

  it('a blind source reads unknown even when its observedAt is seconds old', () => {
    // A recent failed attempt is not a fresh reading. Whatever timestamp a
    // blind reading carries describes a read that did not happen, and
    // reporting it as fresh because the ATTEMPT was recent is exactly the
    // unknown-as-healthy move this module exists to refuse.
    const readings: SourceReading[] = [
      { source: 'vercel', health: 'blind', observedAt: new Date(NOW - 5_000).toISOString(), reason: 'GitHub API 500' },
    ];
    const row = buildSourceFreshness(readings, NOW).find((r) => r.source === 'vercel');
    expect(row?.health).toBe('blind');
    expect(row?.state).toBe('unknown');
  });

  it('a malformed observedAt yields ageMs: null and state: unknown, never a throw and never fresh', () => {
    const readings: SourceReading[] = [{ source: 'app', health: 'reading', observedAt: 'not-a-real-timestamp' }];
    let row: SourceFreshness | undefined;
    expect(() => {
      row = buildSourceFreshness(readings, NOW).find((r) => r.source === 'app');
    }).not.toThrow();
    expect(row?.ageMs).toBeNull();
    expect(row?.state).toBe('unknown');
  });

  it('a future-dated observedAt (clock skew) yields unknown, not fresh', () => {
    // Negative age is not "extremely fresh" — it means either the reader's
    // or the source's clock is wrong, and the honest answer is the same one
    // as any other reading we cannot make sense of.
    const readings: SourceReading[] = [
      { source: 'app', health: 'reading', observedAt: new Date(NOW + 5 * 60_000).toISOString() },
    ];
    const row = buildSourceFreshness(readings, NOW).find((r) => r.source === 'app');
    expect(row?.ageMs).toBeLessThan(0);
    expect(row?.state).toBe('unknown');
  });
});

describe('classifyFreshness — boundaries at 1x and 3x the expected interval', () => {
  const INTERVAL = 100_000;

  it('is fresh at exactly 1x the interval', () => {
    expect(classifyFreshness(INTERVAL, INTERVAL)).toBe('fresh');
  });

  it('is aging just past 1x the interval', () => {
    expect(classifyFreshness(INTERVAL + 1, INTERVAL)).toBe('aging');
  });

  it('is still aging at exactly 3x the interval — the stale cut is a strict greater-than', () => {
    expect(classifyFreshness(INTERVAL * 3, INTERVAL)).toBe('aging');
  });

  it('is stale just past 3x the interval', () => {
    expect(classifyFreshness(INTERVAL * 3 + 1, INTERVAL)).toBe('stale');
  });
});

describe('summarizeCoverage — worst is the minimum health, never an average', () => {
  it('three reading sources plus one blind source summarize to worst: blind', () => {
    // A mean across four sources here would land on something like
    // "mostly healthy" and report coverage that looks complete with a dead
    // source inside it. worst has to be the floor, not the average, because
    // coverage is only as good as its weakest read.
    const rows: SourceFreshness[] = [
      freshnessRow({ source: 'app', health: 'reading' }),
      freshnessRow({ source: 'sentry', health: 'reading' }),
      freshnessRow({ source: 'vercel', health: 'reading' }),
      freshnessRow({ source: 'supabase', health: 'blind', state: 'unknown' }),
    ];
    const summary = summarizeCoverage(rows);
    expect(summary.worst).toBe('blind');
  });

  it('names the blind sources and sets anyBlind', () => {
    const rows: SourceFreshness[] = [
      freshnessRow({ source: 'app', health: 'reading' }),
      freshnessRow({ source: 'sentry', health: 'blind', state: 'unknown' }),
      freshnessRow({ source: 'vercel', health: 'reading' }),
      freshnessRow({ source: 'supabase', health: 'reading' }),
    ];
    const summary = summarizeCoverage(rows);
    expect(summary.anyBlind).toBe(true);
    expect(summary.blindSources).toEqual(['sentry']);
  });

  it('oldestAgeMs ignores blind rows and reports the max of the rest', () => {
    // A blind row's age is meaningless — it times a read that did not
    // happen — so including it in "oldest reading" would let a stale,
    // unreadable source make the page look more current than it is (a huge
    // ageMs there would otherwise dominate the max) or more stale than the
    // real evidence warrants.
    const rows: SourceFreshness[] = [
      freshnessRow({ source: 'app', health: 'reading', ageMs: 10_000 }),
      freshnessRow({ source: 'sentry', health: 'reading', ageMs: 90_000 }),
      freshnessRow({ source: 'vercel', health: 'blind', state: 'unknown', ageMs: 999_000_000 }),
      freshnessRow({ source: 'supabase', health: 'reading', ageMs: 40_000 }),
    ];
    const summary = summarizeCoverage(rows);
    expect(summary.oldestAgeMs).toBe(90_000);
  });

  it('empty input summarizes to worst: unknown', () => {
    const summary = summarizeCoverage([]);
    expect(summary.worst).toBe('unknown');
    expect(summary.total).toBe(0);
  });
});

describe('canClaimAllClear — the guard against a green screen over a blind source', () => {
  // This is the guard that stops "No incidents 🎉" rendering under an
  // unreadable Sentry. If someone makes `blind` fall through to `true` here,
  // THIS test must go red — that is the entire reason it exists.
  const allReading = (): SourceFreshness[] =>
    INCIDENT_SOURCES.map((source) => freshnessRow({ source, health: 'reading' }));

  it('is false when any source is blind', () => {
    const rows = allReading().map((row) =>
      row.source === 'app' ? freshnessRow({ source: 'app', health: 'blind', state: 'unknown' }) : row,
    );
    expect(canClaimAllClear(summarizeCoverage(rows))).toBe(false);
  });

  it('is false when any source is unknown', () => {
    const rows = allReading().map((row) =>
      row.source === 'app' ? freshnessRow({ source: 'app', health: 'unknown', state: 'unknown' }) : row,
    );
    expect(canClaimAllClear(summarizeCoverage(rows))).toBe(false);
  });

  it('is false on empty coverage', () => {
    expect(canClaimAllClear(summarizeCoverage([]))).toBe(false);
  });

  it('is true only when every source reads', () => {
    expect(canClaimAllClear(summarizeCoverage(allReading()))).toBe(true);
  });
});

describe('describeBlindness — the beacon sentence', () => {
  it('returns null when nothing is blind', () => {
    const rows = INCIDENT_SOURCES.map((source) => freshnessRow({ source, health: 'reading' }));
    expect(describeBlindness(rows, new Map())).toBeNull();
  });

  it('names an UNKNOWN source, because unknown already blocks the all-clear and used to be unexplained', () => {
    // Regression, 2026-09-03. `canClaimAllClear` requires unknown === 0, so
    // a source that has never reported already degrades every all-clear
    // surface. This function returned null for that case, so the beacon
    // rendered nothing and the queue fell back to copy asserting a source
    // "could not be read this refresh" — false, since nothing was
    // attempted. The operator saw a degradation with no reason, or a wrong
    // one.
    const rows: SourceFreshness[] = INCIDENT_SOURCES.map((source) =>
      freshnessRow({ source, health: source === 'database' ? 'unknown' : 'reading', state: source === 'database' ? 'unknown' : 'fresh' }),
    );
    const reasons = new Map<IncidentSourceName, string | null>([['database', 'collector has not written its first sample']]);
    const note = describeBlindness(rows, reasons);

    expect(note).not.toBeNull();
    expect(note).toContain('DATABASE');
    expect(note).toContain('has not reported yet');
    expect(note).toContain('collector has not written its first sample');
    // Wording must stay distinct from the blackout case: nothing failed.
    expect(note).not.toContain('could not be read');
  });

  it('keeps blind, partial and unknown in separate clauses rather than collapsing them', () => {
    const rows: SourceFreshness[] = [
      freshnessRow({ source: 'app', health: 'reading' }),
      freshnessRow({ source: 'sentry', health: 'blind', state: 'unknown' }),
      freshnessRow({ source: 'vercel', health: 'partial' }),
      freshnessRow({ source: 'database', health: 'unknown', state: 'unknown' }),
      freshnessRow({ source: 'supabase', health: 'reading' }),
    ];
    const note = describeBlindness(rows, new Map())!;
    expect(note).toContain('SENTRY could not be read this refresh');
    expect(note).toContain('VERCEL read incompletely');
    expect(note).toContain('DATABASE has not reported yet');
  });

  it('names each blind source, with its reason when one is known and without the parenthetical when it is not', () => {
    const rows: SourceFreshness[] = [
      freshnessRow({ source: 'app', health: 'reading' }),
      freshnessRow({ source: 'sentry', health: 'blind', state: 'unknown' }),
      freshnessRow({ source: 'vercel', health: 'blind', state: 'unknown' }),
      freshnessRow({ source: 'supabase', health: 'reading' }),
    ];
    const reasons = new Map<IncidentSourceName, string | null>([
      ['sentry', 'GitHub API 500'],
      ['vercel', null],
    ]);
    const message = describeBlindness(rows, reasons);
    expect(message).toContain('SENTRY (GitHub API 500)');
    expect(message).toContain('VERCEL');
    expect(message).not.toContain('VERCEL (');
  });
});
