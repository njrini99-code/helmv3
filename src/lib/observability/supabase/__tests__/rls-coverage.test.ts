import { describe, expect, it } from 'vitest';
import {
  buildRlsCoverageReport,
  findOverPrivilegedDefiners,
  findPoliciesWithoutTests,
  findTablesMissingPolicies,
  type CatalogFunction,
  type CatalogPolicy,
  type CatalogTable,
} from '../rls-coverage';

// Fixture catalog — a small, made-up mirror of the shape
// scripts/db/rls-coverage.mjs would fetch from information_schema/pg_catalog.
const FIXTURE_TABLES: CatalogTable[] = [
  { schema: 'public', table: 'golf_teams', rlsEnabled: true },
  { schema: 'public', table: 'golf_rounds', rlsEnabled: true },
  { schema: 'helm_debug', table: 'db_stat_deltas', rlsEnabled: true },
  { schema: 'public', table: 'no_rls_table', rlsEnabled: false },
];

const FIXTURE_POLICIES: CatalogPolicy[] = [
  { schema: 'public', table: 'golf_teams', policyName: 'golf_teams_select' },
  { schema: 'public', table: 'golf_rounds', policyName: 'golf_rounds_select' },
  // helm_debug.db_stat_deltas deliberately has zero policies (facade-only
  // access) — this is the case findTablesMissingPolicies is expected to
  // still surface, per its own doc comment.
];

const FIXTURE_FUNCTIONS: CatalogFunction[] = [
  { schema: 'public', name: 'helm_debug_stat_statements_snapshot', securityDefiner: true, granteeRoles: ['service_role'] },
  { schema: 'public', name: 'legacy_unsafe_definer', securityDefiner: true, granteeRoles: ['service_role', 'authenticated'] },
  { schema: 'public', name: 'plain_invoker_fn', securityDefiner: false, granteeRoles: ['authenticated'] },
];

// Deliberately omits any reference to golf_rounds, so
// findPoliciesWithoutTests can flag it.
const FIXTURE_TEST_FILES: string[] = ['select * from golf_teams where id = 1;'];

describe('findTablesMissingPolicies', () => {
  it('flags an RLS-enabled table with zero policies', () => {
    const findings = findTablesMissingPolicies(FIXTURE_TABLES, FIXTURE_POLICIES);
    expect(findings).toEqual([{ schema: 'helm_debug', table: 'db_stat_deltas' }]);
  });

  it('does not flag a table with RLS disabled', () => {
    const findings = findTablesMissingPolicies(FIXTURE_TABLES, FIXTURE_POLICIES);
    expect(findings.some((f) => f.table === 'no_rls_table')).toBe(false);
  });

  it('does not flag a table that has at least one policy', () => {
    const findings = findTablesMissingPolicies(FIXTURE_TABLES, FIXTURE_POLICIES);
    expect(findings.some((f) => f.table === 'golf_teams')).toBe(false);
  });
});

describe('findOverPrivilegedDefiners', () => {
  it('flags a public SECURITY DEFINER function grantable to authenticated', () => {
    const findings = findOverPrivilegedDefiners(FIXTURE_FUNCTIONS);
    expect(findings).toEqual([
      { schema: 'public', name: 'legacy_unsafe_definer', grantedTo: ['authenticated'] },
    ]);
  });

  it('does not flag a definer function granted only to service_role', () => {
    const findings = findOverPrivilegedDefiners(FIXTURE_FUNCTIONS);
    expect(findings.some((f) => f.name === 'helm_debug_stat_statements_snapshot')).toBe(false);
  });

  it('does not flag a non-definer function even if granted to authenticated', () => {
    const findings = findOverPrivilegedDefiners(FIXTURE_FUNCTIONS);
    expect(findings.some((f) => f.name === 'plain_invoker_fn')).toBe(false);
  });
});

describe('findPoliciesWithoutTests', () => {
  it('flags a policy whose table is never mentioned in any test file', () => {
    const findings = findPoliciesWithoutTests(FIXTURE_POLICIES, FIXTURE_TEST_FILES);
    expect(findings).toEqual([{ schema: 'public', table: 'golf_rounds', policyName: 'golf_rounds_select' }]);
  });

  it('does not flag a policy whose table appears in a test file', () => {
    const findings = findPoliciesWithoutTests(FIXTURE_POLICIES, FIXTURE_TEST_FILES);
    expect(findings.some((f) => f.table === 'golf_teams')).toBe(false);
  });

  it('matches on a whole word, not a substring of a longer identifier', () => {
    const findings = findPoliciesWithoutTests(
      [{ schema: 'public', table: 'golf_teams', policyName: 'p' }],
      ['select * from golf_teams_public_profile;'],
    );
    expect(findings).toHaveLength(1);
  });
});

describe('buildRlsCoverageReport', () => {
  it('assembles all three findings with matching counts', () => {
    const report = buildRlsCoverageReport(
      FIXTURE_TABLES,
      FIXTURE_POLICIES,
      FIXTURE_FUNCTIONS,
      FIXTURE_TEST_FILES,
      new Date('2026-09-06T00:00:00.000Z'),
    );
    expect(report.generatedAt).toBe('2026-09-06T00:00:00.000Z');
    expect(report.counts).toEqual({
      tablesMissingPolicies: 1,
      overPrivilegedDefiners: 1,
      policiesWithoutTests: 1,
    });
  });
});
