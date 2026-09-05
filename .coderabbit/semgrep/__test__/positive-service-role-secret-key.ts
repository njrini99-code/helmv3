// Positive fixture for the `helmv3-no-service-role-key` (ast-grep) /
// `helmv3-service-role-outside-admin` (semgrep) rules. This file MUST fire
// on BOTH the legacy and the new-format env var — it simulates a
// service-role/secret key read reaching a path outside the admin allowlist
// (Phase 2 / P6: the new sb_secret_... key bypasses RLS exactly like the
// legacy service-role JWT it is replacing, so the rule must catch both).
//
// Never import real client code here; this file exists only to be scanned
// by the Review Gate's rule packs, never executed. Excluded from the real
// CI scans (review-gate.yml greps out `.coderabbit/(semgrep|ast-grep)/__test__/`)
// and scanned only by scripts/__tests__/review-gate-rules.test.mjs.

export function leakedKeys() {
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const modern = process.env.SUPABASE_SECRET_KEY;
  return { legacy, modern };
}
