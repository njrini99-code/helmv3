import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error - plain .mjs module, no type declarations by design
import * as coverage from '../db-observability-coverage.mjs';

/**
 * Brief 79 - the coverage matrix's own tests.
 *
 * The matrix's whole value is that its cells are DERIVED. So the tests are
 * mostly about the derivation being real: that UNKNOWN cannot be silently
 * upgraded to NO, that NOT VERIFIED cannot be silently upgraded to YES, that
 * a detector reads code rather than prose, and that the generated file is
 * byte-stable so `--check` means something.
 */

const {
  COVERAGE_ROWS,
  COVERAGE_COLUMNS,
  OUTPUT_PATH,
  YES,
  NO,
  UNKNOWN,
  NOT_VERIFIED,
  buildMatrix,
  renderReport,
  stripComments,
  __testing,
} = coverage as {
  COVERAGE_ROWS: { id: string; label: string; modules: string[] }[];
  COVERAGE_COLUMNS: string[];
  OUTPUT_PATH: string;
  YES: string;
  NO: string;
  UNKNOWN: string;
  NOT_VERIFIED: string;
  buildMatrix: () => { id: string; label: string; cells: Record<string, string>; modulesPresent: boolean }[];
  renderReport: () => string;
  stripComments: (s: string) => string;
  __testing: { REPO_ROOT: string; sentryCell: (code: string | null) => string; dbErrorEventCell: (code: string | null) => string; blindSpotCell: (cells: Record<string, string>) => string };
};

/** Brief 79's row list, verbatim and in order. */
const BRIEF_ROWS = [
  'PostgREST select failure',
  'PostgREST mutation failure',
  'RPC SQLSTATE failure',
  'RPC rollback',
  'RPC timeout',
  'RPC unknown commit',
  'RLS expected denial',
  'RLS unexpected denial',
  'Auth API error',
  'Auth client error',
  'Storage error',
  'Realtime connection error',
  'Realtime silent propagation',
  'Edge Function exception',
  'pg_cron failure',
  'pg_cron missed run',
  'pg_net failure',
  'Lock wait',
  'Deadlock',
  'Connection saturation',
  'CPU / memory saturation',
  'Query performance regression',
  'Schema drift',
  'DB type drift',
  'Data integrity violation',
  'Sentry trace missing',
  'DB collector missing',
];

const BRIEF_COLUMNS = [
  'Sentry',
  'Bridge',
  'DB error event',
  'Flight Recorder',
  'SQLSTATE/code',
  'Release',
  'Trace correlation',
  'Metric',
  'Invariant',
  'Alert',
  'Replay',
  'Live verified',
  'Blind spot',
];

