import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';

describe('CRON_REGISTRY ↔ vercel.json contract', () => {
  it('covers every scheduled cron path exactly', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string }>;
    };
    const scheduled = vercel.crons.map((c) => c.path).sort();
    const registered = CRON_REGISTRY.map((e) => e.path).sort();
    expect(registered).toEqual(scheduled);
  });
});

describe('classifyCronStatus', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  const hourly = { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60 };
  const runAt = (minAgo: number, status = 'completed') => ({
    started_at: new Date(now.getTime() - minAgo * 60000).toISOString(),
    status,
  });

  it('ok within 1.5x cadence', () => {
    expect(classifyCronStatus(hourly, runAt(45), now)).toBe('ok');
  });
  it('OVERDUE past 1.5x cadence — a dead cron writes nothing, absence IS the signal', () => {
    expect(classifyCronStatus(hourly, runAt(95), now)).toBe('overdue');
  });
  it('never-ran when no row exists', () => {
    expect(classifyCronStatus(hourly, null, now)).toBe('never-ran');
  });
  it('failed when the latest run failed (even if recent)', () => {
    expect(classifyCronStatus(hourly, runAt(5, 'failed'), now)).toBe('failed');
  });
});
