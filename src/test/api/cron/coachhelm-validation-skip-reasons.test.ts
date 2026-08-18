/**
 * `coachhelm-validation` reports one undifferentiated `skipped` count, and that
 * is why a dead loop ran 72 times unnoticed.
 *
 * Production logged `{total: 66, skipped: 66, validated: 0}` on every run.
 * `validatePredictionAgainstOutcome` returns `null` for three unrelated
 * reasons and the cron counts all of them the same way:
 *
 *   - the horizon was invalid, so the row was RETIRED (terminal, fine)
 *   - the due date has passed and no round was played in the window
 *     (only a back-dated entry can ever fill it)
 *   - the due date is still ahead and a round may yet arrive (genuinely fine)
 *
 * Measured against production 2026-08-18, of 69 ripe predictions:
 *
 *     round in window, will validate       5
 *     window closed with no round in it   64
 *     round found but metric null          0
 *
 * "66 skipped" is compatible with all of those and distinguishes none. An
 * operator reading that number has no way to tell a healthy backlog from a
 * permanently stuck queue — which is exactly what happened.
 *
 * THE COUNTERS MUST BE FLAT SCALARS, not a nested `skipped_breakdown` object.
 * `recordJobRun`'s `extractOutcomeMetadata` keeps only string/number/boolean
 * values from the response body, so a nested object is silently dropped from
 * `background_job_logs.metadata` — the same way `v3-genome-nightly`'s
 * `per_player` array never reaches the log, which is why its own dead players
 * were invisible until the job was run by hand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/coachhelm/v2/learning/outcome-validator', () => ({
  validatePredictionAgainstOutcome: vi.fn(),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

const rows = [
  { id: 'p1', player_id: 'pl1', metric: 'score_to_par', predicted_value: 2, predicted_low: 1, predicted_high: 3, confidence_interval_low: null, confidence_interval_high: null, due_date: '2026-07-01', created_at: '2026-06-01T00:00:00.000Z', related_round_id: null },
  { id: 'p2', player_id: 'pl2', metric: 'score_to_par', predicted_value: 2, predicted_low: 1, predicted_high: 3, confidence_interval_low: null, confidence_interval_high: null, due_date: '2026-07-01', created_at: '2026-06-01T00:00:00.000Z', related_round_id: null },
  { id: 'p3', player_id: 'pl3', metric: 'score_to_par', predicted_value: 2, predicted_low: 1, predicted_high: 3, confidence_interval_low: null, confidence_interval_high: null, due_date: '2026-07-01', created_at: '2026-06-01T00:00:00.000Z', related_round_id: null },
];

function builder() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'not', 'lt', 'order', 'limit', 'eq']) {
    b[m] = () => b;
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}));

function authed(): NextRequest {
  return new NextRequest('http://x/api/cron/coachhelm-validation', {
    headers: { authorization: 'Bearer cron-secret-value' },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret-value';
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.resetModules();
});

describe('coachhelm-validation — skip reasons are counted separately', () => {
  it('breaks "skipped" into flat, scalar counters', async () => {
    const { validatePredictionAgainstOutcome } = await import(
      '@/lib/coachhelm/v2/learning/outcome-validator'
    );
    vi.mocked(validatePredictionAgainstOutcome)
      .mockResolvedValueOnce({
        predictionId: 'p1', validationId: 'v1', actualValue: 2,
        error: 0, withinInterval: true, direction: 'accurate',
      } as never)
      .mockResolvedValueOnce({ skipped: 'no_round_in_closed_window' } as never)
      .mockResolvedValueOnce({ skipped: 'awaiting_round' } as never);

    const { GET } = await import('@/app/api/cron/coachhelm-validation/route');
    const body = (await (await GET(authed())).json()) as Record<string, unknown>;

    expect(body.validated).toBe(1);
    // The number that would have made the stuck queue obvious on run one.
    expect(body.skipped_no_round_in_closed_window).toBe(1);
    expect(body.skipped_awaiting_round).toBe(1);
    // Preserved for anything already reading it.
    expect(body.skipped).toBe(2);
  });

  it('keeps every reported counter a flat scalar so the job log can store it', async () => {
    const { validatePredictionAgainstOutcome } = await import(
      '@/lib/coachhelm/v2/learning/outcome-validator'
    );
    vi.mocked(validatePredictionAgainstOutcome).mockResolvedValue({
      skipped: 'no_round_in_closed_window',
    } as never);

    const { GET } = await import('@/app/api/cron/coachhelm-validation/route');
    const body = (await (await GET(authed())).json()) as Record<string, unknown>;

    for (const [k, v] of Object.entries(body)) {
      const t = typeof v;
      expect(['string', 'number', 'boolean'], `${k} is ${t}`).toContain(t);
    }
  });

  it('still counts a legacy null return as skipped', async () => {
    // The pre-existing contract. A caller that has not been updated must not
    // silently vanish from the totals.
    const { validatePredictionAgainstOutcome } = await import(
      '@/lib/coachhelm/v2/learning/outcome-validator'
    );
    vi.mocked(validatePredictionAgainstOutcome).mockResolvedValue(null as never);

    const { GET } = await import('@/app/api/cron/coachhelm-validation/route');
    const body = (await (await GET(authed())).json()) as Record<string, unknown>;

    expect(body.skipped).toBe(3);
    expect(body.skipped_unknown).toBe(3);
  });
});
