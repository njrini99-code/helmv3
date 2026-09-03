/**
 * Shared envelope-context resolvers — `runtime`, `environment`, `releaseSha`.
 *
 * Extracted from `observe-result.ts` and `integrity.ts` (Phase 1), which each
 * carried an identical private copy of these three functions. Phase 2 adds
 * three more envelope builders (`observe-auth-result.ts`,
 * `observe-storage-result.ts`, `observe-realtime-channel.ts`) that need the
 * exact same resolution — a fourth copy-paste was the signal to extract
 * rather than repeat. No behavior change to the two Phase 1 callers: same
 * `EdgeRuntime` global check, same `VERCEL_ENV`/`NODE_ENV` fallback, same
 * `VERCEL_GIT_COMMIT_SHA` read.
 */
import type { SupabaseRuntime } from './envelope';

function hasEdgeRuntimeGlobal(): boolean {
  return (globalThis as Record<string, unknown>).EdgeRuntime !== undefined;
}

/** `'edge'` when the Edge runtime global is present, else `'node'`. Callers
 *  that run in the browser (the Realtime channel-status observer) pass their
 *  own `'browser'` runtime explicitly rather than calling this. */
export function resolveRuntime(): SupabaseRuntime {
  return hasEdgeRuntimeGlobal() ? 'edge' : 'node';
}

export function resolveEnvironment(): string {
  return (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown').slice(0, 64);
}

export function resolveReleaseSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
}
