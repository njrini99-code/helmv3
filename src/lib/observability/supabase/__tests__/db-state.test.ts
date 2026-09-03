import { describe, it, expect } from 'vitest';
import {
  foldDatabaseState,
  type DbStateSource,
} from '../db-state';

/** A source that was read successfully, is current, and reports `ok`. */
function healthySource(name: string, required = true): DbStateSource {
  return {
    name,
    required,
    freshness: 'healthy',
    signals: [{ id: `${name}.primary`, level: 'ok', summary: `${name} within thresholds` }],
  };
}

describe('foldDatabaseState — everything readable and healthy', () => {
  it('is GREEN with high confidence when every required source is fresh and ok', () => {
    const verdict = foldDatabaseState({
      sources: [healthySource('db_health_samples'), healthySource('db_error_events'), healthySource('db_stat_deltas')],
    });

    expect(verdict.state).toBe('GREEN');
    expect(verdict.confidence).toBe('high');
    expect(verdict.greenBlocked).toBe(false);
    expect(verdict.blindRequiredSources).toEqual([]);
  });

  it('still returns the evidence that produced GREEN, so a surface can explain itself', () => {
    const verdict = foldDatabaseState({ sources: [healthySource('db_health_samples')] });
    expect(verdict.evidence.length).toBeGreaterThan(0);
    expect(verdict.evidence.every((e) => typeof e.detail === 'string' && e.detail.length > 0)).toBe(true);
  });
});

describe('foldDatabaseState — one required source blind', () => {
  it('can never be GREEN, and degrades rather than inventing health', () => {
    const verdict = foldDatabaseState({
      sources: [
        healthySource('db_health_samples'),
        { name: 'db_error_events', required: true, freshness: 'blind', signals: [] },
      ],
    });

    expect(verdict.state).toBe('DEGRADED');
    expect(verdict.state).not.toBe('GREEN');
    expect(verdict.greenBlocked).toBe(true);
    expect(verdict.blindRequiredSources).toEqual(['db_error_events']);
    expect(verdict.confidence).toBe('low');
  });

  it('records the blind source as CAPPING evidence, not as a passing check', () => {
    const verdict = foldDatabaseState({
      sources: [healthySource('db_health_samples'), { name: 'db_error_events', required: true, freshness: 'blind', signals: [] }],
    });
    const capping = verdict.evidence.filter((e) => e.weight === 'capping');
    expect(capping).toHaveLength(1);
    expect(capping[0]?.id).toBe('db_error_events');
  });

  it('a blind OPTIONAL source does not block GREEN, but does lower confidence', () => {
    const verdict = foldDatabaseState({
      sources: [
        healthySource('db_health_samples'),
        { name: 'metrics_api', required: false, freshness: 'blind', signals: [] },
      ],
    });

    expect(verdict.state).toBe('GREEN');
    expect(verdict.greenBlocked).toBe(false);
    expect(verdict.confidence).toBe('medium');
  });
});

describe('foldDatabaseState — a real fire outranks a partly-blind board', () => {
  it('is RED, not DEGRADED, when a required source is blind AND a live source is critical', () => {
    const verdict = foldDatabaseState({
      sources: [
        {
          name: 'db_health_samples',
          required: true,
          freshness: 'healthy',
          signals: [{ id: 'connection_saturation', level: 'critical', summary: 'connections at 94% of max' }],
        },
        { name: 'db_error_events', required: true, freshness: 'blind', signals: [] },
      ],
    });

    expect(verdict.state).toBe('RED');
    expect(verdict.confidence).toBe('low');
    expect(verdict.greenBlocked).toBe(true);
    expect(verdict.evidence.some((e) => e.weight === 'decisive' && e.id === 'connection_saturation')).toBe(true);
    expect(verdict.evidence.some((e) => e.weight === 'capping' && e.id === 'db_error_events')).toBe(true);
  });

  it('is AMBER when the worst live signal is a warning and nothing is blind', () => {
    const verdict = foldDatabaseState({
      sources: [
        {
          name: 'db_health_samples',
          required: true,
          freshness: 'healthy',
          signals: [
            { id: 'connection_saturation', level: 'warning', summary: 'connections at 72% of max' },
            { id: 'rollback_rate', level: 'ok', summary: 'rollback rate within baseline' },
          ],
        },
      ],
    });

    expect(verdict.state).toBe('AMBER');
    expect(verdict.confidence).toBe('high');
  });
});

