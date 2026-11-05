import { describe, expect, it, vi } from 'vitest';
import { holdForExecution } from '../undo-hold';

/** W-QC-12, W-ASK-12: a stack without HM1 never fakes an Undo. Only a missing column means "no hold"; any other error is reported as an error. */

const client = (error: { code: string } | null) => {
  const update = vi.fn(() => chain);
  const chain = { update, eq: vi.fn(() => chain), then: (ok: (r: { error: unknown }) => unknown) => Promise.resolve({ error }).then(ok) };
  return { from: () => chain, update } as never as Parameters<typeof holdForExecution>[0] & { update: typeof update };
};

describe('holdForExecution', () => {
  it('holds for eight seconds from now', async () => {
    const sb = client(null);
    await expect(holdForExecution(sb, { run_id: 'r1', now: 1_000 })).resolves.toEqual({ kind: 'held', run_at: new Date(9_000).toISOString() });
    expect(sb.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'held', run_at: new Date(9_000).toISOString() }));
  });

  it.each(['42703', '23514'])('code %s means HM1 is not applied', async (code) => {
    await expect(holdForExecution(client({ code }), { run_id: 'r1' })).resolves.toEqual({ kind: 'no_column' });
  });

  it('any other failure stays an error, told apart from a missing column', async () => {
    await expect(holdForExecution(client({ code: '57014' }), { run_id: 'r1' })).resolves.toEqual({ kind: 'error' });
  });
});
