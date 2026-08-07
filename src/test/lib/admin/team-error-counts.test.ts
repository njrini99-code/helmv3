/**
 * "Errors in the last 7 days" must be resolved the one honest way.
 *
 * Measured on production 2026-08-06: `admin_events.team_id` is populated on 7
 * of 1,116 error rows in a week, and on ZERO rows of error-or-worse severity.
 * Every Bridge surface that showed a team's weekly error count keyed on that
 * column alone, so all three read 0 for EVERY golf team while the same week
 * resolved through the roster to Demo University 11, Guilford 9, Shenandoah
 * Women's 9, Shenandoah 3. TeamHealthTable paints its leader wash on
 * `health === 'active' && errors7d === 0`, so the board badged the three worst
 * teams as its cleanest, and computeTeamGrade handed them an 'A'.
 *
 * The first test below is a STRUCTURAL guard, and it is the one that matters
 * most: a shared resolver that exists but has no callers fixes nothing, and
 * nothing else in the suite would notice. It failed before the call sites were
 * repointed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MODULE_DIR = path.join(process.cwd(), 'src/lib/admin/data');

/** Every module that renders a per-team weekly error count. */
const TEAM_ERROR_CONSUMERS = [
  'golf.ts', // TeamHealthTable on /admin/golf
  'users.ts', // team rows on /admin/users
  'team-page-extras.ts', // errors7d KPI + computeTeamGrade on /admin/teams/[id]
];

describe('every team-error surface goes through the shared resolver', () => {
  it.each(TEAM_ERROR_CONSUMERS)('%s calls resolveTeamErrorCounts', (file) => {
    const src = fs.readFileSync(path.join(MODULE_DIR, file), 'utf8');
    expect(src).toContain('resolveTeamErrorCounts');
  });

  it.each(TEAM_ERROR_CONSUMERS)(
    '%s no longer counts admin_events by team_id alone',
    (file) => {
      const src = fs.readFileSync(path.join(MODULE_DIR, file), 'utf8');
      // Strip comments first — this file's own explanatory prose names the
      // pattern it forbids, and so does each call site's. Without this the
      // assertion matches a comment and fails on correct code.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      // The specific dead query: an admin_events read narrowed to team_id.
      // The dead attribution took TWO shapes, and a guard for only one of them
      // would have passed on two of these three files before the fix:
      //   1. narrowing the query   (.eq('team_id', id))        — team-page-extras
      //   2. bucketing rows in JS  (errorCounts.set(tid, …))   — golf, users
      const narrowsQueryByTeamId =
        /from\(['"]admin_events['"]\)[\s\S]{0,400}?\.eq\(\s*['"]team_id['"]/.test(code);
      const bucketsRowsByTeamId = /errorCounts\.set\(/.test(code);
      expect(
        narrowsQueryByTeamId || bucketsRowsByTeamId,
        `${file} still attributes errors by admin_events.team_id, which is set on ` +
          `7 of 1,116 weekly error rows and on 0 error-severity rows. Use ` +
          `resolveTeamErrorCounts.`,
      ).toBe(false);
    },
  );

  it('both guards are non-vacuous — each fires on the shape it forbids', () => {
    const narrowedQuery = `
      const res = await admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', input.teamId)
        .eq('event_type', 'error');
    `;
    const jsBucketing = `
      const errorCounts = new Map<string, number>();
      for (const e of errorRes.data ?? []) {
        const tid = (e as { team_id: string | null }).team_id;
        if (tid) errorCounts.set(tid, (errorCounts.get(tid) ?? 0) + 1);
      }
    `;
    expect(
      /from\(['"]admin_events['"]\)[\s\S]{0,400}?\.eq\(\s*['"]team_id['"]/.test(narrowedQuery),
    ).toBe(true);
    expect(/errorCounts\.set\(/.test(jsBucketing)).toBe(true);
  });
});

describe('resolveTeamErrorCounts contract', () => {
  it('seeds every requested team so a caller can trust a 0', async () => {
    // A missing key and a genuine zero are different claims. Seeding means the
    // map always answers for every id passed in — callers reading
    // `map.get(id) ?? 0` can never silently turn "the resolver skipped this
    // team" into "this team is clean".
    const src = fs.readFileSync(path.join(MODULE_DIR, 'team-scope.ts'), 'utf8');
    expect(src).toMatch(/for \(const id of teamIds\) eventIdsByTeam\.set\(id, new Set<string>\(\)\)/);
  });

  it('counts into a Set, so the two attribution paths union rather than sum', () => {
    // A row that is BOTH team-tagged and user-resolved for the same team is one
    // incident, not two. Summing two counts would double it.
    const src = fs.readFileSync(path.join(MODULE_DIR, 'team-scope.ts'), 'utf8');
    expect(src).toContain('Map<string, Set<string>>');
    expect(src).toMatch(/eventIdsByTeam\.get\([\s\S]{0,40}?\)\?\.add\(row\.id\)/);
  });

  it('throws rather than returning a short map on a read failure', () => {
    // A swallowed error here renders as "this team is clean" — the single most
    // misleading thing this function could say, and the exact failure class the
    // rest of this sweep removed.
    const src = fs.readFileSync(path.join(MODULE_DIR, 'team-scope.ts'), 'utf8');
    expect(src).toMatch(/throw new Error\(`resolveTeamErrorCounts: /);
  });

  it('filters to incident severities, so it agrees with the incident feed', () => {
    // ~94% of `event_type='error'` rows are severity 'info' narration. Counting
    // those would make every team look catastrophic instead of clean — the same
    // bug inverted.
    const src = fs.readFileSync(path.join(MODULE_DIR, 'team-scope.ts'), 'utf8');
    expect(src).toContain('INCIDENT_SEVERITIES');
    expect(src).toContain('excludeAuthNoise');
  });
});
