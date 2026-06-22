import { describe, it, expect } from 'vitest';
import {
  hasValidHorizon,
  endOfDueDate,
  selectValidationRound,
  extractMetricValue,
  type RoundOutcomeRow,
} from '../outcome-validator';
import {
  resolveDueDate,
  PREDICTION_WINDOW_DAYS,
} from '../../prediction/performance-predictor';

// ---------------------------------------------------------------------------
// P0-02: Prediction validation must match predictions to outcomes correctly.
// A prediction can only validate against a round PLAYED AFTER it was created,
// and same-day/inverted horizons must never grade against a pre-prediction
// round.
// ---------------------------------------------------------------------------

describe('resolveDueDate — predictions are due on a FUTURE day', () => {
  it('a same-day target yields a due date >= PREDICTION_WINDOW_DAYS in the future', () => {
    const created = new Date('2026-06-21T15:00:00Z'); // 3 PM
    const due = resolveDueDate(created, created); // caller asked for "today"
    const dueMs = new Date(`${due}T00:00:00Z`).getTime();
    const minMs = created.getTime() + (PREDICTION_WINDOW_DAYS - 1) * 86_400_000;
    expect(dueMs).toBeGreaterThanOrEqual(minMs);
    // Strictly a later day than the creation day.
    expect(due > created.toISOString().slice(0, 10)).toBe(true);
  });

  it('a past target is ignored in favor of the default future horizon', () => {
    const created = new Date('2026-06-21T12:00:00Z');
    const past = new Date('2026-06-10T12:00:00Z');
    const due = resolveDueDate(past, created);
    expect(due > created.toISOString().slice(0, 10)).toBe(true);
  });

  it('honors a genuine future target (a known upcoming event)', () => {
    const created = new Date('2026-06-21T12:00:00Z');
    const futureEvent = new Date('2026-07-15T00:00:00Z');
    expect(resolveDueDate(futureEvent, created)).toBe('2026-07-15');
  });
});

describe('hasValidHorizon — same-day predictions cannot validate', () => {
  it('rejects a prediction due the same day it was created (P0-02 root cause)', () => {
    expect(hasValidHorizon('2026-06-21T15:00:00Z', '2026-06-21')).toBe(false);
  });

  it('rejects an inverted horizon (due before creation day)', () => {
    expect(hasValidHorizon('2026-06-21T15:00:00Z', '2026-06-20')).toBe(false);
  });

  it('accepts a future horizon', () => {
    expect(hasValidHorizon('2026-06-21T15:00:00Z', '2026-07-05')).toBe(true);
  });

  it('rejects when either timestamp is missing', () => {
    expect(hasValidHorizon(null, '2026-07-05')).toBe(false);
    expect(hasValidHorizon('2026-06-21T15:00:00Z', null)).toBe(false);
  });
});

describe('endOfDueDate — a round on the due day still counts', () => {
  it('returns end-of-day UTC, not midnight at the start', () => {
    const end = endOfDueDate('2026-07-05');
    expect(end?.toISOString()).toBe('2026-07-05T23:59:59.999Z');
  });
});

function round(createdAt: string, fields: Partial<RoundOutcomeRow> = {}): RoundOutcomeRow & { id: string } {
  return {
    id: createdAt,
    created_at: createdAt,
    score_to_par: null,
    total_putts: null,
    total_fairways_hit: null,
    total_fairways: null,
    total_gir: null,
    total_gir_possible: null,
    ...fields,
  };
}

describe('selectValidationRound — first round AFTER the prediction', () => {
  const created = '2026-06-21T15:00:00Z';
  const due = '2026-07-05';

  it('ignores rounds played BEFORE the prediction was created', () => {
    const rounds = [
      round('2026-06-21T09:00:00Z', { score_to_par: 99 }), // earlier same day — must be ignored
      round('2026-06-23T12:00:00Z', { score_to_par: 3 }), // first eligible
    ];
    const picked = selectValidationRound(rounds, created, due);
    expect(picked?.id).toBe('2026-06-23T12:00:00Z');
  });

  it('picks the EARLIEST eligible round, not an average', () => {
    const rounds = [
      round('2026-06-30T12:00:00Z', { score_to_par: 10 }),
      round('2026-06-23T12:00:00Z', { score_to_par: 2 }), // earliest after created
      round('2026-06-28T12:00:00Z', { score_to_par: 6 }),
    ];
    const picked = selectValidationRound(rounds, created, due);
    expect(picked?.score_to_par).toBe(2);
  });

  it('excludes rounds beyond the end of the due date', () => {
    const rounds = [round('2026-07-06T00:00:00Z', { score_to_par: 4 })];
    expect(selectValidationRound(rounds, created, due)).toBeNull();
  });

  it('includes a round submitted any time ON the due day', () => {
    const rounds = [round('2026-07-05T20:00:00Z', { score_to_par: 4 })];
    expect(selectValidationRound(rounds, created, due)?.id).toBe('2026-07-05T20:00:00Z');
  });

  it('returns null when no round falls after creation', () => {
    const rounds = [round('2026-06-21T09:00:00Z', { score_to_par: 99 })];
    expect(selectValidationRound(rounds, created, due)).toBeNull();
  });
});

describe('extractMetricValue — correct field per metric', () => {
  const r = round('2026-06-23T12:00:00Z', {
    score_to_par: 3,
    total_putts: 30,
    total_fairways_hit: 7,
    total_fairways: 14,
    total_gir: 9,
    total_gir_possible: 18,
  });

  it('reads score_to_par', () => {
    expect(extractMetricValue('score_to_par', r)).toBe(3);
    expect(extractMetricValue('scoreToPar', r)).toBe(3);
  });
  it('reads putts (lower-is-better metric value passed through verbatim)', () => {
    expect(extractMetricValue('total_putts', r)).toBe(30);
  });
  it('computes fairway and GIR percentages', () => {
    expect(extractMetricValue('fairway_pct', r)).toBe(50);
    expect(extractMetricValue('gir_pct', r)).toBe(50);
  });
  it('returns null for an unknown metric', () => {
    expect(extractMetricValue('made_up', r)).toBeNull();
  });
});
