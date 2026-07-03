// Regression pack — #442/#443: camp registration capacity.
//
// Capacity enforcement itself (row lock + atomic count + reject-over-capacity)
// lives entirely in the `baseball_register_for_camp` Postgres RPC
// (supabase/migrations/20260701000442_baseball_camp_register_atomic.sql) —
// concurrency and true atomicity cannot be exercised from a mocked vitest
// unit test. This test instead pins the CALLER contract: registerForCamp
// requires authentication, calls the atomic RPC (never a raw insert that
// could reintroduce the pre-#442 race), and maps every RPC outcome
// (registered/full/already_registered/not_found/unauthorized/transport
// error) to the correct { success, error } shape. A pgTAP suite covering the
// RPC's actual atomicity under concurrency is a tracked follow-up (see
// docs/audits/HELMV3_STABILIZATION_MASTER_REPORT_2026-07-03.md).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    rpc,
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { registerForCamp } from '@/app/baseball/actions/camps';
import { revalidatePath } from 'next/cache';

describe('registerForCamp (#442/#443)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('rejects unauthenticated callers before ever calling the RPC', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await registerForCamp('camp-1');
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the atomic baseball_register_for_camp RPC, not a raw insert', async () => {
    rpc.mockResolvedValue({ data: 'registered', error: null });
    await registerForCamp('camp-1');
    expect(rpc).toHaveBeenCalledWith('baseball_register_for_camp', { p_camp_id: 'camp-1' });
  });

  it('#442: maps "full" (capacity reached) to a clean user-facing error, no success', async () => {
    rpc.mockResolvedValue({ data: 'full', error: null });
    const result = await registerForCamp('camp-1');
    expect(result).toEqual({ success: false, error: 'This camp is full' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('#443: "already_registered" (an active, non-cancelled registration exists) is rejected', async () => {
    rpc.mockResolvedValue({ data: 'already_registered', error: null });
    const result = await registerForCamp('camp-1');
    expect(result).toEqual({ success: false, error: 'Already registered for this camp' });
  });

  it('#443: a re-register after cancellation succeeds (RPC flips the cancelled row back to registered)', async () => {
    // The RPC treats a cancelled registration as re-registerable, not a
    // duplicate — this is exercised at the RPC layer (a cancelled row is
    // UPDATEd, not blocked as already_registered). The action just needs to
    // surface success when the RPC returns 'registered'.
    rpc.mockResolvedValue({ data: 'registered', error: null });
    const result = await registerForCamp('camp-1');
    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('maps "not_found" and "unauthorized" RPC outcomes without crashing', async () => {
    rpc.mockResolvedValue({ data: 'not_found', error: null });
    expect(await registerForCamp('camp-x')).toEqual({ success: false, error: 'Camp not found' });

    rpc.mockResolvedValue({ data: 'unauthorized', error: null });
    expect(await registerForCamp('camp-1')).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('a transport-level RPC error never surfaces as a false success', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const result = await registerForCamp('camp-1');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('an unrecognized RPC response string fails safely rather than defaulting to success', async () => {
    rpc.mockResolvedValue({ data: 'some_future_status', error: null });
    const result = await registerForCamp('camp-1');
    expect(result.success).toBe(false);
  });
});
