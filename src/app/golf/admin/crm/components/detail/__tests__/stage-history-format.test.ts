import { describe, it, expect } from 'vitest';
import { formatStageRow } from '../stage-history-format';
import type { StageHistoryRow } from '@/app/golf/actions/crm-stage-history';

const statusLabelFor = (status: string | null): string => {
  if (!status) return 'Unknown';
  const labels: Record<string, string> = {
    new_lead: 'New Lead',
    contacted: 'Contacted',
    engaged: 'Engaged',
    proposal: 'Proposal',
    won: 'Customer',
    lost: 'Lost',
    nurture: 'Nurture',
  };
  return labels[status] ?? status;
};

describe('formatStageRow', () => {
  it('formats a seed row as a single "Tracking started" label, not an arrow pair', () => {
    const row: StageHistoryRow = {
      from_status: null,
      to_status: 'contacted',
      changed_at: '2026-07-20T12:00:00.000Z',
      source: 'seed',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('seed');
    expect(result.label).toBe('Tracking started — Contacted');
    expect(result.label).not.toContain('→');
    expect(result.dateLabel).toBe('Jul 20');
  });

  it('formats a real transition as "from → to"', () => {
    const row: StageHistoryRow = {
      from_status: 'contacted',
      to_status: 'engaged',
      changed_at: '2026-07-12T09:30:00.000Z',
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('change');
    expect(result.label).toBe('Contacted → Engaged');
    expect(result.dateLabel).toBe('Jul 12');
  });

  it('falls back gracefully when from_status is null on a non-seed row', () => {
    const row: StageHistoryRow = {
      from_status: null,
      to_status: 'proposal',
      changed_at: '2026-06-01T12:00:00.000Z',
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.kind).toBe('change');
    expect(result.label).toBe('Unknown → Proposal');
    expect(result.dateLabel).toBe('Jun 1');
  });

  it('returns an empty dateLabel for an unparseable changed_at rather than "Invalid Date"', () => {
    const row: StageHistoryRow = {
      from_status: 'new_lead',
      to_status: 'contacted',
      changed_at: 'not-a-date',
      source: 'stage_change',
    };

    const result = formatStageRow(row, statusLabelFor);

    expect(result.dateLabel).toBe('');
    expect(result.label).toBe('New Lead → Contacted');
  });
});
