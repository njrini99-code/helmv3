// @ts-check
/**
 * Per-key credential SHAPE validation — one implementation, three consumers.
 *
 *   scripts/check-helm-bridge-env.mjs   deploy-time env check (CI --drift too)
 *   src/lib/admin/sentry-api.ts          runtime reader
 *   src/lib/admin/vercel-api.ts          runtime reader
 *   src/lib/inngest/credentials.ts       runtime state + Bridge reporter
 *
 * WHY. Every one of the eight Bridge values in the local `.env.local` was
 * exactly 11 characters, which cleared the old `length >= 10` floor and missed
 * the `^(your-|replace-|…)` placeholder regex — so `check-helm-bridge-env`
 * printed PASS over a wall of placeholders, and `sentry-api.ts`'s identical
 * `usableSecret()` treated the same 11-character Sentry token as CONFIGURED,
 * which is why every local Sentry read failed soft and silently
 * (`.claude/rules/shipping.md`, "The Sentry credentials in .env.local are NOT
 * usable"). A length floor is not a shape.
 *
 * This is a `.mjs` on purpose: the script runs under plain `node` and cannot
 * import TypeScript, and the TS readers can import it (allowJs — precedent:
 * `next.config.mjs` importing `src/lib/security/local-supabase-csp.mjs`).
 * A second copy is a second place to rot; the SSRF guard in this repo was
 * hand-copied into two files and stayed broken in both.
 *
 * Shapes, and where each comes from:
 *   - Sentry auth tokens: organization tokens are `sntrys_…`, user tokens
 *     `sntryu_…` (Sentry docs, "Organization Auth Tokens" / "User Auth
 *     Tokens"); legacy tokens are 64 hex characters. Anything else must be at
 *     least 32 characters with no whitespace.
 *   - Sentry DSN: a URL whose host ends in `sentry.io`, carrying the public key
 *     as the URL username and the numeric project id as the path
 *     (`https://<key>@o<org>.ingest.<region>.sentry.io/<project>`).
 *   - Inngest signing key: `signkey-<env>-<hex>` — the SDK itself strips
 *     `/^signkey-[\w]+-/` before hashing (inngest/helpers/strings.js).
 *   - Inngest event key: opaque, long (the live one is 86 characters, no
 *     padding — src/app/api/inngest/route.ts); floor 20.
 *   - Vercel: project ids are `prj_…`, team ids `team_…`, API tokens are
 *     opaque alphanumerics (24 characters when issued); floor 20.
 *   - INTERNAL_LOG_KEY: an app-chosen shared secret; floor 16, no whitespace.
 *
 * Nothing here prints, logs, or returns a value it was not given.
 */

/** Values that are a placeholder by construction, whatever their length. */
export const PLACEHOLDER_PATTERN = /^(your-|replace-|changeme|todo|example|placeholder|xxx+$|<.*>$)/i;

/** @param {unknown} value */
export function isPlaceholder(value) {
  return PLACEHOLDER_PATTERN.test(String(value ?? '').trim());
}

/** @param {string} value */
function noWhitespace(value) {
  return !/\s/.test(value);
}

/** @param {string} value */
export function isSentryAuthToken(value) {
  const v = value.trim();
  if (!noWhitespace(v)) return false;
  if (/^sntry[su]_/.test(v)) return v.length >= 32;
  if (/^[0-9a-f]{64}$/i.test(v)) return true;
  return v.length >= 32;
}

/** @param {string} value */
export function isSentryDsn(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (!(url.hostname === 'sentry.io' || url.hostname.endsWith('.sentry.io'))) return false;
  if (!url.username) return false;
  return /^\/\d+\/?$/.test(url.pathname);
}

/** @param {string} value */
export function isSentrySlug(value) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62})$/.test(value.trim());
}

/** @param {string} value */
export function isVercelApiToken(value) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

/** @param {string} value */
export function isVercelProjectId(value) {
  return /^prj_[A-Za-z0-9]+$/.test(value.trim());
}

/** @param {string} value */
export function isVercelTeamId(value) {
  return /^team_[A-Za-z0-9]+$/.test(value.trim());
}

/** @param {string} value */
export function isInngestSigningKey(value) {
  return /^signkey-[A-Za-z0-9]+-[0-9a-f]{32,}$/i.test(value.trim());
}

/** @param {string} value */
export function isInngestEventKey(value) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

/** @param {string} value */
export function isInternalLogKey(value) {
  const v = value.trim();
  return v.length >= 16 && noWhitespace(v);
}

/**
 * @typedef {'sentry_auth_token' | 'sentry_dsn' | 'sentry_slug' | 'vercel_api_token'
 *   | 'vercel_project_id' | 'vercel_team_id' | 'inngest_signing_key'
 *   | 'inngest_event_key' | 'internal_log_key'} CredentialKind
 */

/** @type {Record<CredentialKind, (value: string) => boolean>} */
const SHAPE_CHECKS = {
  sentry_auth_token: isSentryAuthToken,
  sentry_dsn: isSentryDsn,
  sentry_slug: isSentrySlug,
  vercel_api_token: isVercelApiToken,
  vercel_project_id: isVercelProjectId,
  vercel_team_id: isVercelTeamId,
  inngest_signing_key: isInngestSigningKey,
  inngest_event_key: isInngestEventKey,
  internal_log_key: isInternalLogKey,
};

/** Human wording for a failed shape check. Never includes the value. */
/** @type {Record<CredentialKind, string>} */
export const SHAPE_HINTS = {
  sentry_auth_token: 'expected sntrys_/sntryu_ token, 64-hex legacy token, or >= 32 chars',
  sentry_dsn: 'expected https://<key>@<host>.sentry.io/<project-id>',
  sentry_slug: 'expected a lowercase slug (a-z, 0-9, - or _)',
  vercel_api_token: 'expected an opaque token of >= 20 chars',
  vercel_project_id: 'expected prj_<id>',
  vercel_team_id: 'expected team_<id>',
  inngest_signing_key: 'expected signkey-<env>-<hex>',
  inngest_event_key: 'expected an opaque key of >= 20 chars',
  internal_log_key: 'expected a shared secret of >= 16 chars',
};

/**
 * @typedef {'ok' | 'missing' | 'placeholder' | 'malformed'} CredentialVerdict
 */

/**
 * Classify a raw env value against a kind. Never returns the value.
 * @param {CredentialKind} kind
 * @param {string | undefined | null} value
 * @returns {CredentialVerdict}
 */
export function classifyCredential(kind, value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return 'missing';
  if (isPlaceholder(trimmed)) return 'placeholder';
  return SHAPE_CHECKS[kind](trimmed) ? 'ok' : 'malformed';
}

/**
 * The trimmed value when it passes shape + placeholder checks, else null —
 * the drop-in for the old `usableSecret()` helpers.
 * @param {CredentialKind} kind
 * @param {string | undefined | null} value
 * @returns {string | null}
 */
export function usableCredential(kind, value) {
  return classifyCredential(kind, value) === 'ok' ? String(value).trim() : null;
}
