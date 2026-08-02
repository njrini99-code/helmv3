/**
 * Supabase-backed Rate Limiting
 *
 * Replaces the in-memory Map-based rate limiter with a DB-backed solution
 * that works correctly across serverless instances and survives deploys.
 *
 * Uses the `auth_rate_limits` table via an untyped admin client
 * (table is not yet in generated types).
 */

// This module reads SUPABASE_SERVICE_ROLE_KEY. `server-only` turns "nobody
// imports this from the client" from a convention into a BUILD ERROR — an
// accidental client import now fails the build instead of shipping a
// service-role code path to the browser. Verified 2026-08-02 that all seven
// non-test importers are already server-side (route handlers, 'use server'
// action files, and server libs), so adding the marker breaks no bundle.
import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  blockedUntil?: number;
};

/** Row shape returned by the `check_rate_limit_atomic` RPC (post-increment). */
type RateLimitRow = {
  count: number;
  window_start: string;
  blocked_until: string | null;
};

/** Minimal shape of a PostgREST/Postgres error — enough to classify it. */
type MaybePostgrestError = {
  code?: string | null;
  message?: string | null;
} | null;

/**
 * PostgREST answers a call to an unknown RPC with `PGRST202`
 * ("Could not find the function … in the schema cache"). If the name resolves
 * but the argument signature does not, Postgres itself raises `42883`
 * (undefined_function). Either way the function is not deployed *yet*.
 */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

function isMissingFunctionError(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (MISSING_FUNCTION_CODES.has(error.code ?? '')) return true;

  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist'))
  );
}

/**
 * One log line per serverless instance, not one per login attempt — an
 * unapplied migration would otherwise flood the error log at auth volume.
 */
let missingRpcLogged = false;

/**
 * NEW-2: `42883` is ALSO what Postgres raises when the function name resolves
 * but the argument signature does not, or when an operator inside the function
 * body is unresolvable. So "missing function" is not a safe synonym for "the
 * migration has not landed yet". Once a call has succeeded on this instance we
 * KNOW the RPC is deployed, and any later fallback is a regression (a changed
 * overload, a broken body) that silently downgrades every caller to the racy
 * limiter. That case is logged at `critical`, throttled rather than
 * once-per-instance, so it stays visible in the error feed instead of
 * evaporating into a single cold-start line.
 */
let atomicRpcHasSucceeded = false;
let lastAtomicRegressionLogAt = 0;
const ATOMIC_REGRESSION_LOG_INTERVAL_MS = 5 * 60 * 1000;

/** One line per instance for the missing-service-role-key deploy fault. */
let adminClientUnavailableLogged = false;

/**
 * The `auth_rate_limits` table is not in the generated Database types, so this
 * is deliberately the untyped client. Derive the alias from an actual call
 * expression — `ReturnType<typeof createClient>` resolves the generics from
 * their DEFAULTS instead, which collapses the table row types to `never` and
 * makes every `.upsert()`/`.update()` below a type error.
 */
function createRateLimitAdminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type RateLimitAdminClient = ReturnType<typeof createRateLimitAdminClient>;

type AdminClientResult =
  | { client: RateLimitAdminClient; reason: null }
  | { client: null; reason: string };

/**
 * NEW-1: this used to THROW when `SUPABASE_SERVICE_ROLE_KEY` was absent, from
 * inside `checkRateLimit`'s try block — so a missing env var landed in the
 * catch and hit the fail-CLOSED branch, refusing 100% of logins across golf,
 * baseball and lifting. A store we cannot even construct is a deploy/config
 * fault, exactly like an unapplied migration, and must not be treated as an
 * attack. It returns a reason instead of throwing so the caller can classify
 * it rather than inferring intent from a stack.
 */
function tryGetAdminClient(): AdminClientResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // nosemgrep: helmv3-service-role-outside-admin -- module is `import 'server-only'` (top of file), so a client import is a build error, not a browser leak. It cannot use the shared createAdminClient(): that THROWS on a missing key, which is the exact fail-closed regression removed in NEW-1 below (it refused 100% of logins across all three sports), and it is deliberately untyped because auth_rate_limits collapses the row types to `never`.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    const missing = [
      url ? null : 'NEXT_PUBLIC_SUPABASE_URL',
      serviceRoleKey ? null : 'SUPABASE_SERVICE_ROLE_KEY',
    ]
      .filter((name): name is string => name !== null)
      .join(', ');
    return { client: null, reason: `missing env: ${missing}` };
  }

  try {
    return {
      client: createRateLimitAdminClient(url.trim(), serviceRoleKey.trim()),
      reason: null,
    };
  } catch (error) {
    // e.g. a malformed NEXT_PUBLIC_SUPABASE_URL — still a config fault.
    return { client: null, reason: describeError(error) };
  }
}

/**
 * Emit the "we are on the racy fallback" line, at the severity the situation
 * actually warrants (see NEW-2 above).
 */
