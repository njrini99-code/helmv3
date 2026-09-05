#!/usr/bin/env node
/**
 * Shared parse/validate/render logic for the feature-flag registry.
 *
 * Used by both `scripts/flags/generate-flags.mjs` (writes
 * `src/lib/flags/registry.generated.ts`) and `scripts/check-feature-flags.mjs`
 * (the CI expiry/governance gate). Both consume `config/feature-flags.yml`
 * independently through this module rather than one trusting the other's
 * output — a hand-edited `registry.generated.ts` cannot pass `flags:check`,
 * because the check script re-parses the YAML itself. See
 * `docs/ai-system/FEATURE_FLAGS.md` "why two checkers".
 *
 * Plain ESM (not TypeScript): every script in this repo's `scripts/`
 * directory that isn't already `.ts`-and-`tsx`-executed runs directly under
 * Node, un-transpiled. `src/lib/flags/never-gate.ts` and `src/lib/flags/
 * types.ts` are the typed source of truth for the shapes and the NEVER-GATE
 * keyword list mirrored below — keep the two in step by hand; both sides are
 * covered by tests against the same fixtures
 * (`src/lib/flags/__tests__/never-gate.test.ts`,
 * `scripts/flags/__tests__/lib.test.mjs`).
 */

import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';

// Mirrors src/lib/flags/never-gate.ts NEVER_GATE_KEYWORDS.
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
];

export const VALID_TYPES = ['release', 'experiment', 'operations_kill_switch', 'temporary_migration'];
export const VALID_STATUSES = ['active', 'archived'];
const ENV_KEYS = ['production', 'preview', 'development'];

/** Parses `config/feature-flags.yml` text into an array of raw flag rows. */
export function parseFlagsYaml(text) {
  // js-yaml 5 throws on an empty document where 4 returned undefined; an
  // empty flags file is a legitimate "no flags" state, not a parse error.
  if (typeof text !== 'string' || text.trim() === '') return [];
  const doc = yaml.load(text);
  if (doc == null) return [];
  if (!Array.isArray(doc.flags)) {
    throw new Error('config/feature-flags.yml must have a top-level `flags:` array');
  }
  return doc.flags;
}

export function readFlagsFile(path) {
  return parseFlagsYaml(readFileSync(path, 'utf8'));
}

function isPlainBoolean(v) {
  return typeof v === 'boolean';
}

/**
 * Schema + NEVER-GATE + governance validation for one flag row.
 * Returns an array of `{ feature_id, rule, detail }` issues (empty = clean).
 * Mirrors `FlagValidationIssue` in `src/lib/flags/types.ts`.
 */
export function validateFlag(flag, { now = new Date() } = {}) {
  const issues = [];
  const id = typeof flag?.feature_id === 'string' && flag.feature_id.length > 0
    ? flag.feature_id
    : '<missing feature_id>';
  const push = (rule, detail) => issues.push({ feature_id: id, rule, detail });

  if (typeof flag?.feature_id !== 'string' || flag.feature_id.trim() === '') {
    push('schema', 'feature_id is required and must be a non-empty string');
  }
  if (typeof flag?.purpose !== 'string' || flag.purpose.trim() === '') {
    push('schema', 'purpose is required and must be a non-empty string');
  }
  if (typeof flag?.owner !== 'string' || flag.owner.trim() === '') {
    push('missing_owner', 'owner is required and must be a non-empty string');
  }
  if (typeof flag?.cleanup_plan !== 'string' || flag.cleanup_plan.trim() === '') {
    push('missing_cleanup_plan', 'cleanup_plan is required and must be a non-empty string');
  }
  if (!VALID_TYPES.includes(flag?.type)) {
    push('invalid_type', `type must be one of ${VALID_TYPES.join(', ')}, got ${JSON.stringify(flag?.type)}`);
  }
  if (!VALID_STATUSES.includes(flag?.status)) {
    push('invalid_status', `status must be one of ${VALID_STATUSES.join(', ')}, got ${JSON.stringify(flag?.status)}`);
  }
  if (typeof flag?.created_at !== 'string' || Number.isNaN(Date.parse(flag.created_at))) {
    push('schema', 'created_at must be a parseable ISO date string');
  }
  if (typeof flag?.default !== 'boolean') {
    push('schema', 'default must be a boolean');
  }

  const env = flag?.environment;
  if (env == null || typeof env !== 'object') {
    push('non_boolean_environment', 'environment must be an object with production/preview/development booleans');
  } else {
    for (const key of ENV_KEYS) {
      if (!(key in env)) {
        push('non_boolean_environment', `environment.${key} is required`);
      } else if (!isPlainBoolean(env[key])) {
        // No percentages, by ADR 2026-09-03: canary/staged rollout is
        // explicitly deferred, so a numeric or string rollout value here is
        // always a mistake, not a lesser-supported feature.
        push('non_boolean_environment', `environment.${key} must be a boolean (no percentages — canary is deferred), got ${JSON.stringify(env[key])}`);
      }
    }
  }

  if (flag?.type === 'operations_kill_switch') {
    if (typeof flag?.kill_switch_behavior !== 'string' || flag.kill_switch_behavior.trim() === '') {
      push('missing_kill_switch_behavior', 'operations_kill_switch flags must set kill_switch_behavior');
    }
  }

  const expiresAt = flag?.expires_at ?? null;
  if (expiresAt !== null) {
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
      push('schema', 'expires_at must be null or a parseable ISO date string');
    } else if (VALID_STATUSES.includes(flag?.status) && flag.status === 'active' && Date.parse(expiresAt) < now.getTime()) {
      push('expired_active', `expires_at (${expiresAt}) is in the past but status is still "active"`);
    }
  }

  if (flag?.type === 'temporary_migration') {
    if (expiresAt === null) {
      push('temporary_migration_missing_expiry', 'temporary_migration flags must set expires_at');
    } else if (!Number.isNaN(Date.parse(expiresAt)) && Date.parse(expiresAt) < now.getTime()) {
      push('temporary_migration_expired', `temporary_migration flag is past its expires_at (${expiresAt})`);
    }
  }

  if (typeof flag?.feature_id === 'string' && typeof flag?.purpose === 'string') {
    for (const field of ['feature_id', 'purpose']) {
      const haystack = String(flag[field]).toLowerCase();
      for (const keyword of NEVER_GATE_KEYWORDS) {
        if (haystack.includes(keyword)) {
          push('never_gate', `${field} contains NEVER-GATE keyword "${keyword}" — flags may never gate auth, RLS, tenancy, membership, or required persistence`);
        }
      }
    }
  }

  return issues;
}

