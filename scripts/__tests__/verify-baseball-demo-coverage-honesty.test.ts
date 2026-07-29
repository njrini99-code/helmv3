// Regression guards for the three ways scripts/verify-baseball-demo-coverage.ts
// used to overstate demo coverage. The pure reporting logic is exported, so
// these run without a database.
//
// Runs in the `unit` vitest project (wired in vitest.config.ts).

import { it, expect } from 'vitest';

// node:assert/strict shims over vitest's `expect`.
//
// These assertions were written for `node --test`, which nothing in this repo
// runs — 46 sibling files under scripts/__tests__/ are in exactly that state,
// passing locally and gating nothing. Rather than rewrite every assertion (and
// risk changing what they assert while doing it), the four forms used here are
// mapped onto vitest so the file runs in the `unit` project unchanged. The
// second argument becomes expect's label, so failure messages survive.
const assert = {
  ok: (value: unknown, message?: string) => expect(value, message).toBeTruthy(),
  equal: (actual: unknown, expected: unknown, message?: string) =>
    expect(actual, message).toBe(expected),
  notEqual: (actual: unknown, expected: unknown, message?: string) =>
    expect(actual, message).not.toBe(expected),
  deepEqual: (actual: unknown, expected: unknown, message?: string) =>
    expect(actual, message).toEqual(expected),
  match: (value: string, pattern: RegExp, message?: string) =>
    expect(value, message).toMatch(pattern),
  doesNotMatch: (value: string, pattern: RegExp, message?: string) =>
    expect(value, message).not.toMatch(pattern),
};

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  SURFACE_COVERAGE,
  INTENTIONALLY_EMPTY,
  evaluateCoverage,
  formatReportLine,
} from '../verify-baseball-demo-coverage';
import { isRecruitingEnabled } from '../../src/lib/baseball/product-modules';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const VERIFIER_FILE = join(REPO_ROOT, 'scripts', 'verify-baseball-demo-coverage.ts');

// ---------------------------------------------------------------------------
// LIE #1 — an unscoped global count passing as team coverage.
// ---------------------------------------------------------------------------

it('no surface is counted globally — every check is scoped to the demo team', () => {
  const allowedKinds = new Set(['team', 'org', 'coach', 'parent']);
  for (const entry of [...SURFACE_COVERAGE, ...INTENTIONALLY_EMPTY]) {
    assert.ok(
      allowedKinds.has(entry.scope.kind),
      `${entry.table} declares an unknown scope kind "${entry.scope.kind}"`,
    );
    if (entry.scope.kind === 'parent') {
      assert.ok(entry.scope.column.length > 0, `${entry.table} parent scope needs a column`);
      assert.ok(entry.scope.parent.length > 0, `${entry.table} parent scope needs a parent set`);
    }
  }
});

it('the verifier source no longer offers a "count it globally" escape hatch', async () => {
  const raw = await readFile(VERIFIER_FILE, 'utf8');
  // Comments are stripped first: the file legitimately QUOTES the old
  // `scopeColumn: 'none'` when documenting why it was removed, and a guard that
  // cannot tell code from the note explaining the code is a guard nobody can
  // write documentation around.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(
    code,
    /scopeColumn:\s*'none'/,
    "scopeColumn: 'none' counted other teams' rows as demo coverage",
  );
  assert.doesNotMatch(
    code,
    /counted globally/,
    'a check that admits in its own note that it is unscoped must not be a passing check',
  );
});

// ---------------------------------------------------------------------------
// LIE #2 — a query failure reading as a genuine zero.
// ---------------------------------------------------------------------------

it('an EMPTY error message is still an error, not "0 rows"', () => {
  // PostgREST really returns { message: '' } for some gateway failures — the
  // Helm project answered HTTP 522 that way on 2026-07-29 and the old report
  // printed "null row(s)" for every table, then blamed the seed.
  const entry = SURFACE_COVERAGE[0];
  const result = evaluateCoverage(entry, null, '');
  assert.equal(result.pass, false, 'a required surface whose query failed must not pass');
  const line = formatReportLine(result);
  assert.match(line, /\[FAIL\]/);
  assert.match(line, /ERROR \(\)/, 'the line must be rendered as an ERROR, not as a row count');
  assert.doesNotMatch(line, /row\(s\)/, 'a failed query must never be rendered as a row count');
});

