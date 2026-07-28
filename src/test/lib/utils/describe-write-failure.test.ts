import { describe, it, expect } from 'vitest';
import { describeWriteFailure } from '@/lib/utils/describe-error';

describe('describeWriteFailure', () => {
  it('lifts the Postgres code, details and hint out of a PostgrestError', () => {
    const extra = describeWriteFailure(
      {
        code: '23514',
        message: 'new row violates check constraint "golf_goals_window_range"',
        details: 'Failing row contains (…)',
        hint: null,
      },
      { scope: 'all' },
    );

    expect(extra).toMatchObject({
      scope: 'all',
      pgCode: '23514',
      pgDetails: 'Failing row contains (…)',
      transport: false,
    });
  });

  it('flags a supabase-js transport failure, which carries no Postgres code', () => {
    // supabase-js reports a failed fetch through the same PostgrestError shape
    // but with an empty code — the discriminator triage actually needs.
    const extra = describeWriteFailure({
      message: 'TypeError: fetch failed',
      details: 'at node:internal/deps/undici…',
      hint: '',
      code: '',
    });

    expect(extra.transport).toBe(true);
    expect(extra.pgCode).toBeNull();
  });

  it('does not mistake a thrown Error for a transport failure', () => {
    expect(describeWriteFailure(new Error('boom')).transport).toBe(false);
  });

  it('survives a null error without throwing', () => {
    expect(describeWriteFailure(null, { eventId: 'e1' })).toMatchObject({
      eventId: 'e1',
      pgCode: null,
      transport: false,
    });
  });

  it('keeps caller context alongside the lifted fields', () => {
    const extra = describeWriteFailure({ code: '57014', message: 'canceling statement' }, {
      scope: 'thisAndFuture',
      rootId: 'root-1',
      columns: ['title'],
    });

    expect(extra.scope).toBe('thisAndFuture');
    expect(extra.rootId).toBe('root-1');
    expect(extra.columns).toEqual(['title']);
    expect(extra.pgCode).toBe('57014');
  });
});
