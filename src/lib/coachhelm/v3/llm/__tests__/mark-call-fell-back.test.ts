import { describe, it, expect, vi, beforeEach } from 'vitest';

// markCallFellBackToTemplate (Bridge 1cd457e7): a caller-side discard of a
// reply compose() logged as a success must flip that golf_coachhelm_llm_calls
// row to fallback_to_template=true, keep the citations compose() recorded,
// and never throw.

const { updates, logServerErrorMock, state } = vi.hoisted(() => ({
  updates: [] as Array<{ id: unknown; patch: Record<string, unknown> }>,
  logServerErrorMock: vi.fn(async () => undefined),
  state: {
    existing: { citations: { unmatched_tokens: [] } } as { citations: unknown } | null,
    updateError: null as { message: string } | null,
    readError: null as { message: string } | null,
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.existing, error: state.readError }) }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: unknown) => {
          updates.push({ id, patch });
          return { error: state.updateError };
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: logServerErrorMock,
  logServerEvent: vi.fn(async () => undefined),
}));

import { markCallFellBackToTemplate } from '../compose';

describe('markCallFellBackToTemplate', () => {
  beforeEach(() => {
    updates.length = 0;
    logServerErrorMock.mockClear();
    state.existing = { citations: { unmatched_tokens: [] } };
    state.updateError = null;
    state.readError = null;
  });

  it('leaves the row alone when it cannot read the existing citations', async () => {
    state.readError = { message: 'timeout' };
    await markCallFellBackToTemplate('call-1', { reason: 'style_violation' });
    expect(updates).toEqual([]);
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('read failed'),
      expect.objectContaining({ action: 'v3.llm.markCallFellBackToTemplate' }),
    );
  });

  it('flips the row to a template fallback and merges the reason into citations', async () => {
    await markCallFellBackToTemplate('call-1', { reason: 'style_violation', violations: ['too_many_words'] });

    expect(updates).toEqual([
      {
        id: 'call-1',
        patch: {
          fallback_to_template: true,
          citations: { unmatched_tokens: [], reason: 'style_violation', violations: ['too_many_words'] },
        },
      },
    ]);
  });

  it('does nothing without a call log id', async () => {
    await markCallFellBackToTemplate(null, { reason: 'style_violation' });
    expect(updates).toEqual([]);
  });

  it('logs a failed write instead of throwing', async () => {
    state.updateError = { message: 'boom' };
    await expect(markCallFellBackToTemplate('call-1', { reason: 'style_violation' })).resolves.toBeUndefined();
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('markCallFellBackToTemplate failed'),
      expect.objectContaining({ action: 'v3.llm.markCallFellBackToTemplate' }),
    );
  });
});
