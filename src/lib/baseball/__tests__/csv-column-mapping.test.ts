// =============================================================================
// Unit tests for CSV column auto-detection (csv-utils.findColumnMapping /
// autoDetectColumnMapping / normalizeStatRow).
//
// Regression coverage for a confirmed data-corruption bug: findColumnMapping
// matched a field's short aliases ('r','h','hr','er',...) against CSV headers
// using BIDIRECTIONAL substring containment ("hr".includes("r") is true), so a
// standard box-score header like ['name','ab','r','h','2b','3b','hr','rbi',
// 'bb','so','sb','cs'] silently bound home_runs/rbis/earned_runs/
// home_runs_allowed to the RUNS column, hit_by_pitch to the HITS column, and
// produced non-null pitching-only fields for a pure batting row — which trips
// `hasAny(v, PITCHING_ONLY_FIELDS)` in imports.ts and creates a phantom
// pitching box-score row for a position player who never pitched. Real hr/
// rbi columns were then dropped as "ignored column" because nothing ever
// selected them.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  findColumnMapping,
  autoDetectColumnMapping,
  normalizeStatRow,
  type CSVRow,
} from '@/lib/baseball/csv-utils';

// The exact header format the app's own built-in GameChanger source declares
// as its signature (import-matching.ts signatureHeaders: ab,h,rbi,bb,so,avg),
// expanded to a realistic full box-score export.
const STANDARD_BATTING_HEADERS = ['name', 'ab', 'r', 'h', '2b', '3b', 'hr', 'rbi', 'bb', 'so', 'sb', 'cs'];

function makeRow(headers: string[], values: string[]): CSVRow {
  const row: CSVRow = {};
  headers.forEach((h, i) => {
    row[h] = values[i] ?? '';
  });
  return row;
}

describe('autoDetectColumnMapping — standard box-score header (GameChanger-style)', () => {
  it('maps every batting column to its OWN field, not a collided neighbor', () => {
    const mapping = autoDetectColumnMapping(STANDARD_BATTING_HEADERS);

    expect(mapping.at_bats).toBe('ab');
    expect(mapping.runs).toBe('r');
    expect(mapping.hits).toBe('h');
    expect(mapping.doubles).toBe('2b');
    expect(mapping.triples).toBe('3b');
    expect(mapping.home_runs).toBe('hr'); // NOT 'r'
    expect(mapping.rbis).toBe('rbi'); // NOT 'r'
    expect(mapping.walks).toBe('bb');
    expect(mapping.strikeouts).toBe('so');
    expect(mapping.stolen_bases).toBe('sb');
    expect(mapping.caught_stealing).toBe('cs');

    // No hbp column exists in this header set — must NOT collide onto 'h'.
    expect(mapping.hit_by_pitch).toBeUndefined();
  });

  it('never double-binds a header to both a batting field and its pitching counterpart', () => {
    const mapping = autoDetectColumnMapping(STANDARD_BATTING_HEADERS);

    // 'hits'/'runs' legitimately share aliases ('h'/'r') with their pitching
    // counterparts in HEADER_MAPPINGS. Once 'h' is claimed by `hits` and 'r'
    // by `runs`, the pitching-only fields must NOT also claim them.
    expect(mapping.hits_allowed).toBeUndefined();
    expect(mapping.runs_allowed).toBeUndefined();
    expect(mapping.earned_runs).toBeUndefined();
    expect(mapping.home_runs_allowed).toBeUndefined();
    expect(mapping.innings_pitched).toBeUndefined();
    expect(mapping.pitch_count).toBeUndefined();

    // Every mapped header must be unique across the whole mapping.
    const mappedHeaders = Object.values(mapping).filter((h): h is string => !!h);
    expect(new Set(mappedHeaders).size).toBe(mappedHeaders.length);
  });

  it('normalizeStatRow produces correct batting values and NO non-null pitching-only fields', () => {
    // name, ab, r, h, 2b, 3b, hr, rbi, bb, so, sb, cs
    const row = makeRow(STANDARD_BATTING_HEADERS, ['Test Hitter', '4', '1', '2', '0', '0', '0', '1', '0', '1', '0', '0']);
    const mapping = autoDetectColumnMapping(STANDARD_BATTING_HEADERS);
    const normalized = normalizeStatRow(row, mapping);

    expect(normalized.at_bats).toBe(4);
    expect(normalized.runs).toBe(1);
    expect(normalized.hits).toBe(2);
    expect(normalized.home_runs).toBe(0);
    expect(normalized.rbis).toBe(1);
    expect(normalized.strikeouts).toBe(1);

    // These would previously come back non-null (e.g. bound to the 'h'/'r'
    // columns) and trip imports.ts's PITCHING_ONLY_FIELDS check, fabricating
    // a pitching box-score row for a hitter.
    expect(normalized.hits_allowed).toBeFalsy();
    expect(normalized.runs_allowed).toBeFalsy();
    expect(normalized.earned_runs).toBeFalsy();
    expect(normalized.home_runs_allowed).toBeFalsy();
    expect(normalized.innings_pitched).toBeFalsy();
    expect(normalized.pitch_count).toBeFalsy();
    expect(normalized.hit_by_pitch).toBeFalsy();
  });
});

