/** E9 (Bridge plan §4.2): the server half of a failed Clubhouse action rides on the row withAdminObserved writes. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flags = { on: true };
const ui = { value: 'clubhouse' as string | null };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flags.on }));
vi.mock('@/lib/observability/ui-surface', () => ({ CLUBHOUSE_UI: 'clubhouse', ambientUiSurface: () => ui.value }));

import { clubhouseServerHalf } from '../observed-action';

beforeEach(() => {
  flags.on = true;
  ui.value = 'clubhouse';
});

describe('clubhouseServerHalf (E9)', () => {
  it('names the duration, the Postgres code and the table of a Clubhouse failure', () => {
    const half = clubhouseServerHalf({ code: '42501', message: 'new row violates row-level security policy for table "golf_messages"' }, performance.now() - 40);
    expect(half).toMatchObject({ origin: 'E9', kind: 'action', outcome: 'failure', serverCode: '42501', table: 'golf_messages' });
    expect(half?.durationMs).toBeGreaterThanOrEqual(39);
  });
  it('keeps a code only when it looks like one, and a table only when the message names one', () => {
    expect(clubhouseServerHalf({ code: 'not a code', message: 'boom' }, performance.now())).toMatchObject({ serverCode: null, table: null });
    // App copy is not a table name: Postgres always quotes it (security review L3).
    expect(clubhouseServerHalf({ message: "Couldn't add to table Jane" }, performance.now())).toMatchObject({ table: null });
    expect(clubhouseServerHalf({ message: 'relation "public.golf_rounds" does not exist' }, performance.now())).toMatchObject({ table: 'public.golf_rounds' });
  });
  it('adds nothing off Clubhouse or with the switch off', () => {
    ui.value = 'fairway';
    expect(clubhouseServerHalf({ code: '42501' }, performance.now())).toBeNull();
    ui.value = 'clubhouse';
    flags.on = false;
    expect(clubhouseServerHalf({ code: '42501' }, performance.now())).toBeNull();
  });
});
