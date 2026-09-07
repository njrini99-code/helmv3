/**
 * Pure RLS/grant coverage logic for `scripts/db/rls-coverage.mjs` (D5 task
 * 3). No I/O — the script fetches the Postgres catalog and the pgTAP test
 * file contents, then hands plain objects to the three functions below.
 * Kept here (not inline in the .mjs) so it is importable from a vitest
 * fixture test without a live database.
 */

export interface CatalogTable {
  schema: string;
  table: string;
  rlsEnabled: boolean;
}

export interface CatalogPolicy {
  schema: string;
  table: string;
  policyName: string;
}

export interface CatalogFunction {
  schema: string;
  name: string;
  /** true only for `SECURITY DEFINER` functions — an invoker-rights
   *  function runs as the caller and is not this finding's concern. */
  securityDefiner: boolean;
  /** Roles holding EXECUTE, from `information_schema.role_routine_grants`
   *  or `has_function_privilege`. */
  granteeRoles: string[];
}

export interface MissingPolicyFinding {
  schema: string;
  table: string;
}

/** RLS enabled, zero policies — every row is denied to everyone including
 *  the owner's normal queries UNLESS the table is read exclusively through
 *  a SECURITY DEFINER facade (the pattern every `helm_debug` table in this
 *  repo uses deliberately). This finding does not distinguish the two
 *  cases — it is a census, and the Bridge/PR body caller is expected to
 *  read each row and note the deliberate ones, same as `HELD.md` does for
 *  migrations. */
export function findTablesMissingPolicies(
  tables: readonly CatalogTable[],
  policies: readonly CatalogPolicy[],
): MissingPolicyFinding[] {
  const withPolicy = new Set(policies.map((p) => `${p.schema}.${p.table}`));
  return tables
    .filter((t) => t.rlsEnabled && !withPolicy.has(`${t.schema}.${t.table}`))
    .map((t) => ({ schema: t.schema, table: t.table }));
}

export interface OverPrivilegedDefinerFinding {
  schema: string;
  name: string;
  grantedTo: string[];
}

/** A `public` schema SECURITY DEFINER function still EXECUTE-able by
 *  `authenticated` or `anon` bypasses RLS for whoever holds either role —
 *  exactly the grant shape `.claude/rules/database.md` requires be paired
 *  with a REVOKE. `helm_debug`-schema facades are intentionally excluded:
 *  those are reviewed by the ACL tripwire in their own migration, and this
 *  finding exists to catch the ones that have NO such tripwire. */
export function findOverPrivilegedDefiners(functions: readonly CatalogFunction[]): OverPrivilegedDefinerFinding[] {
  const riskyRoles = new Set(['anon', 'authenticated']);
  return functions
    .filter((f) => f.securityDefiner && f.schema === 'public' && f.granteeRoles.some((r) => riskyRoles.has(r)))
    .map((f) => ({
      schema: f.schema,
      name: f.name,
      grantedTo: f.granteeRoles.filter((r) => riskyRoles.has(r)),
    }));
}

export interface UntestedPolicyFinding {
  schema: string;
  table: string;
  policyName: string;
}

/**
 * A policy whose table name never appears (as a whole word) in any pgTAP
 * test file under `supabase/tests/rls/`. Matches by TABLE name against
 * file CONTENTS rather than filename — this repo's test filenames are
 * feature-shaped (`baseball_coach_notes.sql`), not table-shaped, but every
 * test's SQL body references the table it exercises literally.
 */
export function findPoliciesWithoutTests(
  policies: readonly CatalogPolicy[],
  testFileContents: readonly string[],
): UntestedPolicyFinding[] {
  const combined = testFileContents.join('\n');
  const testedTables = new Set<string>();
  // Cache which tables the combined corpus mentions, computed once per
  // distinct table rather than once per policy.
  const tableNames = new Set(policies.map((p) => p.table));
  for (const table of tableNames) {
    const wordBoundary = new RegExp(`\\b${escapeRegExp(table)}\\b`);
    if (wordBoundary.test(combined)) testedTables.add(table);
  }

  return policies
    .filter((p) => !testedTables.has(p.table))
    .map((p) => ({ schema: p.schema, table: p.table, policyName: p.policyName }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RlsCoverageReport {
  generatedAt: string;
  tablesMissingPolicies: MissingPolicyFinding[];
  overPrivilegedDefiners: OverPrivilegedDefinerFinding[];
  policiesWithoutTests: UntestedPolicyFinding[];
  counts: {
    tablesMissingPolicies: number;
    overPrivilegedDefiners: number;
    policiesWithoutTests: number;
  };
}

export function buildRlsCoverageReport(
  tables: readonly CatalogTable[],
  policies: readonly CatalogPolicy[],
  functions: readonly CatalogFunction[],
  testFileContents: readonly string[],
  now: Date = new Date(),
): RlsCoverageReport {
  const tablesMissingPolicies = findTablesMissingPolicies(tables, policies);
  const overPrivilegedDefiners = findOverPrivilegedDefiners(functions);
  const policiesWithoutTests = findPoliciesWithoutTests(policies, testFileContents);

  return {
    generatedAt: now.toISOString(),
    tablesMissingPolicies,
    overPrivilegedDefiners,
    policiesWithoutTests,
    counts: {
      tablesMissingPolicies: tablesMissingPolicies.length,
      overPrivilegedDefiners: overPrivilegedDefiners.length,
      policiesWithoutTests: policiesWithoutTests.length,
    },
  };
}
