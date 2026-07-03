import { describe, it, expect } from 'vitest';
import { buildDailyActivity, groupTeamErrorsByFingerprint } from '@/lib/admin/data/team-detail';

describe('buildDailyActivity', () => {
  const now = new Date('2026-07-02T12:00:00Z');

  it('pre-fills every day in the window with zeros', () => {
    const days = buildDailyActivity([], [], 3, now);
    expect(days).toEqual([
      { date: '2026-06-30', rounds: 0, logins: 0 },
      { date: '2026-07-01', rounds: 0, logins: 0 },
      { date: '2026-07-02', rounds: 0, logins: 0 },
    ]);
  });

  it('buckets round and login timestamps onto their day', () => {
    const days = buildDailyActivity(
      ['2026-07-01T08:00:00Z', '2026-07-01T20:00:00Z'],
      ['2026-07-02T01:00:00Z'],
      3,
      now,
    );
    const byDate = new Map(days.map((d) => [d.date, d]));
    expect(byDate.get('2026-07-01')?.rounds).toBe(2);
    expect(byDate.get('2026-07-02')?.logins).toBe(1);
    expect(byDate.get('2026-06-30')?.rounds).toBe(0);
  });

  it('drops timestamps outside the window instead of throwing', () => {
    const days = buildDailyActivity(['2026-01-01T00:00:00Z'], [], 3, now);
    expect(days.every((d) => d.rounds === 0)).toBe(true);
  });
});

describe('groupTeamErrorsByFingerprint', () => {
  it('groups by fingerprint and counts occurrences', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'Save failed', severity: 'error', fingerprint: 'fp-1' },
      { id: '2', created_at: '2026-07-01T01:00:00Z', title: 'Save failed', severity: 'error', fingerprint: 'fp-1' },
      { id: '3', created_at: '2026-07-01T02:00:00Z', title: 'Other', severity: 'critical', fingerprint: 'fp-2' },
    ]);
    expect(clusters).toHaveLength(2);
    const fp1 = clusters.find((c) => c.fingerprint === 'fp-1');
    expect(fp1?.occurrences).toBe(2);
    expect(fp1?.href).toBe('/admin/errors/fp-1');
  });

  it('treats a null fingerprint as its own singleton cluster keyed by row id', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'A', severity: 'error', fingerprint: null },
      { id: '2', created_at: '2026-07-01T00:00:00Z', title: 'B', severity: 'error', fingerprint: null },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.fingerprint).sort()).toEqual(['row:1', 'row:2']);
  });

  it('sorts most-recent cluster first and uses the latest row for title/severity', () => {
    const clusters = groupTeamErrorsByFingerprint([
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'Old title', severity: 'warning', fingerprint: 'fp-1' },
      { id: '2', created_at: '2026-07-02T00:00:00Z', title: 'New title', severity: 'critical', fingerprint: 'fp-1' },
      { id: '3', created_at: '2026-06-30T00:00:00Z', title: 'Other', severity: 'error', fingerprint: 'fp-2' },
    ]);
    expect(clusters[0]!.fingerprint).toBe('fp-1');
    expect(clusters[0]!.title).toBe('New title');
    expect(clusters[0]!.severity).toBe('critical');
    expect(clusters[0]!.lastSeen).toBe('2026-07-02T00:00:00Z');
  });

  it('returns an empty array for no rows', () => {
    expect(groupTeamErrorsByFingerprint([])).toEqual([]);
  });
});