describe('foldDatabaseState — collector stale', () => {
  it('treats a stale required source exactly like a blind one for the GREEN rule', () => {
    const verdict = foldDatabaseState({
      sources: [
        healthySource('db_error_events'),
        { name: 'db_health_samples', required: true, freshness: 'stale', signals: [] },
      ],
    });

    expect(verdict.state).toBe('DEGRADED');
    expect(verdict.greenBlocked).toBe(true);
    expect(verdict.blindRequiredSources).toEqual(['db_health_samples']);
  });

  it('does NOT trust the signals a stale source is still carrying', () => {
    // A stale collector's last row can be hours old and say "ok". That row is
    // not evidence about now, so it must not produce a GREEN-supporting signal.
    const verdict = foldDatabaseState({
      sources: [
        {
          name: 'db_health_samples',
          required: true,
          freshness: 'stale',
          signals: [{ id: 'connection_saturation', level: 'ok', summary: 'stale row says 12%' }],
        },
      ],
    });

    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.evidence.some((e) => e.id === 'connection_saturation' && e.weight === 'decisive')).toBe(false);
  });

  it('a DEGRADED-freshness source is still live — it is behind, not blind', () => {
    const verdict = foldDatabaseState({
      sources: [
        {
          name: 'db_health_samples',
          required: true,
          freshness: 'degraded',
          signals: [{ id: 'connection_saturation', level: 'ok', summary: 'connections at 12% of max' }],
        },
      ],
    });

    expect(verdict.state).toBe('GREEN');
    expect(verdict.confidence).toBe('medium');
  });
});

describe('foldDatabaseState — no data at all', () => {
  it('is UNKNOWN with no confidence when there are no sources', () => {
    const verdict = foldDatabaseState({ sources: [] });
    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.confidence).toBe('none');
    expect(verdict.evidence).toHaveLength(1);
    expect(verdict.evidence[0]?.weight).toBe('capping');
  });

  it('is UNKNOWN — never GREEN — when every source is present but blind', () => {
    const verdict = foldDatabaseState({
      sources: [
        { name: 'db_health_samples', required: true, freshness: 'blind', signals: [] },
        { name: 'db_error_events', required: true, freshness: 'blind', signals: [] },
      ],
    });

    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.confidence).toBe('none');
    expect(verdict.blindRequiredSources).toEqual(['db_health_samples', 'db_error_events']);
  });

  it('is UNKNOWN when live sources exist but every signal they carry is itself unknown', () => {
    const verdict = foldDatabaseState({
      sources: [
        {
          name: 'db_health_samples',
          required: true,
          freshness: 'healthy',
          signals: [{ id: 'rollback_rate', level: 'unknown', summary: 'baseline still collecting' }],
        },
      ],
    });

    expect(verdict.state).toBe('UNKNOWN');
    expect(verdict.confidence).toBe('none');
  });

  it("a source that read fine but has never sampled is 'unknown' freshness, and blocks GREEN when required", () => {
    const verdict = foldDatabaseState({
      sources: [
        healthySource('db_error_events'),
        { name: 'db_stat_deltas', required: true, freshness: 'unknown', signals: [] },
      ],
    });

    expect(verdict.state).toBe('DEGRADED');
    expect(verdict.greenBlocked).toBe(true);
  });
});

describe('foldDatabaseState — purity and determinism', () => {
  it('does not mutate its input', () => {
    const sources: DbStateSource[] = [healthySource('db_health_samples')];
    const snapshot = JSON.stringify(sources);
    foldDatabaseState({ sources });
    expect(JSON.stringify(sources)).toBe(snapshot);
  });

  it('is deterministic — the same input yields an identical verdict', () => {
    const input = {
      sources: [
        healthySource('db_health_samples'),
        { name: 'db_error_events', required: true, freshness: 'blind' as const, signals: [] },
      ],
    };
    expect(JSON.stringify(foldDatabaseState(input))).toBe(JSON.stringify(foldDatabaseState(input)));
  });
});
