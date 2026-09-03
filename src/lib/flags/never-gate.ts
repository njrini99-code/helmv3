import type { FlagDefinition } from './types';

/**
 * NEVER-GATE list (owner-approved, ADR 2026-09-03-control-plane-owner-
 * decisions.md, `FEATURE_FLAG_INFRASTRUCTURE_NET_NEW`): a flag may never
 * gate auth, RLS, tenancy, membership, or required persistence.
 *
 * Enforcement point: `scripts/flags/lib.mjs#neverGateViolations` (the
 * generator refuses to write `registry.generated.ts` while a violation
 * exists) and, independently, `scripts/check-feature-flags.mjs` (so a
 * hand-edited generated file cannot bypass the rule — see
 * `docs/CLAUDE.md`/shipping.md §1: "a DO NOT EDIT stamp is not evidence of
 * correctness"). This module is the single TypeScript source of truth for
 * the keyword list; `scripts/flags/lib.mjs` mirrors it verbatim because
 * Node scripts here run un-transpiled and cannot import `.ts` directly.
 * `src/lib/flags/__tests__/never-gate.test.ts` and
 * `scripts/flags/__tests__/lib.test.mjs` both assert against the same
 * fixture data so the two copies cannot drift silently.
 *
 * Matching is a case-insensitive substring match over a vocabulary of auth,
 * authorization/tenancy and persistence terms (synonyms included: login,
 * session, sso, password, credential, policy, role, save, submit, ...),
 * biasing toward REJECTING a flag
 * whose purpose merely mentions one of these concepts in passing. That
 * mirrors this repo's stated risk philosophy (`docs/ai-system/
 * CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §F.7: "a risk score
 * wrong in the low direction is dangerous; wrong in the high direction is
 * merely annoying"). A legitimate flag whose purpose text collides with a
 * fragment (e.g. "author") should be reworded, not exempted.
 */
export const NEVER_GATE_KEYWORDS = [
  // Authentication and session identity
  'auth', 'login', 'log_in', 'log-in', 'signin', 'sign_in', 'sign-in', 'signup', 'sign_up', 'sign-up',
  'logout', 'session', 'sso', 'oauth', 'oidc', 'saml', 'password', 'passcode', 'credential', 'token',
  'mfa', '2fa', 'otp', 'magic_link', 'magic-link', 'access_code', 'access-code', 'jwt', 'cookie',
  // Authorization, tenancy and membership
  'rls', 'row_level', 'row-level', 'row level', 'policy', 'policies', 'permission', 'role', 'rbac',
  'tenan', 'tenant', 'org_', 'organization', 'membership', 'member', 'team_scope', 'super_admin', 'superadmin',
  // Required persistence
  'persist', 'durable', 'autosave', 'auto_save', 'auto-save', 'save', 'submit', 'write_path', 'write-path', 'commit',
] as const;

export interface NeverGateHit {
  keyword: (typeof NEVER_GATE_KEYWORDS)[number];
  field: 'feature_id' | 'purpose';
}

/**
 * Returns every NEVER-GATE keyword hit against a flag's `feature_id` and
 * `purpose`, or an empty array when clean. Checking both fields (not just
 * `purpose`) catches a flag id like `auth_bypass_toggle` even if its prose
 * purpose is worded around the word.
 */
export function neverGateHits(
  def: Pick<FlagDefinition, 'feature_id' | 'purpose'>,
): NeverGateHit[] {
  const hits: NeverGateHit[] = [];
  for (const field of ['feature_id', 'purpose'] as const) {
    const haystack = def[field].toLowerCase();
    for (const keyword of NEVER_GATE_KEYWORDS) {
      if (haystack.includes(keyword)) {
        hits.push({ keyword, field });
      }
    }
  }
  return hits;
}
