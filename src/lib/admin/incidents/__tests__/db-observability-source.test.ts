import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchDatabaseMissionControl: vi.fn() }));
vi.mock('@/lib/admin/database/overview', () => ({ fetchDatabaseMissionControl: mocks.fetchDatabaseMissionControl }));

import { readDatabaseObservabilitySourceHealth } from '../db-observability-source';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readDatabaseObservabilitySourceHealth', () => {
  it('reports unknown (not blind) when the migration is unconfigured — nothing failed, nothing was attempted', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue({ status: 'unconfigured', data: null, fetchedAt: null, error: 'not shipped' });
    const reading = await readDatabaseObservabilitySourceHealth();
    expect(reading.source).toBe('database');
    expect(reading.health).toBe('unknown');
    expect(reading.observedAt).toBeNull();
  });

  it('reports blind on a genuine read failure', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue({ status: 'error', data: null, fetchedAt: null, error: 'connection failure' });
    const reading = await readDatabaseObservabilitySourceHealth();
    expect(reading.health).toBe('blind');
    expect(reading.reason).toBe('connection failure');
  });

  it('reports unknown when the reader is ok but no sample has been written yet', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue({
      status: 'ok',
      data: { latestSample: null, history: [], collectors: [], notApplied: false },
      fetchedAt: 'now',
    });
    const reading = await readDatabaseObservabilitySourceHealth();
    expect(reading.health).toBe('unknown');
  });

  it('reports reading with the sample timestamp when the collector is healthy', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue({
      status: 'ok',
      data: {
        latestSample: { sampledAt: '2026-09-03T12:00:00.000Z', collectorStatus: 'ok' },
        history: [],
        collectors: [],
        notApplied: false,
      },
      fetchedAt: 'now',
    });
    const reading = await readDatabaseObservabilitySourceHealth();
    expect(reading.health).toBe('reading');
    expect(reading.observedAt).toBe('2026-09-03T12:00:00.000Z');
    expect(reading.reason).toBeNull();
  });

  it('reports partial when the collector ran but degraded', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue({
      status: 'ok',
      data: {
        latestSample: { sampledAt: '2026-09-03T12:00:00.000Z', collectorStatus: 'reset_detected' },
        history: [],
        collectors: [],
        notApplied: false,
      },
      fetchedAt: 'now',
    });
    const reading = await readDatabaseObservabilitySourceHealth();
    expect(reading.health).toBe('partial');
    expect(reading.reason).toContain('reset_detected');
  });
});
