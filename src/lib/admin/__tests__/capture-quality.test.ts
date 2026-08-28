/**
 * Capture quality analyser.
 *
 * This is a measurement over rows that already exist, not an instrumentation
 * change — see the module doc comment in capture-quality.ts for why the
 * metric exists. These tests are about the analyser staying honest: a zero
 * denominator must never read as "we capture nothing", expected auth noise
 * must never inflate a real gap, and the weakest-emitter ranking must point
 * at an actual call site rather than a plausible-looking guess.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeCaptureQuality,
  CAPTURE_FIELDS,
  CAPTURE_FIELD_LABEL,
  type CaptureField,
} from '@/lib/admin/data/capture-quality';
import type { AppTriageEventRow } from '@/lib/admin/data/triage';

const NOW = new Date('2026-08-27T23:49:11.000Z').getTime();

function row(over: Partial<AppTriageEventRow> = {}): AppTriageEventRow {
  return {
    id: 'evt-1',
    title: 'Something failed',
    message: 'Something failed',
    severity: 'error',
    sport: 'golf',
    fingerprint: 'fp-1',
    user_id: 'user-1',
    user_email: null,
    url: '/golf/dashboard',
    created_at: '2026-08-27T10:00:00.000Z',
    source: 'server-action',
    feature: 'recruiting',
    stack_trace: 'Error: boom\n  at foo (bar.ts:1:1)',
    metadata: { action: 'saveEvent', errorCode: 'PGRST100' },
    ...over,
  };
}

function fieldRatio(fields: readonly { field: CaptureField; ratio: number | null }[], field: CaptureField) {
  return fields.find((f) => f.field === field)?.ratio ?? null;
}

describe('analyzeCaptureQuality — field presence', () => {
  it('a row with every field populated counts present for all of them', () => {
    const report = analyzeCaptureQuality([row()], 72, NOW);
    expect(report.rows).toBe(1);
    for (const field of CAPTURE_FIELDS) {
      expect(fieldRatio(report.fields, field)).toBe(1);
    }
  });

  it('a row with metadata: null and no stack counts absent for error-code/stack/action, but present for the columns it still carries', () => {
    const report = analyzeCaptureQuality(
      [row({ metadata: null, stack_trace: null })],
      72,
      NOW,
    );
    expect(fieldRatio(report.fields, 'error-code')).toBe(0);
    expect(fieldRatio(report.fields, 'stack')).toBe(0);
    expect(fieldRatio(report.fields, 'action')).toBe(0);
    // url, feature and user_id are plain columns, independent of metadata —
    // a null metadata blob must not blank these out too.
    expect(fieldRatio(report.fields, 'route')).toBe(1);
    expect(fieldRatio(report.fields, 'feature')).toBe(1);
    expect(fieldRatio(report.fields, 'user')).toBe(1);
  });
});

describe('analyzeCaptureQuality — expected auth noise', () => {
  it('excludes expected auth noise from the denominator entirely', () => {
    const real = [row({ id: 'a' }), row({ id: 'b' })];
    const withoutNoise = analyzeCaptureQuality(real, 72, NOW);

    const noiseRow = row({
      id: 'noise',
      title: 'Unauthorized',
      message: 'You must be signed in.',
      user_id: null,
      user_email: null,
    });
    const withNoise = analyzeCaptureQuality([...real, noiseRow], 72, NOW);

    // A signed-out background poll rejecting itself is correct control flow,
    // not a capture gap — counting it would make a thin-by-design row look
    // like a call site that needs instrumenting. `rows` must not move.
    expect(withNoise.rows).toBe(withoutNoise.rows);
    expect(withNoise.rows).toBe(2);
  });
});

describe('analyzeCaptureQuality — ratio', () => {
  it('is null, not 0, when there are no rows', () => {
    const report = analyzeCaptureQuality([], 72, NOW);
    expect(report.rows).toBe(0);
    for (const field of report.fields) {
      expect(field.ratio).toBeNull();
    }
  });

  it('is strictly between 0 and 1 for a mixed fixture (non-vacuity)', () => {
    const report = analyzeCaptureQuality(
      [
        row({ id: 'a' }),
        row({ id: 'b' }),
        row({ id: 'c', url: null, metadata: { action: 'saveEvent', errorCode: 'PGRST100' } }),
        row({ id: 'd', url: null, metadata: { action: 'saveEvent', errorCode: 'PGRST100' } }),
      ],
      72,
      NOW,
    );
    expect(report.fields.some((f) => f.ratio !== null && f.ratio > 0 && f.ratio < 1)).toBe(true);
    expect(fieldRatio(report.fields, 'route')).toBe(0.5);
  });
});

describe('analyzeCaptureQuality — weakestSources', () => {
  it('ranks worst first by total missing fields, capped at 5', () => {
    // source-a: one row missing everything (6 gaps).
    const sourceA = row({ id: 'a', source: 'source-a', metadata: null, stack_trace: null, url: null, feature: null, user_id: null, user_email: null, title: 'Load failed (a)' });
    // source-b: five rows each missing exactly one field (5 gaps total).
    const sourceB = ['b1', 'b2', 'b3', 'b4', 'b5'].map((id, i) =>
      row({ id, source: 'source-b', feature: null, title: `Load failed (b${i})` }),
    );
    // source-c: fully captured (0 gaps) — should rank last among the three.
    const sourceC = row({ id: 'c', source: 'source-c', title: 'Load failed (c)' });
    // Four more sources, all worse than nothing but weaker than a/b, to
    // exercise the cap.
    const filler = ['d', 'e', 'f', 'g'].map((id) =>
      row({ id, source: `source-${id}`, feature: null, title: `Load failed (${id})` }),
    );

    const report = analyzeCaptureQuality([sourceA, ...sourceB, sourceC, ...filler], 72, NOW);

    expect(report.weakestSources).toHaveLength(5);
    expect(report.weakestSources[0]!.source).toBe('source-a');
    expect(report.weakestSources[0]!.missing).toBe(6);
    expect(report.weakestSources[1]!.source).toBe('source-b');
    expect(report.weakestSources[1]!.missing).toBe(5);
    // source-c (0 gaps) must not appear in a worst-first, capped-at-5 list
    // once seven weaker sources exist.
    expect(report.weakestSources.some((s) => s.source === 'source-c')).toBe(false);
  });

  it("each entry's sampleTitle is a real title drawn from that group's rows", () => {
    const rows = [
      row({ id: 'a1', source: 'source-a', title: 'Load failed at checkout' }),
      row({ id: 'a2', source: 'source-a', title: 'Load failed at review' }),
    ];
    const report = analyzeCaptureQuality(rows, 72, NOW);
    const entry = report.weakestSources.find((s) => s.source === 'source-a');
    expect(entry).toBeDefined();
    expect(rows.map((r) => r.title)).toContain(entry!.sampleTitle);
  });
});

describe('CAPTURE_FIELDS / CAPTURE_FIELD_LABEL', () => {
  it('cover exactly the same keys, so an added field without a label fails here', () => {
    const labelKeys = Object.keys(CAPTURE_FIELD_LABEL).sort();
    const fieldKeys = [...CAPTURE_FIELDS].sort();
    expect(labelKeys).toEqual(fieldKeys);
    for (const field of CAPTURE_FIELDS) {
      expect(CAPTURE_FIELD_LABEL[field].length).toBeGreaterThan(0);
    }
  });
});
