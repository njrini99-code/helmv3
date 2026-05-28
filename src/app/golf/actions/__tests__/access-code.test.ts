import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * The signup gate accepts either the global SIGNUP_ACCESS_CODE or any existing
 * team's join_code. Coaches share alphanumeric join codes ([A-Z2-9], e.g.
 * "K7PQX4MN") and players copy/paste or hand-type them, so the check must be
 * whitespace-tolerant and case-insensitive, and a real join code must be
 * accepted even when it isn't the global code. The team lookup uses the admin
 * client (mocked below) and must never throw the gate.
 */

// Spy-able mock of the admin client query chain:
//   admin.from('golf_teams').select('id').eq('join_code', X).limit(1).maybeSingle()
const maybeSingle = vi.fn();
const limit = vi.fn(() => ({ maybeSingle }));
const eq = vi.fn(() => ({ limit }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createAdminClient = vi.fn(() => ({ from }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}));

import { validateAccessCode } from '../access-code';

describe('validateAccessCode', () => {
  const original = process.env.SIGNUP_ACCESS_CODE;

  beforeEach(() => {
    // Default: the entered code matches no team.
    createAdminClient.mockImplementation(() => ({ from }));
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SIGNUP_ACCESS_CODE;
    else process.env.SIGNUP_ACCESS_CODE = original;
    vi.clearAllMocks();
  });

  // ── global access code ──────────────────────────────────────────────────
  it('accepts the configured numeric code (default 1881)', async () => {
    delete process.env.SIGNUP_ACCESS_CODE;
    expect(await validateAccessCode('1881')).toBe(true);
  });

  it('accepts an alphanumeric global code', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('HELM25')).toBe(true);
  });

  it('tolerates surrounding whitespace', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('  HELM25  ')).toBe(true);
  });

  it('accepts the global code case-insensitively', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('helm25')).toBe(true);
    expect(await validateAccessCode('Helm25')).toBe(true);
  });

  it('rejects empty/blank input', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    expect(await validateAccessCode('')).toBe(false);
    expect(await validateAccessCode('   ')).toBe(false);
  });

  // ── team join code (coach-invited players) ──────────────────────────────
  it('accepts a valid team join code even when it is not the global code', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    expect(await validateAccessCode('K7PQX4MN')).toBe(true);
  });

  it('looks up the join code upper-cased and trimmed', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: { id: 'team-1' }, error: null });
    await validateAccessCode('  k7pqx4mn  ');
    expect(eq).toHaveBeenCalledWith('join_code', 'K7PQX4MN');
  });

  it('rejects a code matching neither the global code nor any team', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await validateAccessCode('ZZZZZZZZ')).toBe(false);
  });

  it('never throws the gate when the team lookup fails (returns false)', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockRejectedValue(new Error('service role unavailable'));
    expect(await validateAccessCode('K7PQX4MN')).toBe(false);
  });

  it('still accepts the global code when the team lookup would fail', async () => {
    process.env.SIGNUP_ACCESS_CODE = 'HELM25';
    maybeSingle.mockRejectedValue(new Error('service role unavailable'));
    expect(await validateAccessCode('HELM25')).toBe(true);
  });
});
