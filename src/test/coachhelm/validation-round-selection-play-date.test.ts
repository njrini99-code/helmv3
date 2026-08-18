/**
 * Prediction validation grades against the wrong round — it windows on when a
 * round row was INSERTED, not when the round was PLAYED.
 *
 * `resolveActualValue` (outcome-validator.ts:293-300) queries:
 *
 *     .gt('created_at', start).lte('created_at', end)
 *
 * and `selectValidationRound` filters and sorts the result on `r.created_at`
 * too. Both of those are `golf_rounds.created_at`, the row's insert timestamp.
 * The function's own docblock states the intent it is missing: "the FIRST
 * completed round PLAYED strictly after `created_at`".
 *
 * Those are not the same date in this product. Measured against production
 * 2026-08-18, over all 326 completed rounds:
 *
 *     rounds                                326
 *     inserted on a different day than played  260   (80%)
 *     average days apart                      33.6
 *     max days apart                            89
 *
 * A coach entering last month's tournament card today writes a row whose
 * `round_date` is April and whose `created_at` is August. The validator sees
 * August.
 *
 * THE CONSEQUENCE, measured the same night: of 69 ripe predictions (due date
 * more than 24h past, never validated), 49 have no completed round played
 * after they were made — genuinely unresolvable — but **20 DO**, and those 20
 * are skipped anyway, every hour, run after run. `coachhelm-validation` has
 * logged `{total: 66, skipped: 66, validated: 0}` across 72 runs. The oldest
 * ripe prediction is 43 days past due.
 *
 * That dead loop is why the Effectiveness surface has almost nothing to show:
 * `predictions_validated` cannot grow when the resolver cannot find the round.
 *
 * `round_date` is a DATE and a prediction's `created_at` is a timestamp, so
 * eligibility is "played on a calendar day strictly after the day the
 * prediction was made" — which matches the docblock and matches
 * `hasValidHorizon` already retiring same-day horizons.
 */
import { describe, it, expect } from 'vitest';
import { selectValidationRound, type RoundOutcomeRow } from '@/lib/coachhelm/v2/learning/outcome-validator';

type Row = RoundOutcomeRow & { id: string; round_date?: string | null };

function round(over: Partial<Row> & { id: string }): Row {
  return {
    score_to_par: 4,
    total_putts: 31,
    total_fairways_hit: 8,
    total_fairways: 14,
    total_gir: 10,
    total_gir_possible: 18,
    created_at: null,
    round_date: null,
    ...over,
  };
}

// The prediction was made 2026-06-22 and is due 2026-08-01.
const PREDICTION_CREATED = '2026-06-22T14:00:00.000Z';
const PREDICTION_DUE = '2026-08-01';

describe('selectValidationRound — grades on the round PLAYED, not the row INSERTED', () => {
  it('selects a round played after the prediction even though it was entered before it', () => {
    // The backlog-entry case: coach plays 2026-07-04, enters it late... no —
    // the reverse, which production is full of: the row was created when the
    // season was seeded, long before this prediction existed.
    const r = round({
      id: 'played-after-entered-before',
      round_date: '2026-07-04',
      created_at: '2026-03-01T09:00:00.000Z', // 4 months before the prediction
    });

    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)?.id).toBe(
      'played-after-entered-before',
    );
  });

  it('rejects a round played BEFORE the prediction even though it was entered after', () => {
    // A coach catching up on paperwork grades nothing: this round was already
    // in the past when the prediction was made, so it cannot test it.
    const r = round({
      id: 'played-before-entered-after',
      round_date: '2026-05-10',
      created_at: '2026-07-01T09:00:00.000Z',
    });

    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)).toBeNull();
  });

  it('orders by play date, not insert date', () => {
    const rows: Row[] = [
      round({ id: 'played-second', round_date: '2026-07-20', created_at: '2026-07-01T00:00:00.000Z' }),
      round({ id: 'played-first', round_date: '2026-07-02', created_at: '2026-07-30T00:00:00.000Z' }),
    ];
    // Insert order would pick 'played-second'; play order picks 'played-first'.
    expect(selectValidationRound(rows, PREDICTION_CREATED, PREDICTION_DUE)?.id).toBe('played-first');
  });

  it('excludes a round played after the due date', () => {
    const r = round({
      id: 'too-late',
      round_date: '2026-08-15',
      created_at: '2026-07-01T00:00:00.000Z',
    });
    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)).toBeNull();
  });

  it('excludes a round played the SAME day the prediction was made', () => {
    // "strictly after" — a same-day round cannot test a prediction made that day.
    const r = round({
      id: 'same-day',
      round_date: '2026-06-22',
      created_at: '2026-06-22T18:00:00.000Z',
    });
    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)).toBeNull();
  });

  it('falls back to created_at when round_date is absent', () => {
    // Older rows, and any caller that has not selected round_date, must keep
    // the previous behaviour rather than silently becoming ineligible.
    const r = round({
      id: 'no-play-date',
      round_date: null,
      created_at: '2026-07-05T00:00:00.000Z',
    });
    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)?.id).toBe('no-play-date');
  });

  it('is unchanged when insert and play dates agree', () => {
    const r = round({
      id: 'agrees',
      round_date: '2026-07-10',
      created_at: '2026-07-10T21:00:00.000Z',
    });
    expect(selectValidationRound([r], PREDICTION_CREATED, PREDICTION_DUE)?.id).toBe('agrees');
  });
});