function logAtomicFallback(now: number): void {
  if (atomicRpcHasSucceeded) {
    if (now - lastAtomicRegressionLogAt < ATOMIC_REGRESSION_LOG_INTERVAL_MS) return;
    lastAtomicRegressionLogAt = now;
    void logServerError(
      '[RateLimit] check_rate_limit_atomic resolved earlier on this instance and now reports undefined_function — the RPC is deployed but the call no longer binds (changed overload, or an unresolvable operator in the body). Every rate-limit check is silently on the racy non-atomic limiter.',
      {
        action: 'checkRateLimit',
        source: 'auth',
        featureArea: 'auth',
        errorHint: 'atomic_rpc_regression',
      },
      'critical'
    );
    return;
  }

  if (missingRpcLogged) return;
  missingRpcLogged = true;
  void logServerError(
    '[RateLimit] check_rate_limit_atomic is not deployed — falling back to the non-atomic limiter. Apply 20260801100000_auth_rate_limits_atomic_rpc.sql.',
    {
      action: 'checkRateLimit',
      source: 'auth',
      featureArea: 'auth',
      errorHint: 'missing_rpc',
    }
  );
}

/**
 * Rate limit configurations by endpoint
 */
export const RATE_LIMITS = {
  LOGIN: {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 15 * 60 * 1000, // 15 minutes after 5 failed attempts
  },
  SIGNUP: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  PASSWORD_RESET: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  PASSWORD_CHANGE: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  API_GENERAL: {
    maxAttempts: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  WATCHLIST_MUTATION: {
    maxAttempts: 30,
    windowMs: 60 * 1000, // 1 minute
  },
  MESSAGE_SEND: {
    maxAttempts: 20,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;

/**
 * Pre-DS-07 read-modify-write limiter, kept ONLY as the deploy-ordering
 * fallback for when `check_rate_limit_atomic` is not in the database yet.
 *
 * It is racy (that is what DS-07 fixed) but it is the behaviour that shipped
 * before this branch, so falling back to it cannot make anything worse than
 * production is today — whereas failing closed on a missing function would
 * lock every user out of login the moment code deploys ahead of the migration.
 * Delete this once the migration is applied everywhere.
 */
async function checkRateLimitNonAtomic(
  supabase: RateLimitAdminClient,
  identifier: string,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  const { data: entry } = await supabase
    .from('auth_rate_limits')
    .select('count, window_start, blocked_until')
    .eq('key', identifier)
    .maybeSingle<RateLimitRow>();

  // Currently blocked
  if (entry?.blocked_until) {
    const blockedUntil = new Date(entry.blocked_until).getTime();
    if (blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.window_start).getTime() + config.windowMs,
        blockedUntil,
      };
    }
  }

  const windowStart = entry ? new Date(entry.window_start).getTime() : 0;
  const windowExpired = !entry || windowStart + config.windowMs < now;

  if (windowExpired) {
    await supabase.from('auth_rate_limits').upsert(
      {
        key: identifier,
        count: 1,
        window_start: new Date(now).toISOString(),
        blocked_until: null,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: 'key' }
    );

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetAt: now + config.windowMs,
    };
  }

  const newCount = (entry?.count ?? 0) + 1;

  if (newCount > config.maxAttempts) {
    const blockedUntil = config.blockDurationMs
      ? new Date(now + config.blockDurationMs).toISOString()
      : null;

    await supabase
      .from('auth_rate_limits')
      .update({
        count: newCount,
        blocked_until: blockedUntil,
        updated_at: new Date(now).toISOString(),
      })
      .eq('key', identifier);

    return {
      allowed: false,
      remaining: 0,
      resetAt: windowStart + config.windowMs,
      blockedUntil: blockedUntil ? new Date(blockedUntil).getTime() : undefined,
    };
  }

  await supabase
    .from('auth_rate_limits')
    .update({
      count: newCount,
      updated_at: new Date(now).toISOString(),
    })
    .eq('key', identifier);

  return {
    allowed: true,
    remaining: config.maxAttempts - newCount,
    resetAt: windowStart + config.windowMs,
  };
}

