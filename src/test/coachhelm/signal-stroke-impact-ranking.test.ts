/**
 * Two defects on the coach's signals feed, found 2026-08-18 by querying
 * production rather than by reading the code.
 *
 * ── 1. THE STROKE FIGURE IS NULL ON EVERY INSIGHT ───────────────────────────
 *
 * `signal-groups.ts` builds each insight signal with
 * `metadata.strokes_impact`. The generators write it to `evidence`. Of the 501
 * ACTIVE insights in production:
 *
 *     evidence ? 'strokes_impact'   ->  501
 *     metadata ? 'strokes_impact'   ->    0
 *
 * So `strokeImpact` is null for 100% of insight rows reaching the desk. Two
 * live consequences, both silent:
 *
 *   - `SignalDossier.tsx:194` renders the strokes readout only when
 *     `strokeImpact !== null`, so no insight has ever shown one.
 *   - `TeamSignalSummary.tsx:65` filters to `strokeImpact != null` before
 *     summing "estimated impact", so the team total counts PATTERNS ONLY and
 *     understates recoverable strokes by every insight on the roster.
 *
 * Nothing caught it because every fixture in the existing Triage tests passes
 * `strokeImpact: 0.8` directly, so the tests share the shape the code imagined
 * instead of the shape the database has.
 *
 * ── 2. WITHIN A SEVERITY BAND, ORDER IS BY AGE ──────────────────────────────
 *
 * `groupSignals` sorts `severityDelta !== 0 ? severityDelta : a.ageDays -
 * b.ageDays` — freshest first, and stroke impact is carried on the signal but
 * never consulted. `ageDays` derives from `created_at`, which is FROZEN at
 * first detection because insights upsert on `signature`. So the coach's list
 * is ordered by "when we first ever noticed this", forever: a 2-stroke leak
 * first seen in June sits below a 0.1-stroke one first seen last week and can
 * never climb.
 *
 * A triage desk should lead with what is most recoverable.
 */
import { describe, it, expect } from 'vitest';
import { groupSignals, readStrokeImpact, type GroupedSignal } from '@/lib/coachhelm/signal-grouping';

function signal(over: Partial<GroupedSignal> & { id: string }): GroupedSignal {
  return {
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Signal',
    claim: 'Something happened.',
    ageDays: 5,
    status: 'active',
    strokeImpact: null,
    playerId: 'player-1',
    supersededCount: 0,
    evidence: null,
    ...over,
  };
}

describe('readStrokeImpact — evidence is where the generators actually write it', () => {
  it('reads strokes_impact out of evidence', () => {
    expect(readStrokeImpact({ evidence: { strokes_impact: 1.4 }, metadata: null })).toBe(1.4);
  });

  it('falls back to metadata for any row that stored it there', () => {
    expect(readStrokeImpact({ evidence: null, metadata: { strokes_impact: 0.9 } })).toBe(0.9);
  });

  it('prefers evidence when both are present', () => {
    expect(
      readStrokeImpact({ evidence: { strokes_impact: 2 }, metadata: { strokes_impact: 9 } }),
    ).toBe(2);
  });

  it('is null when neither carries it — never 0, which would read as "no leak"', () => {
    expect(readStrokeImpact({ evidence: {}, metadata: {} })).toBeNull();
    expect(readStrokeImpact({ evidence: null, metadata: null })).toBeNull();
  });

  it('rejects a non-numeric value rather than coercing it', () => {
    expect(readStrokeImpact({ evidence: { strokes_impact: 'lots' }, metadata: null })).toBeNull();
    expect(readStrokeImpact({ evidence: { strokes_impact: null }, metadata: null })).toBeNull();
  });
});

describe('groupSignals — most recoverable first, within a severity band', () => {
  // Each fixture gets its OWN category on purpose: collapseDuplicates folds
  // rows sharing (playerId, category), which is correct and unrelated to
  // ordering. Sharing one category collapses the pair to a single signal and
  // the ordering assertion then compares a one-element list against a
  // two-element one — a fixture bug that reads like an ordering bug.
  it('puts the bigger leak first even though it was noticed longer ago', () => {
    const groups = groupSignals(
      [
        signal({ id: 'small-but-fresh', category: 'putting', strokeImpact: 0.1, ageDays: 1 }),
        signal({ id: 'big-but-old', category: 'approach', strokeImpact: 2.1, ageDays: 60 }),
      ],
      { 'player-1': 'Cole Bennett' },
    );

    expect(groups[0]!.signals.map((s) => s.id)).toEqual(['big-but-old', 'small-but-fresh']);
  });

  it('never lets impact jump a severity band', () => {
    const groups = groupSignals(
      [
        signal({ id: 'low-huge', category: 'putting', severity: 'low', strokeImpact: 5 }),
        signal({ id: 'urgent-tiny', category: 'approach', severity: 'urgent', strokeImpact: 0.01 }),
      ],
      { 'player-1': 'Cole Bennett' },
    );

    expect(groups[0]!.signals[0]!.id).toBe('urgent-tiny');
  });

  it('ranks on magnitude — a -2.0 leak is as material as a +2.0 one', () => {
    const groups = groupSignals(
      [
        signal({ id: 'positive-small', category: 'putting', strokeImpact: 0.4 }),
        signal({ id: 'negative-big', category: 'approach', strokeImpact: -2.0 }),
      ],
      { 'player-1': 'Cole Bennett' },
    );

    expect(groups[0]!.signals[0]!.id).toBe('negative-big');
  });

  it('falls back to freshest-first when neither signal carries an impact', () => {
    const groups = groupSignals(
      [
        signal({ id: 'older', category: 'putting', strokeImpact: null, ageDays: 30 }),
        signal({ id: 'newer', category: 'approach', strokeImpact: null, ageDays: 2 }),
      ],
      { 'player-1': 'Cole Bennett' },
    );

    expect(groups[0]!.signals.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('orders a known impact above an unknown one rather than treating null as zero', () => {
    const groups = groupSignals(
      [
        signal({ id: 'unknown-impact', category: 'putting', strokeImpact: null, ageDays: 1 }),
        signal({ id: 'known-impact', category: 'approach', strokeImpact: 0.5, ageDays: 90 }),
      ],
      { 'player-1': 'Cole Bennett' },
    );

    expect(groups[0]!.signals[0]!.id).toBe('known-impact');
  });
});
