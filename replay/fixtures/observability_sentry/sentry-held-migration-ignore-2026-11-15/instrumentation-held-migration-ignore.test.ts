import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Server Sentry `ignoreErrors` for objects whose migration is deliberately
 * HELD (supabase/migrations/HELD.md).
 *
 * The code already handles each missing object as designed:
 * - `refresh_player_standing_season` — standing-refresh-dirty returns
 *   `skipped: 'season-not-applied'` on PGRST202 (refresh-queue.ts).
 * - `golf_player_standing_season` — loadPlayerSeasonStandingMap returns
 *   `{ status: 'missing' }` on PGRST205 (standing/loader.ts).
 * - the three extended columns of `golf_prediction_model_performance` — the
 *   prediction-performance writer retries without them on PGRST204.
 *
 * Sentry records them anyway, because the Supabase integration captures the
 * failed call at the driver (`mechanism: auto.db.supabase.postgres`,
 * handled: no) before the application classifies it. Measured 2026-11-15:
 * JAVASCRIPT-NEXTJS-1M6 at 119 events in 24h (one per 5-minute cron tick),
 * plus -1ME (04:00 UTC lifecycle cron) and -1DM.
 *
 * Each pattern names the exact object, so the SAME failure on a live object
 * still pages. The HELD.md guard below fails the moment one of these
 * migrations stops being HOLD: delete its pattern in the change that applies
 * it, as the comment in src/instrumentation.ts says.
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

/** The PostgREST messages Sentry recorded in production, verbatim. */
const HELD_SEASON_RPC =
  'Could not find the function public.refresh_player_standing_season(p_team_ids) in the schema cache';
const HELD_SEASON_TABLE = "Could not find the table 'public.golf_player_standing_season' in the schema cache";
const heldPerfColumn = (column: string) =>
  `Could not find the '${column}' column of 'golf_prediction_model_performance' in the schema cache`;
const EXTENDED_COLUMNS = ['naive_mean_absolute_error', 'naive_sample_count', 'interval_coverage'];

describe('server ignoreErrors — objects whose migration is HELD', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const runtime of ['nodejs', 'edge'] as const) {
    describe(runtime, () => {
      let patterns: Array<string | RegExp>;
      beforeEach(async () => {
        patterns = await serverIgnoreErrors(runtime);
      });

      it('drops the held season-standing RPC (standing-refresh-dirty, every 5 minutes)', () => {
        expect(isIgnored(patterns, HELD_SEASON_RPC)).toBe(true);
      });

      it('drops the held season-standing table read', () => {
        expect(isIgnored(patterns, HELD_SEASON_TABLE)).toBe(true);
      });

      it('drops each held extended column of golf_prediction_model_performance', () => {
        for (const column of EXTENDED_COLUMNS) {
          expect(isIgnored(patterns, heldPerfColumn(column)), column).toBe(true);
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
        expect(isIgnored(patterns, heldPerfColumn('mean_absolute_error'))).toBe(false);
      });
    });
  }
});

describe('the suppressed migrations are still HELD', () => {
  // If one of these flips to APPLIED, its pattern in src/instrumentation.ts is
  // now hiding a live object: remove the pattern in the same change.
  const held = readFileSync(join(process.cwd(), 'supabase/migrations/HELD.md'), 'utf8');

  it.each([
    ['20261024151000_golf_player_standing_season.sql'],
    ['20261023150000_golf_prediction_perf_extended_columns.sql'],
  ])('%s is listed as HOLD', (file) => {
    const row = held.split('\n').find((line) => line.startsWith(`| \`${file}\``));
    expect(row, `${file} has no row in HELD.md`).toBeDefined();
    expect(row!.split('|')[2]!.trim()).toBe('**HOLD**');
  });
});