/**
 * Check and increment rate limit (DB-backed)
 *
 * DS-07: this used to SELECT the row, compute `count + 1` in JS across a full
 * network round-trip, evaluate the limit, and only then UPDATE. Concurrent
 * requests for the same key all read the same count and all passed — the LOGIN
 * gate (5/min) amplified by however many requests fit in the gap, and a burst
 * straddling the window boundary reset the counter repeatedly. The increment,
 * the window roll and the block stamp now happen in ONE statement inside
 * `check_rate_limit_atomic` (INSERT … ON CONFLICT DO UPDATE, which re-reads the
 * conflicting row under a row lock). The decision below is made from the
 * post-increment row the RPC returns, never from a pre-read one.
 *
 * DEPLOY ORDERING: the RPC ships in
 * `20260801100000_auth_rate_limits_atomic_rpc.sql`. If code reaches an
 * environment before that migration does, the call comes back `PGRST202` and we
 * fall back to the pre-DS-07 limiter rather than failing closed — a function
 * that does not exist is a release-ordering problem, not an attack, and failing
 * closed there would take every login on the platform down.
 *
 * CONFIG FAULTS: the same reasoning applies one level up. If the admin client
 * cannot even be constructed (no SUPABASE_SERVICE_ROLE_KEY), there is no store
 * to consult, so that is classified with the missing-RPC case — fail open, log
 * at `critical` — and is resolved before the try so it can never reach the
 * fail-closed branch below.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();

  // NEW-1: resolved BEFORE the try, so a config fault can never be mistaken for
  // a store error and fail closed. There is no limiter to consult at all here —
  // the only honest options are "refuse every request on the platform" or "let
  // them through, loudly". We take the second, at `critical`.
  const admin = tryGetAdminClient();
  if (!admin.client) {
    if (!adminClientUnavailableLogged) {
      adminClientUnavailableLogged = true;
      void logServerError(
        `[RateLimit] admin client cannot be constructed (${admin.reason}) — rate limiting is DISABLED and every check is failing open. Fix the environment configuration.`,
        {
          action: 'checkRateLimit',
          source: 'auth',
          featureArea: 'auth',
          errorHint: 'admin_client_unavailable',
        },
        'critical'
      );
    }

    return {
      allowed: true,
      remaining: config.maxAttempts,
      resetAt: now + config.windowMs,
    };
  }

  const supabase = admin.client;

  try {
    const { data, error } = await supabase.rpc('check_rate_limit_atomic', {
      p_key: identifier,
      p_window_ms: config.windowMs,
      p_max_attempts: config.maxAttempts,
      p_block_ms: config.blockDurationMs ?? null,
    });

    if (isMissingFunctionError(error)) {
      logAtomicFallback(now);
      return await checkRateLimitNonAtomic(supabase, identifier, config, now);
    }

    // `RETURNS TABLE`, so PostgREST hands back an array of exactly one row.
    // tryGetAdminClient() hands back a bare (untyped) client — this cast is the shape
    // contract with 20260801100000_auth_rate_limits_atomic_rpc.sql.
    const entry = (data as RateLimitRow[] | null)?.[0];
    if (error || !entry) {
      throw new Error(error?.message ?? 'check_rate_limit_atomic returned no row');
    }

    // Proof the RPC is deployed AND binds on this instance. Any later
    // undefined_function is therefore a regression, not deploy ordering.
    atomicRpcHasSucceeded = true;

    const resetAt = new Date(entry.window_start).getTime() + config.windowMs;
    const blockedUntil = entry.blocked_until
      ? new Date(entry.blocked_until).getTime()
      : undefined;

    // An active block wins regardless of the count — the RPC freezes the window
    // while it stands, so a short window cannot shorten a long block.
    if (blockedUntil && blockedUntil > now) {
      return { allowed: false, remaining: 0, resetAt, blockedUntil };
    }

    if (entry.count > config.maxAttempts) {
      return { allowed: false, remaining: 0, resetAt, blockedUntil };
    }

    return {
      allowed: true,
      remaining: config.maxAttempts - entry.count,
      resetAt,
    };
  } catch (error) {
    void logServerError(`[RateLimit] DB error: ${describeError(error)}`, {
      action: 'checkRateLimit',
      source: 'auth',
      featureArea: 'auth',
      errorHint: identifier.split(':')[0] ?? 'unknown',
    });

    // DS-07: this used to fail fully open on ANY DB error, which turns a DB blip
    // into an unlimited brute-force window. Configs carrying a blockDurationMs
    // are the auth-sensitive ones (LOGIN, PASSWORD_RESET) — those now fail
    // closed. Everything else still fails open, because locking the whole app
    // out on a DB blip is the incident class in `supabase-522-site-outage`.
    //
    // Fail-closed is reserved for errors returned by a store that is actually
    // REACHABLE. The two config faults are routed away from here entirely:
    // a *missing* RPC falls back to the non-atomic limiter above, and an
    // unconstructable admin client returns fail-open before the try. Neither an
    // unapplied migration nor an unset SUPABASE_SERVICE_ROLE_KEY can lock out
    // login on golf, baseball or lifting.
    if (config.blockDurationMs) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + config.windowMs,
      };
    }

    return {
      allowed: true,
      remaining: config.maxAttempts,
      resetAt: now + config.windowMs,
    };
  }
}

/**
 * Reset rate limit for identifier (e.g., after successful login)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const admin = tryGetAdminClient();
  if (!admin.client) {
    // Nothing to reset against. checkRateLimit already logs this config fault
    // at `critical` once per instance; do not double-report it at auth volume.
    return;
  }

  try {
    const supabase = admin.client;
    await supabase
      .from('auth_rate_limits')
      .delete()
      .eq('key', identifier);
  } catch (error) {
    void logServerError(`[RateLimit] Failed to reset: ${describeError(error)}`, {
      action: 'resetRateLimit',
      source: 'auth',
      featureArea: 'auth',
    });
  }
}

/**
 * Format time remaining for user-friendly messages
 */
export function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
