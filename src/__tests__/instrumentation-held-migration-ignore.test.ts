import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Server Sentry `ignoreErrors` once held for objects whose migration was
 * deliberately HELD (supabase/migrations/HELD.md):
 * - the season-standing RPC and table (20261024151000, applied 2026-11-18);
 * - the three extended columns of `golf_prediction_model_performance`
 *   (20261023150000, applied 2026-11-27).
 *
 * Sentry recorded them because the Supabase integration captures the failed
 * call at the driver (`mechanism: auto.db.supabase.postgres`, handled: no)
 * before the application classifies it. Measured 2026-11-15:
 * JAVASCRIPT-NEXTJS-1M6 at 119 events in 24h (one per 5-minute cron tick),
 * plus -1ME (04:00 UTC lifecycle cron) and -1DM.
 *
 * Both migrations are applied now, so their objects are live and the same
 * failure must page again. This file guards that no pattern still hides
 * them, and that a broad pattern never hides a LIVE object.
 */
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  init: mocks.init,
  vercelAIIntegration: (opts: unknown) => ({ name: 'VercelAI', opts }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  captureRequestError: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));
vi.mock('@/lib/observability/register-process-error-handlers', () => ({
  registerProcessErrorHandlers: vi.fn(),
}));
vi.mock('@/lib/admin/deploy-marker', () => ({ recordDeployMarker: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerException: vi.fn(async () => {}) }));

import { register } from '@/instrumentation';

/**
 * Sentry's own `ignoreErrors` semantics (`stringMatchesSomePattern` in
 * @sentry/core, not a direct dependency here): a string entry matches as a
 * substring, a RegExp entry with `.test`. The SDK tries the event's `value`
 * and `${type}: ${value}`.
 */
function isIgnored(patterns: Array<string | RegExp>, value: string, type = 'Error'): boolean {
  return [value, `${type}: ${value}`].some((candidate) =>
    patterns.some((p) => (typeof p === 'string' ? candidate.includes(p) : p.test(candidate))),
  );
}

async function serverIgnoreErrors(runtime: 'nodejs' | 'edge'): Promise<Array<string | RegExp>> {
  vi.stubEnv('NEXT_RUNTIME', runtime);
  mocks.init.mockClear();
  await register();
  expect(mocks.init).toHaveBeenCalled();
  return mocks.init.mock.calls[0]![0].ignoreErrors as Array<string | RegExp>;
}

/**
 * The PostgREST messages Sentry recorded in production, verbatim. Neither set
 * is held any more: 20261024151000 was applied on 2026-11-18 and
 * 20261023150000 on 2026-11-27, so a missing season RPC, season table or
 * extended column must page again.
 */
const APPLIED_SEASON_RPC =
  'Could not find the function public.refresh_player_standing_season(p_team_ids) in the schema cache';
const APPLIED_SEASON_TABLE = "Could not find the table 'public.golf_player_standing_season' in the schema cache";
const perfColumn = (column: string) =>
  `Could not find the '${column}' column of 'golf_prediction_model_performance' in the schema cache`;
const EXTENDED_COLUMNS = ['naive_mean_absolute_error', 'naive_sample_count', 'interval_coverage'];

describe('server ignoreErrors — objects whose migration was HELD', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const runtime of ['nodejs', 'edge'] as const) {
    describe(runtime, () => {
      let patterns: Array<string | RegExp>;
      beforeEach(async () => {
        patterns = await serverIgnoreErrors(runtime);
      });

      it('pages again for the season-standing RPC and table, now that 20261024151000 is applied', () => {
        expect(isIgnored(patterns, APPLIED_SEASON_RPC)).toBe(false);
        expect(isIgnored(patterns, APPLIED_SEASON_TABLE)).toBe(false);
      });

      it('pages again for each extended column of golf_prediction_model_performance, now that 20261023150000 is applied', () => {
        for (const column of EXTENDED_COLUMNS) {
          expect(isIgnored(patterns, perfColumn(column)), column).toBe(false);
        }
      });

      it('still pages when a LIVE object goes missing', () => {
        // Live in production 2026-11-15: the lifetime refresh RPC, the lifetime
        // standing table and the private-fields RPC.
        expect(
          isIgnored(patterns, 'Could not find the function public.refresh_player_standing(p_team_ids) in the schema cache'),
        ).toBe(false);
        expect(
          isIgnored(patterns, 'Could not find the function public.golf_player_private_fields(p_player_ids) in the schema cache'),
        ).toBe(false);
        expect(isIgnored(patterns, "Could not find the table 'public.golf_player_standing' in the schema cache")).toBe(
          false,
        );
        // A versioned successor of the held RPC is a different object.
        expect(
          isIgnored(
            patterns,
            'Could not find the function public.refresh_player_standing_season_v2(p_team_ids) in the schema cache',
          ),
        ).toBe(false);
        // The same column name on another table.
        expect(
          isIgnored(patterns, "Could not find the 'interval_coverage' column of 'golf_rounds' in the schema cache"),
        ).toBe(false);
        // Any other column of the performance table.
        expect(isIgnored(patterns, perfColumn('mean_absolute_error'))).toBe(false);
      });
    });
  }
});
