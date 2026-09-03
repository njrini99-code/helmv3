import type { FlagEnvironmentName } from './types';

/**
 * Resolves which rollout column (`environment.production` /
 * `.preview` / `.development`) applies to the process this code is running
 * in. Mirrors the VERCEL_ENV precedence `src/instrumentation-client.ts` and
 * `src/lib/sentry-environment.ts` already use elsewhere in this repo (owned
 * by the Sentry session — not imported from here on purpose, to keep
 * `src/lib/flags/**` a self-contained new module per the plan's parallel-
 * worktree table, Group D), but this module is independent so a change to
 * that owner-only file cannot silently change flag evaluation.
 */
export interface FlagEnvironmentSourceVars {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}

export function resolveFlagEnvironment(
  env: FlagEnvironmentSourceVars = { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV },
): FlagEnvironmentName {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';
  // No VERCEL_ENV (local dev, most test runs): fall back to NODE_ENV. Any
  // value other than "production" is treated as development, which is the
  // safer default for a flag reader — never assume production without an
  // explicit signal.
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}
