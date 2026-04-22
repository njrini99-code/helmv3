import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/golf/actions/insights', () => ({
  triggerPlayerInsightsAfterRound: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER the mocks are registered so the route picks up the stubbed deps.
import { POST } from '@/app/api/coachhelm/analyze-player/route';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';

const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

describe('POST /api/coachhelm/analyze-player', () => {
  beforeEach(() => {
    triggerMock.mockReset();
    process.env.COACHHELM_INTERNAL_SECRET = 'shh';
  });

  afterEach(() => {
    delete process.env.COACHHELM_INTERNAL_SECRET;
  });

  it('rejects requests without the internal-shared-secret header', async () => {
    const req = new Request('http://x/api/coachhelm/analyze-player', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: VALID_UUID }),
    });

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(401);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('rejects when the secret is wrong', async () => {
    const req = new Request('http://x/api/coachhelm/analyze-player', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'nope',
      },
      body: JSON.stringify({ playerId: VALID_UUID }),
    });

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(401);
  });

  it('returns 400 when playerId is not a UUID', async () => {
    const req = new Request('http://x/api/coachhelm/analyze-player', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'shh',
      },
      body: JSON.stringify({ playerId: 'not-a-uuid' }),
    });

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(400);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('runs triggerPlayerInsightsAfterRound when the secret matches', async () => {
    triggerMock.mockResolvedValueOnce({ success: true, insights_created: 2 });

    const req = new Request('http://x/api/coachhelm/analyze-player', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'shh',
      },
      body: JSON.stringify({ playerId: VALID_UUID, triggerReason: 'round_submitted' }),
    });

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    expect(triggerMock).toHaveBeenCalledWith(VALID_UUID);
    const body = (await res.json()) as { success: boolean; stats: { insightsCreated: number } };
    expect(body.success).toBe(true);
    expect(body.stats.insightsCreated).toBe(2);
  });

  it('surfaces engine failures as success=false with status 200', async () => {
    triggerMock.mockResolvedValueOnce({ success: false, error: 'CoachHelm disabled for team' });

    const req = new Request('http://x/api/coachhelm/analyze-player', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'shh',
      },
      body: JSON.stringify({ playerId: VALID_UUID }),
    });

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('disabled');
  });
});
