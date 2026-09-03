/**
 * Synthetic secrets and PII, planted in replay fixtures so their ABSENCE
 * from a built envelope is provable rather than assumed (brief §6: "synthetic
 * sentinel tests must prove secrets and PII are removed").
 *
 * Every value here is fabricated and points at the reserved `.invalid` TLD or
 * an obviously non-functional key shape. Nothing in this file has ever been a
 * real credential, which is why it can sit in the repository at all — and why
 * `.gitleaks.toml` does not need an allowlist entry for it.
 *
 * A sentinel is only useful if the assertion is "this string does not appear
 * ANYWHERE in the persisted record". Asserting a redaction placeholder is
 * present is weaker: a redactor that emits the placeholder AND leaves the
 * original beside it would pass that check.
 */

/** Three base64url segments, header shaped like a real one (`eyJ` = `{"`). */
export const SENTINEL_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXBsYXktZml4dHVyZSJ9.bm90LWEtcmVhbC1zaWduYXR1cmU';

export const SENTINEL_EMAIL = 'replay.sentinel@helm-fixture.invalid';

/** A UUID is never a safe dimension (brief §6), even when it looks harmless. */
export const SENTINEL_UUID = '11111111-2222-3333-4444-555555555555';

export const SENTINEL_SERVICE_KEY_PAIR =
  'service_role_key=sbp_0000000000replayfixture0000000000';

export const SENTINEL_BEARER = 'Bearer 0000000000replayfixturebearer0000';

/** Every sentinel, for a single "none of these survived" assertion. */
export const ALL_SENTINELS: readonly string[] = [
  SENTINEL_JWT,
  SENTINEL_EMAIL,
  SENTINEL_UUID,
  SENTINEL_SERVICE_KEY_PAIR,
  SENTINEL_BEARER,
];

/**
 * Substrings that must not survive either. A redactor that replaced only the
 * full sentinel string but left its distinctive tail behind would pass
 * `ALL_SENTINELS` and still be leaking.
 */
export const SENTINEL_FRAGMENTS: readonly string[] = [
  'bm90LWEtcmVhbC1zaWduYXR1cmU',
  'replay.sentinel',
  'sbp_0000000000replayfixture0000000000',
  '0000000000replayfixturebearer0000',
  '2222-3333-4444',
];