/** Validates a whole flag list, adding duplicate-id detection across rows. */
export function validateFlags(flags, opts = {}) {
  const issues = flags.flatMap((f) => validateFlag(f, opts));
  const seen = new Map();
  for (const f of flags) {
    const id = f?.feature_id;
    if (typeof id !== 'string' || id === '') continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({ feature_id: id, rule: 'duplicate_feature_id', detail: `feature_id "${id}" appears ${count} times` });
    }
  }
  return issues;
}

function tsStringLiteral(s) {
  return JSON.stringify(String(s));
}

function tsBool(b) {
  return b ? 'true' : 'false';
}

/**
 * Renders the typed constant source for `src/lib/flags/registry.generated.ts`.
 * Deterministic (stable key order, flags sorted by feature_id) so `--check`
 * mode is a byte-for-byte comparison, matching `docs:inventory-check`'s
 * non-mutating drift-gate pattern.
 */
export function renderRegistryModule(flags) {
  const sorted = [...flags].sort((a, b) => String(a.feature_id).localeCompare(String(b.feature_id)));
  const rows = sorted.map((f) => {
    const env = f.environment ?? {};
    return [
      '  {',
      `    feature_id: ${tsStringLiteral(f.feature_id)},`,
      `    owner: ${tsStringLiteral(f.owner)},`,
      `    purpose: ${tsStringLiteral(f.purpose)},`,
      `    type: ${tsStringLiteral(f.type)},`,
      `    status: ${tsStringLiteral(f.status)},`,
      `    created_at: ${tsStringLiteral(f.created_at)},`,
      `    expires_at: ${f.expires_at == null ? 'null' : tsStringLiteral(f.expires_at)},`,
      `    default: ${tsBool(f.default)},`,
      '    environment: {',
      `      production: ${tsBool(env.production)},`,
      `      preview: ${tsBool(env.preview)},`,
      `      development: ${tsBool(env.development)},`,
      '    },',
      `    kill_switch_behavior: ${f.kill_switch_behavior == null ? 'null' : tsStringLiteral(f.kill_switch_behavior)},`,
      `    cleanup_plan: ${tsStringLiteral(f.cleanup_plan)},`,
      '  },',
    ].join('\n');
  });

  return `// AUTOGENERATED — DO NOT EDIT BY HAND.
//
// Generated by \`npm run flags:generate\` (scripts/flags/generate-flags.mjs)
// from \`config/feature-flags.yml\`. A stamp saying so is not evidence this
// file is current — \`npm run flags:check\` re-parses the YAML independently
// and fails if this file has drifted (shipping.md §1: "verify the
// generator, not the stamp").
//
// Compiled to a typed constant on purpose: reading the flag registry at
// request time never touches the filesystem or parses YAML.

import type { FlagDefinition } from './types';

export const FLAG_REGISTRY: readonly FlagDefinition[] = [
${rows.join('\n')}
] as const;
`;
}
