import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hold = vi.hoisted(() => ({ cancelHeld: vi.fn(), commitHeldNow: vi.fn(), receiptFor: vi.fn(), heldCommitFor: vi.fn() }));
const state = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, coach: { id: 'coach-1' } as { id: string } | null, ctx: { coach_id: 'coach-1' } as { coach_id: string } | null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach, error: null }) }) }) }),
  }),
}));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: async () => state.ctx }));
vi.mock('@/lib/coachhelm/v3/chat/held-runner', () => ({ heldCommitFor: hold.heldCommitFor }));
vi.mock('@/lib/coachhelm/v3/chat/undo-hold', () => ({ cancelHeld: hold.cancelHeld, commitHeldNow: hold.commitHeldNow, receiptFor: hold.receiptFor }));

import { DELETE, GET, POST } from '../route';

/** W-ASK-8, W-QC-14, S-OPEN: one held action is the coach's own. Another coach's key answers as a missing one does; nothing commits past the hold by accident. */

const KEY = 'run-key-1';
const params = { params: Promise.resolve({ key: KEY }) };
const req = (query = '', method = 'POST') => new NextRequest(`http://localhost/api/coachhelm/v3/chat/actions/${KEY}${query}`, { method });
const held = (over: Record<string, unknown> = {}) => ({ status: 'held', run_at: new Date(Date.now() + 8000).toISOString(), ...over });

beforeEach(() => {
  state.user = { id: 'u1' };
  state.coach = { id: 'coach-1' };
  state.ctx = { coach_id: 'coach-1' };
  for (const f of Object.values(hold)) f.mockReset();
});

describe('whose key it is', () => {
  it('another coach key is a 404 on every verb, and writes nothing', async () => {
    hold.receiptFor.mockResolvedValue(null);
    expect((await GET(req('', 'GET'), params)).status).toBe(404);
    expect((await POST(req('?now=1'), params)).status).toBe(404);
    expect((await DELETE(req('', 'DELETE'), params)).status).toBe(404);
    expect(hold.receiptFor).toHaveBeenCalledWith(expect.anything(), { coach_id: 'coach-1', idempotency_key: KEY });
    expect(hold.cancelHeld).not.toHaveBeenCalled();
    expect(hold.commitHeldNow).not.toHaveBeenCalled();
  });

  it('a signed-in player or a signed-out caller is a 404 before any read', async () => {
    state.coach = null;
    expect((await DELETE(req('', 'DELETE'), params)).status).toBe(404);
    state.coach = { id: 'coach-1' };
    state.user = null;
    expect((await POST(req('?now=1'), params)).status).toBe(404);
    expect(hold.receiptFor).not.toHaveBeenCalled();
  });
});

describe('the Told counts (W-QC-14)', () => {
  it('answer with the row read for this coach and key, unchanged', async () => {
    const row = { status: 'completed', notifications: [{ channel: 'bell', recipients: 11, status: 'sent' }], created: [{ kind: 'event', count: 1 }] };
    hold.receiptFor.mockResolvedValue(row);
    const res = await GET(req('', 'GET'), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
    expect(hold.receiptFor).toHaveBeenCalledTimes(1);
    expect(hold.receiptFor).toHaveBeenCalledWith(expect.anything(), { coach_id: 'coach-1', idempotency_key: KEY });
  });
});

describe('Open', () => {
  it('without now=1 nothing commits', async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect(hold.receiptFor).not.toHaveBeenCalled();
    expect(hold.commitHeldNow).not.toHaveBeenCalled();
  });

  it('with now=1 a held row commits early, not due-only', async () => {
    hold.receiptFor.mockResolvedValue(held());
    expect((await POST(req('?now=1'), params)).status).toBe(200);
    expect(hold.commitHeldNow).toHaveBeenCalledTimes(1);
    expect(hold.commitHeldNow.mock.calls[0]?.[1]).toMatchObject({ coach_id: 'coach-1', idempotency_key: KEY, due_only: false });
  });

  it('a cancelled row never commits and answers 409', async () => {
    hold.receiptFor.mockResolvedValue({ status: 'cancelled' });
    expect((await POST(req('?now=1'), params)).status).toBe(409);
    expect(hold.commitHeldNow).not.toHaveBeenCalled();
  });
});

describe('Undo and the receipt', () => {
  it('Undo inside the window cancels; after it answers late with 409', async () => {
    hold.receiptFor.mockResolvedValue(held());
    hold.cancelHeld.mockResolvedValueOnce('cancelled').mockResolvedValueOnce('late');
    expect(await (await DELETE(req('', 'DELETE'), params)).json()).toEqual({ status: 'cancelled' });
    const late = await DELETE(req('', 'DELETE'), { params: Promise.resolve({ key: KEY }) });
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ status: 'late' });
  });

  it('a receipt inside the window does not commit; one past its run_at finishes as due-only', async () => {
    hold.receiptFor.mockResolvedValue(held());
    await GET(req('', 'GET'), params);
    expect(hold.commitHeldNow).not.toHaveBeenCalled();
    hold.receiptFor.mockResolvedValue(held({ run_at: new Date(Date.now() - 1000).toISOString() }));
    await GET(req('', 'GET'), { params: Promise.resolve({ key: KEY }) });
    expect(hold.commitHeldNow).toHaveBeenCalledTimes(1);
    expect(hold.commitHeldNow.mock.calls[0]?.[1]).toMatchObject({ due_only: true });
  });
});