it('a query error and a genuine zero are distinguishable in the output', () => {
  const entry = SURFACE_COVERAGE[0];
  const errored = formatReportLine(evaluateCoverage(entry, null, 'connection refused HTTP 522'));
  const emptied = formatReportLine(evaluateCoverage(entry, 0, null));
  assert.match(errored, /ERROR \(connection refused HTTP 522\)/);
  assert.match(emptied, /0 row\(s\)/);
  assert.notEqual(errored, emptied);
});

it('the summary separates "could not verify" from "verified empty"', async () => {
  const source = await readFile(VERIFIER_FILE, 'utf8');
  assert.match(source, /COULD NOT BE VERIFIED/);
  assert.match(source, /verified empty/);
  assert.match(
    source,
    /EVERY check errored/,
    'an all-errors run must say it is a connectivity failure, not a seed gap',
  );
});

it('an aborted run reports unchecked surfaces and never exits 0', async () => {
  const source = await readFile(VERIFIER_FILE, 'utf8');
  assert.match(source, /NEVER CHECKED/, 'surfaces the run skipped must be named as unknown');
  assert.match(
    source,
    /process\.exit\(failed\.length === 0 && abortedAfter === null \? 0 : 1\)/,
    '"I stopped early" must never be reported to a caller as a pass',
  );
});

// ---------------------------------------------------------------------------
// LIE #3 — a green summary over a partial list.
// ---------------------------------------------------------------------------

it('the required list covers every surface the demo has to open', () => {
  const tables = new Set(SURFACE_COVERAGE.map((e) => e.table));
  const mustCover = [
    'baseball_team_members',
    'baseball_events',
    'baseball_practices',
    'baseball_announcements',
    'baseball_travel_itineraries',
    'baseball_documents',
    'baseball_postgame_reviews',
    'baseball_postgame_review_items',
    'baseball_player_timeline_events',
    'baseball_coach_insights',
    'helm_lifting_maxes',
    'helm_lifting_bodyweight_entries',
    'helm_lifting_readiness_checkins',
    'helm_lifting_sessions',
  ];
  for (const table of mustCover) {
    assert.ok(tables.has(table), `${table} is a demo surface and must be verified`);
  }
});

it('every required entry names the seed script that fills it', () => {
  for (const entry of SURFACE_COVERAGE) {
    assert.ok(
      entry.owner && entry.owner.includes('.ts'),
      `${entry.table} must name its seeding script so a failure is actionable`,
    );
  }
});

it('a required surface with zero rows fails; an errored one fails too', () => {
  for (const entry of SURFACE_COVERAGE) {
    assert.equal(entry.required, true, `${entry.table} must be required, not advisory`);
    assert.equal(evaluateCoverage(entry, 0, null).pass, false);
    assert.equal(evaluateCoverage(entry, null, 'boom').pass, false);
    assert.equal(evaluateCoverage(entry, 1, null).pass, true);
  }
});

// ---------------------------------------------------------------------------
// Recruiting sunset.
// ---------------------------------------------------------------------------

it('recruiting tables are never required while the module ships disabled', () => {
  assert.equal(isRecruitingEnabled(), false, 'this guard assumes the sunset is still in force');
  const required = new Set(SURFACE_COVERAGE.map((e) => e.table));
  const mustBeEmpty = new Set(INTENTIONALLY_EMPTY.map((e) => e.table));
  for (const table of ['baseball_watchlists', 'baseball_recruiting_interests']) {
    assert.equal(required.has(table), false, `${table} must not be a required demo surface`);
    assert.ok(mustBeEmpty.has(table), `${table} must be asserted empty`);
  }
});

it('intentionally-empty surfaces never overlap the required list', () => {
  const required = new Set(SURFACE_COVERAGE.map((e) => e.table));
  for (const entry of INTENTIONALLY_EMPTY) {
    assert.equal(
      required.has(entry.table),
      false,
      `${entry.table} is listed as both required and intentionally-empty`,
    );
  }
});
