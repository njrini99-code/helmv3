import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  getCalendarWeekBounds,
  isWithinWeek,
  parseDeploymentLedger,
  summarizeBudget,
} from '../../../scripts/release/lib/release-common.mjs';

/**
 * spec §16 (docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md) and
 * spec §35's control-plane test list: "Release: 0/1/2 deployments -> 2/1/0
 * slots; >=2 -> routine deploy BLOCK."
 *
 * Coverage here is split in two layers on purpose:
 *   - Pure-function tests against release-common.mjs exports (fast, no
 *     subprocess) for the calendar-week math and ledger parsing specifically,
 *     because those are exactly the class of bug (BSD-sed traps,
 *     absolute-path traps) that reads as correct and is wrong in a way only
 *     execution reveals.
 *   - CLI-level tests that spawn `scripts/release/check-release-budget.mjs`
 *     against a real temp git repo, asserting the actual $? a human or a
 *     CI job would see — a passing unit test on the library is not evidence
 *     the entrypoint wires it correctly (see `src/test/hooks/guard-bash-worktree.test.ts`'s
 *     own header: "a guard that cannot fire is worse than no guard").
 * Every CLI invocation passes --no-vercel so these tests are fast and
 * network-free; the budget count never depends on Vercel being reachable.
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const BUDGET_SCRIPT = resolve(REPO_ROOT, 'scripts/release/check-release-budget.mjs');

// ---------------------------------------------------------------------------
// Pure-function coverage
// ---------------------------------------------------------------------------

describe('getCalendarWeekBounds — America/New_York, Monday-Sunday', () => {
  it('buckets a plain midweek instant into Monday 00:00 ET .. next Monday 00:00 ET', () => {
    // 2026-08-19 is a Wednesday, safely away from any DST transition.
    const bounds = getCalendarWeekBounds(new Date('2026-08-19T15:00:00Z'), 'America/New_York');
    // Monday 2026-08-17 00:00 America/New_York = 2026-08-17T04:00:00Z (EDT, UTC-4 in August).
    expect(bounds.start.toISOString()).toBe('2026-08-17T04:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-24T04:00:00.000Z');
  });

  it('places an instant one minute before the Monday-ET boundary in the PRECEDING week', () => {
    const bounds = getCalendarWeekBounds(new Date('2026-08-17T03:59:00Z'), 'America/New_York'); // Sun 23:59 ET
    expect(bounds.start.toISOString()).toBe('2026-08-10T04:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-17T04:00:00.000Z');
  });

  it('places an instant one minute after the Monday-ET boundary in the NEW week', () => {
    const bounds = getCalendarWeekBounds(new Date('2026-08-17T04:01:00Z'), 'America/New_York'); // Mon 00:01 ET
    expect(bounds.start.toISOString()).toBe('2026-08-17T04:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-24T04:00:00.000Z');
  });
});

describe('isWithinWeek', () => {
  const bounds = getCalendarWeekBounds(new Date('2026-08-19T15:00:00Z'), 'America/New_York');

  it('includes the start instant (inclusive lower bound)', () => {
    expect(isWithinWeek(new Date('2026-08-17T04:00:00Z'), bounds)).toBe(true);
  });

  it('excludes the end instant (exclusive upper bound — it belongs to the NEXT week)', () => {
    expect(isWithinWeek(new Date('2026-08-24T04:00:00Z'), bounds)).toBe(false);
  });

  it('excludes an instant one second before the start', () => {
    expect(isWithinWeek(new Date('2026-08-17T03:59:59Z'), bounds)).toBe(false);
  });
});

describe('parseDeploymentLedger', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty, non-crashing result when the ledger file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-missing-'));
    const result = parseDeploymentLedger(dir);
    expect(result.sourceExists).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it('parses valid rows and skips a row with an unparseable date_utc instead of crashing', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-malformed-'));
    mkdirSync(join(dir, 'memory/ledgers'), { recursive: true });
    writeFileSync(
      join(dir, 'memory/ledgers/deployments.md'),
      [
        '| date_utc | sha | short_sha | vercel_deployment_id | type | initiated_by | notes |',
        '|---|---|---|---|---|---|---|',
        '| not-a-date | zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz | zzzzzzz | dpl_bad | routine | test | malformed |',
        '| 2026-08-18T12:00:00Z | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | aaaaaaa | dpl_one | routine | test | valid |',
        '',
      ].join('\n'),
    );
    const result = parseDeploymentLedger(dir);
    expect(result.sourceExists).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sha).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});

// ---------------------------------------------------------------------------
// summarizeBudget — the exact fixture spec §35 asks for: 0/1/2 deploys ->
// 2/1/0 slots, block at 2.
// ---------------------------------------------------------------------------

describe('summarizeBudget — 0/1/2 deploys this week -> 2/1/0 slots', () => {
  const now = new Date('2026-08-19T15:00:00Z'); // Wednesday, inside the fixed week used above
  const policy = { production: { routine_max_deploys_per_calendar_week: 2, timezone: 'America/New_York' } };

  function entryAt(iso: string, sha: string) {
    return { date: new Date(iso), sha, date_utc: iso, vercel_deployment_id: `dpl_${sha}`, type: 'routine' };
  }

  it('0 deploys this week -> 2 slots remaining, not at cap', () => {
    const budget = summarizeBudget({ entries: [], policy, now });
    expect(budget.deploysThisWeek).toBe(0);
    expect(budget.routineSlotsRemaining).toBe(2);
    expect(budget.atOrOverCap).toBe(false);
  });

  it('1 deploy this week -> 1 slot remaining, not at cap', () => {
    const entries = [entryAt('2026-08-18T12:00:00Z', 'a')];
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(1);
    expect(budget.routineSlotsRemaining).toBe(1);
    expect(budget.atOrOverCap).toBe(false);
  });

  it('2 deploys this week -> 0 slots remaining, AT CAP', () => {
    const entries = [entryAt('2026-08-17T12:00:00Z', 'a'), entryAt('2026-08-20T09:00:00Z', 'b')];
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(2);
    expect(budget.routineSlotsRemaining).toBe(0);
    expect(budget.atOrOverCap).toBe(true);
  });

  it('does not count a deploy from a DIFFERENT calendar week', () => {
    const entries = [entryAt('2026-08-10T12:00:00Z', 'a')]; // the preceding Mon-Sun week
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(0);
    expect(budget.routineSlotsRemaining).toBe(2);
  });

  it('never reports a negative slot count when deploys exceed the cap', () => {
    // 01:00 UTC would still be Sunday night in America/New_York (UTC-4 in
    // August) — before the Monday-00:00-ET week boundary. Use a safely
    // midday UTC time so all three land inside the target week.
    const entries = [entryAt('2026-08-17T12:00:00Z', 'a'), entryAt('2026-08-18T12:00:00Z', 'b'), entryAt('2026-08-19T12:00:00Z', 'c')];
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(3);
    expect(budget.routineSlotsRemaining).toBe(0);
    expect(budget.atOrOverCap).toBe(true);
  });

  it('COUNTS a deploy with sha: unknown toward the cap — a deploy is a deploy, provenance is a separate concern', () => {
    const entries = [
      { date: new Date('2026-08-18T12:00:00Z'), sha: 'unknown', date_utc: '2026-08-18T12:00:00Z', vercel_deployment_id: 'dpl_a', type: 'routine' },
      entryAt('2026-08-19T12:00:00Z', 'b'), // a normal, known-sha entry alongside it
    ];
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(2);
    expect(budget.routineSlotsRemaining).toBe(0);
    expect(budget.atOrOverCap).toBe(true);
    expect(budget.unknownShaCount).toBe(1);
  });

  it('two unknown-sha deploys alone are enough to exhaust the budget, exactly like two known-sha ones', () => {
    const entries = [
      { date: new Date('2026-08-17T12:00:00Z'), sha: 'unknown', date_utc: '2026-08-17T12:00:00Z', vercel_deployment_id: 'dpl_a', type: 'routine' },
      { date: new Date('2026-08-18T12:00:00Z'), sha: 'unknown', date_utc: '2026-08-18T12:00:00Z', vercel_deployment_id: 'dpl_b', type: 'routine' },
    ];
    const budget = summarizeBudget({ entries, policy, now });
    expect(budget.deploysThisWeek).toBe(2);
    expect(budget.atOrOverCap).toBe(true);
    expect(budget.unknownShaCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CLI-level: the actual exit code a routine release workflow branches on.
// ---------------------------------------------------------------------------

function makeFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'release-budget-cli-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  mkdirSync(join(dir, 'memory/ledgers'), { recursive: true });
  mkdirSync(join(dir, 'config'), { recursive: true });
  writeFileSync(
    join(dir, 'config/release-policy.yml'),
    'version: 1\nproduction:\n  routine_max_deploys_per_calendar_week: 2\n  timezone: America/New_York\n',
  );
  return dir;
}

function writeLedger(dir: string, rows: string[]) {
  const header = [
    '| date_utc | sha | short_sha | vercel_deployment_id | type | initiated_by | notes |',
    '|---|---|---|---|---|---|---|',
  ];
  writeFileSync(join(dir, 'memory/ledgers/deployments.md'), [...header, ...rows, ''].join('\n'));
}

function runBudgetCli(dir: string, now: string): { status: number; json: Record<string, unknown> } {
  try {
    const out = execFileSync('node', [BUDGET_SCRIPT, '--no-vercel', '--json', '--now', now], {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, json: JSON.parse(out) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? -1, json: JSON.parse(e.stdout ?? '{}') };
  }
}

describe('check-release-budget.mjs — CLI exit code', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 with 0 deploys this week (header-only ledger)', () => {
    dir = makeFixtureRepo();
    writeLedger(dir, []);
    const { status, json } = runBudgetCli(dir, '2026-08-19T15:00:00Z');
    expect(status).toBe(0);
    expect(json.deploysThisWeek).toBe(0);
    expect(json.routineSlotsRemaining).toBe(2);
  });

  it('exits 0 with 1 deploy this week', () => {
    dir = makeFixtureRepo();
    writeLedger(dir, ['| 2026-08-18T12:00:00Z | ' + 'a'.repeat(40) + ' | aaaaaaa | dpl_one | routine | test | first |']);
    const { status, json } = runBudgetCli(dir, '2026-08-19T15:00:00Z');
    expect(status).toBe(0);
    expect(json.deploysThisWeek).toBe(1);
    expect(json.routineSlotsRemaining).toBe(1);
  });

  it('exits 1 (BLOCK) with 2 deploys already this week', () => {
    dir = makeFixtureRepo();
    writeLedger(dir, [
      '| 2026-08-17T12:00:00Z | ' + 'a'.repeat(40) + ' | aaaaaaa | dpl_one | routine | test | first |',
      '| 2026-08-20T09:00:00Z | ' + 'b'.repeat(40) + ' | bbbbbbb | dpl_two | routine | test | second |',
    ]);
    const { status, json } = runBudgetCli(dir, '2026-08-21T15:00:00Z');
    expect(status).toBe(1);
    expect(json.deploysThisWeek).toBe(2);
    expect(json.routineSlotsRemaining).toBe(0);
    expect(json.atOrOverCap).toBe(true);
  });

  it('exits 0 (adoption-day default) when the ledger file does not exist at all', () => {
    dir = makeFixtureRepo();
    // no memory/ledgers/deployments.md written
    const { status, json } = runBudgetCli(dir, '2026-08-19T15:00:00Z');
    expect(status).toBe(0);
    expect(json.deploysThisWeek).toBe(0);
    expect(json.ledgerSource).toMatch(/default-empty/);
  });

  // Fixed interface (commander decision, relayed via team-lead): P4's
  // scripts/operations/report.mjs calls this script with --json and reads
  // deploys_this_week / routine_slots_remaining at the TOP LEVEL — snake_case,
  // not the camelCase this script also emits for its own/other consumers.
  it('--json output includes deploys_this_week and routine_slots_remaining at the top level (P4 report.mjs interface)', () => {
    dir = makeFixtureRepo();
    writeLedger(dir, ['| 2026-08-18T12:00:00Z | ' + 'a'.repeat(40) + ' | aaaaaaa | dpl_one | routine | test | first |']);
    const { status, json } = runBudgetCli(dir, '2026-08-19T15:00:00Z');
    expect(status).toBe(0);
    expect(json.deploys_this_week).toBe(1);
    expect(json.routine_slots_remaining).toBe(1);
    // Both spellings must agree — one is not a stale copy of the other.
    expect(json.deploys_this_week).toBe(json.deploysThisWeek);
    expect(json.routine_slots_remaining).toBe(json.routineSlotsRemaining);
  });

  it('a deploy with sha: unknown still counts and can still trigger the block — matches the real seeded ledger scenario', () => {
    dir = makeFixtureRepo();
    writeLedger(dir, [
      '| 2026-08-17T13:17:00Z | unknown | unknown | helmv3-bnlc2wvx5 | routine | unknown | backfilled, sha not captured |',
      '| 2026-08-18T18:10:00Z | unknown | unknown | helmv3-4ildzo7g3 | routine | unknown | backfilled, sha not captured |',
    ]);
    const { status, json } = runBudgetCli(dir, '2026-08-19T15:00:00Z');
    expect(status).toBe(1); // blocked, exactly as if the SHAs were known
    expect(json.deploysThisWeek).toBe(2);
    expect(json.deploys_this_week).toBe(2);
    expect(json.routineSlotsRemaining).toBe(0);
    expect(json.unknownShaCount).toBe(2);
  });
});