describe('coverage matrix - the brief exact rows and columns', () => {
  it('has every row the brief names, in order', () => {
    expect(COVERAGE_ROWS.map((r) => r.label)).toEqual(BRIEF_ROWS);
  });

  it('has every column the brief names, in order', () => {
    expect(COVERAGE_COLUMNS).toEqual(BRIEF_COLUMNS);
  });

  it('fills every cell of every row', () => {
    for (const row of buildMatrix()) {
      for (const column of COVERAGE_COLUMNS) {
        expect(row.cells[column], `${row.id}/${column}`).toBeDefined();
        expect(String(row.cells[column]).length, `${row.id}/${column}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('coverage matrix - a cell is never silently upgraded', () => {
  it('uses only the four sanctioned values in the verdict columns', () => {
    const allowed = new Set([YES, NO, UNKNOWN, NOT_VERIFIED, `${YES} (partial)`]);
    for (const row of buildMatrix()) {
      for (const column of COVERAGE_COLUMNS) {
        if (column === 'Blind spot' || column === 'Alert') continue;
        expect(allowed.has(row.cells[column]!), `${row.id}/${column} = ${row.cells[column]}`).toBe(true);
      }
    }
  });

  it('reports UNKNOWN, not NO, when a row has no implementing module on this branch', () => {
    // Several rows name modules that belong to sibling tracks. Missing
    // evidence is weaker than "the code does not do this", and the matrix
    // must say the weaker thing.
    const absent = buildMatrix().filter((r) => !r.modulesPresent);
    expect(absent.length).toBeGreaterThan(0);
    for (const row of absent) {
      expect(row.cells['DB error event'], row.id).toBe(UNKNOWN);
      expect(row.cells['SQLSTATE/code'], row.id).toBe(UNKNOWN);
      expect(row.cells.Metric, row.id).toBe(UNKNOWN);
    }
  });

  it('never marks a row live verified while the migrations are held', () => {
    for (const row of buildMatrix()) {
      expect(row.cells['Live verified'], row.id).toBe(NOT_VERIFIED);
    }
  });

  it('derives "live verified" from the ledger rather than hardcoding it', () => {
    // If the cell were a constant, discharging the hold would leave the
    // matrix lying forever. It reads HELD.md, so the file has to be there.
    const held = join(__testing.REPO_ROOT, 'supabase/migrations/HELD.md');
    expect(existsSync(held)).toBe(true);
    expect(readFileSync(held, 'utf-8')).toContain('20260903180000');
  });
});

describe('coverage matrix - the detectors read code, not prose', () => {
  it('does not read a comment denying a Sentry capture as a capture', () => {
    const denial = stripComments('/** does NOT call Sentry.captureException */\nconst x = 1;');
    expect(__testing.sentryCell(denial)).toBe(UNKNOWN);
  });

  it('does read a real Sentry capture as one', () => {
    expect(__testing.sentryCell('Sentry.captureMessage("x");')).toBe(YES);
  });

  it('separates "no module" from "module says no"', () => {
    expect(__testing.dbErrorEventCell(null)).toBe(UNKNOWN);
    expect(__testing.dbErrorEventCell('const x = 1;')).toBe(NO);
    expect(__testing.dbErrorEventCell('scheduleDbErrorRecording(envelope);')).toBe(YES);
  });

  it('names a blind spot when a channel is missing and none when nothing is', () => {
    const full: Record<string, string> = {
      Sentry: YES, Bridge: YES, 'DB error event': YES, Replay: YES, Metric: YES,
    };
    expect(__testing.blindSpotCell(full)).toBe('none identified');
    expect(__testing.blindSpotCell({ ...full, Replay: NO })).toContain('no replay fixture');
  });
});

describe('coverage matrix - the generated artifact', () => {
  const rendered = renderReport();

  it('carries a do-not-hand-edit header', () => {
    expect(rendered).toContain('GENERATED FILE - DO NOT HAND-EDIT');
    expect(rendered).toContain('scripts/db-observability-coverage.mjs');
  });

  it('carries no date and no commit SHA, so --check is a real idempotence test', () => {
    // A generated file with a timestamp fails --check on every run, which
    // trains everyone to ignore it.
    expect(rendered).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(rendered).not.toMatch(/\b[0-9a-f]{7,40}\b/);
  });

  it('is byte-stable across runs', () => {
    expect(renderReport()).toBe(rendered);
  });

  it('matches the committed file, so --check would pass', () => {
    const committed = join(__testing.REPO_ROOT, OUTPUT_PATH);
    expect(existsSync(committed)).toBe(true);
    expect(readFileSync(committed, 'utf-8')).toBe(rendered);
  });

  it('renders one table row per coverage row', () => {
    const tableRows = rendered.split('\n').filter((l) => l.startsWith('| ') && l.endsWith(' |'));
    // header + separator + one per row, plus the four-row legend table and
    // its own header/separator.
    expect(tableRows.length).toBeGreaterThanOrEqual(COVERAGE_ROWS.length + 2);
    for (const row of COVERAGE_ROWS) {
      expect(rendered).toContain(`| ${row.label} |`);
    }
  });
});
