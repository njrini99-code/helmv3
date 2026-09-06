/* global process */
// @ts-check
/**
 * Supabase API key resolver — new-format keys first, legacy JWTs as
 * fallback. One implementation, every Supabase client in this repo.
 *
 * WHY. Vercel production now carries the new-format keys
 * (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_…` — and
 * `SUPABASE_SECRET_KEY` — `sb_secret_…`) alongside the legacy JWT pair
 * (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`), one of
 * which is leaked in git history. `@supabase/supabase-js` (2.112.4 here)
 * accepts a publishable key wherever the anon key went and a secret key
 * wherever the service-role key went, so the owner can rotate the LEGACY
 * pair off without touching the JWT signing secret or logging anyone out —
 * provided every reader in this repo checks the new name FIRST and falls
 * back to the legacy one, which is what this module centralizes.
 *
 * This is a `.mjs` on purpose, same reasoning as
 * `src/lib/admin/credential-shape.mjs`: `scripts/check-required-env.mjs`
 * runs under plain `node` at build time and cannot import TypeScript, and
 * every TS reader in this repo can import a `.mjs` via `allowJs`
 * (precedent: `src/lib/admin/sentry-api.ts` / `vercel-api.ts` import
 * `credential-shape.mjs`). A second copy of the four env-var names is a
 * second place for the precedence to rot.
 *
 * EDGE RUNTIME. `src/lib/supabase/middleware.ts` runs on the Edge Runtime,
 * and `getPublishableKey()` / `tryGetPublishableKey()` end up bundled into
 * both that and the browser bundle (`client.ts`). Both bundlers resolve
 * `process.env.NEXT_PUBLIC_X` by literal, per-file static text match at
 * build time — they do NOT provide a generic runtime `process.env` object
 * client-side, and Edge Runtime only ships the specific literals it found.
 * A helper that took an env-var NAME as a parameter and read
 * `process.env[name]` would not be found by that scan and would silently
 * resolve to `undefined` in both the browser and on the Edge Runtime. Every
 * exported function below therefore spells out
 * `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` /
 * `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` as literal member
 * expressions — do not refactor that into a shared helper that takes the
 * var name as a string. `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
 * have no such constraint today (every caller runs on the Node.js runtime),
 * but the same literal style is kept for both so nothing breaks silently if
 * one is ever called from an Edge Runtime route.
 *
 * REVIEW GATE. This file legitimately references
 * `process.env.SUPABASE_SERVICE_ROLE_KEY` / `process.env.SUPABASE_SECRET_KEY`
 * as the sanctioned single place both names are read together, so it is
 * allowlisted (as `src/lib/supabase/keys*`) alongside `admin*` / `service*`
 * in `.coderabbit/semgrep/helmv3.yml` and in the ast-grep path scoping in
 * `.github/workflows/review-gate.yml` (mirrored in
 * `scripts/__tests__/review-gate-rules.test.mjs`). Do not add a new
 * SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY reader anywhere else
 * without checking those three files first.
 */

/** New-format browser-safe key. Checked first. */
export const PUBLISHABLE_KEY_ENV = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
/** Legacy anon-key JWT. Fallback for the publishable key. */
export const LEGACY_ANON_KEY_ENV = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
/** New-format server-only key. Checked first. */
export const SECRET_KEY_ENV = 'SUPABASE_SECRET_KEY';
/** Legacy service-role JWT. Fallback for the secret key. */
export const LEGACY_SERVICE_ROLE_KEY_ENV = 'SUPABASE_SERVICE_ROLE_KEY';

/**
 * The publishable (browser-safe) Supabase key: `sb_publishable_…` if set,
 * else the legacy anon JWT. Throws naming BOTH env names when neither is
 * set — there is no third fallback for a caller to try.
 * @returns {string}
 */
export function getPublishableKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      `Neither ${PUBLISHABLE_KEY_ENV} nor ${LEGACY_ANON_KEY_ENV} is set. Check Vercel env.`
    );
  }
  return key;
}

/**
 * The secret (server-only) Supabase key: `sb_secret_…` if set, else the
 * legacy service-role JWT. Throws naming BOTH env names when neither is
 * set. Never call this from code that ships to the browser — see the
 * REVIEW GATE note above.
 * @returns {string}
 */
export function getSecretKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      `Neither ${SECRET_KEY_ENV} nor ${LEGACY_SERVICE_ROLE_KEY_ENV} is set. Check Vercel env.`
    );
  }
  return key;
}

/**
 * Non-throwing publishable-key lookup for a caller that must classify
 * absence itself instead of throwing.
 * @returns {{ key: string | null, missing: string | null }}
 */
export function tryGetPublishableKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null;
  return key
    ? { key, missing: null }
    : { key: null, missing: `${PUBLISHABLE_KEY_ENV} or ${LEGACY_ANON_KEY_ENV}` };
}

/**
 * Non-throwing secret-key lookup for a caller that must classify absence
 * itself instead of throwing — e.g. the login rate limiter
 * (`src/lib/auth/supabase-rate-limit.ts`), which treats a store it cannot
 * construct as a deploy/config fault rather than an attack and must not
 * throw from inside a request path.
 * @returns {{ key: string | null, missing: string | null }}
 */
export function tryGetSecretKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null;
  return key
    ? { key, missing: null }
    : { key: null, missing: `${SECRET_KEY_ENV} or ${LEGACY_SERVICE_ROLE_KEY_ENV}` };
}
