import { describe, expect, it } from 'vitest';
import { earlierOf } from '../earlier-today';

const AT = '2026-11-04T14:05:00Z';
const receipt = (data: Record<string, unknown>) => ({ created_at: AT, ui_parts: [{ type: 'text' }, { type: 'data-action-receipt', data }] });

describe('Earlier today', () => {
  it('names the latest receipt and who was told, on the time it happened', () => {
    const older = receipt({ summary: 'Old', status: 'completed', notifications: [] });
    const row = earlierOf([older, receipt({ summary: 'Added Range', status: 'completed', notifications: [{ recipients: 6, status: 'sent' }] })], AT, 'UTC');
    expect(row?.title).toBe('Added Range');
    expect(row?.line).toBe('6 players told');
    expect(row?.at).toMatch(/2:05/);
  });
  it('says nobody when a delivery failed', () => {
    expect(earlierOf([receipt({ summary: 'S', status: 'completed', notifications: [{ recipients: 6, status: 'failed' }] })], AT, 'UTC')?.line).toBe('Nobody was told');
  });
  it('leaves the block out for a failed write, or a chat with no receipt', () => {
    expect(earlierOf([receipt({ summary: 'S', status: 'failed' })], AT)).toBeNull();
    expect(earlierOf([{ ui_parts: [{ type: 'text' }] }], AT)).toBeNull();
  });
});

describe('the pour', () => {
  it('stays the settle the owner approved: no bounce, 0.42s', async () => {
    const { CH_SPRINGS } = await import('../../../lib/motion');
    expect(CH_SPRINGS.pour).toEqual({ visualDuration: 0.42, bounce: 0 });
  });
});