describe('findColumnMapping — direct short-alias collision cases', () => {
  it('does not let "hr" bind to a header literally named "r"', () => {
    expect(findColumnMapping(['r', 'h', 'hr'], 'home_runs')).toBe('hr');
  });

  it('does not let "rbi" bind to a header literally named "r"', () => {
    expect(findColumnMapping(['r', 'h', 'rbi'], 'rbis')).toBe('rbi');
  });

  it('does not let "er" (earned_runs) bind to a header literally named "r" when no "er" column exists', () => {
    expect(findColumnMapping(['name', 'ab', 'r', 'h'], 'earned_runs')).toBeNull();
  });

  it('does not let "hbp" bind to a header literally named "h"', () => {
    expect(findColumnMapping(['name', 'ab', 'r', 'h'], 'hit_by_pitch')).toBeNull();
  });

  it('"so" (strikeouts) and "sb" (stolen_bases) resolve to their own distinct headers', () => {
    expect(findColumnMapping(['so', 'sb'], 'strikeouts')).toBe('so');
    expect(findColumnMapping(['so', 'sb'], 'stolen_bases')).toBe('sb');
  });

  it('exact match wins even when a header could also fuzzy-match another field', () => {
    // 'h' should resolve to hits via exact match, not get skipped in favor of
    // any fuzzy candidate.
    expect(findColumnMapping(['h'], 'hits')).toBe('h');
  });

  it('still resolves a compound/descriptive header via controlled fuzzy match', () => {
    expect(findColumnMapping(['Player Name'], 'player_name')).toBe('Player Name');
    expect(findColumnMapping(['Home Runs'], 'home_runs')).toBe('Home Runs');
  });

  it('a field with no plausible header returns null rather than guessing', () => {
    expect(findColumnMapping(['name', 'ab', 'r', 'h'], 'launch_angle')).toBeNull();
  });
});

describe('findColumnMapping — standalone per-field calls (games.ts usage pattern)', () => {
  it('a pure pitching header set maps innings/hits-allowed/runs-allowed/earned-runs correctly', () => {
    const headers = ['name', 'ip', 'h', 'r', 'er', 'bb', 'so', 'hr'];
    expect(findColumnMapping(headers, 'innings_pitched')).toBe('ip');
    expect(findColumnMapping(headers, 'hits_allowed')).toBe('h');
    expect(findColumnMapping(headers, 'runs_allowed')).toBe('r');
    expect(findColumnMapping(headers, 'earned_runs')).toBe('er');
    expect(findColumnMapping(headers, 'walks')).toBe('bb');
    expect(findColumnMapping(headers, 'strikeouts')).toBe('so');
    expect(findColumnMapping(headers, 'home_runs_allowed')).toBe('hr');
  });
});

// -----------------------------------------------------------------------------
// Real-world source-signature variants declared in the import registry
// (import-matching.ts BASEBALL_IMPORT_SOURCES). Coverage for the exact header
// vocabularies the app claims to recognize, so a future change to
// HEADER_MAPPINGS or the matcher can't silently break one of them.
// -----------------------------------------------------------------------------

describe('autoDetectColumnMapping — declared import-source signatures', () => {
  it('GameChanger signature (ab,h,rbi,bb,so,avg) maps the stat columns and leaves "avg" unmapped', () => {
    // import-matching.ts: signatureHeaders: ['ab', 'h', 'rbi', 'bb', 'so', 'avg']
    const headers = ['name', 'ab', 'h', 'rbi', 'bb', 'so', 'avg'];
    const mapping = autoDetectColumnMapping(headers);

    expect(mapping.at_bats).toBe('ab');
    expect(mapping.hits).toBe('h');
    expect(mapping.rbis).toBe('rbi');
    expect(mapping.walks).toBe('bb');
    expect(mapping.strikeouts).toBe('so');
    // 'avg' (batting average) has no stat-field alias in HEADER_MAPPINGS —
    // it is a derived stat, not an importable raw column — so it must stay
    // unmapped rather than fuzzy-glomming onto an unrelated field.
    expect(Object.values(mapping)).not.toContain('avg');
  });

  it('TrackMan/Rapsodo signature (exit_velocity, launch_angle, spin_rate) maps its two importable metrics', () => {
    // import-matching.ts: signatureHeaders include 'exit_velocity','launch_angle','spin_rate','pitch_velocity'.
    // spin_rate/pitch_velocity have no HEADER_MAPPINGS entry (out of scope for
    // this importer's stat vocabulary) — only exit_velocity/launch_angle do.
    const headers = ['name', 'exit_velocity', 'launch_angle', 'spin_rate', 'pitch_velocity'];
    const mapping = autoDetectColumnMapping(headers);

    expect(mapping.exit_velocity).toBe('exit_velocity');
    expect(mapping.launch_angle).toBe('launch_angle');
  });
});
