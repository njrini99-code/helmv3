// =============================================================================
// Recruiting sunset — the PUBLIC scout-packet share link.
//
// /baseball/packet/<token> is the only recruiting surface reachable with NO
// session: an unauthenticated college coach opens a link from their inbox. The
// nav gate, the server route guards and the middleware gate all key off a
// session or a dashboard pathname, so every one of them misses this route.
// Left open, a sunset module would keep serving a high-school player's
// measurables, video and season line to anyone holding an old URL.
//
// The gate lives in resolveScoutPacketByToken, before the token is resolved,
// so both the page and the CSV route (/baseball/packet/<token>/csv) are
// covered by one check rather than two that can drift.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  assembleScoutPacket: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/baseball/read-models/scout-packet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/read-models/scout-packet')>();
  return { ...actual, assembleScoutPacket: mocks.assembleScoutPacket };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { resolveScoutPacketByToken } from '../scout-packet';

describe('resolveScoutPacketByToken — recruiting sunset gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moduleFlags.recruitingEnabled = false;
  });

  afterEach(() => {
    moduleFlags.recruitingEnabled = false;
  });

  it('refuses every token while the module is disabled', async () => {
    const model = await resolveScoutPacketByToken('a-perfectly-valid-looking-token');

    expect(model.ok).toBe(false);
    expect(model.reason).toBe('module_disabled');
  });

  it('never touches the database — the packet is not assembled, only withheld', async () => {
    // Refusing AFTER assembly would still read a player's PII into memory and
    // bump the link's view telemetry, recording a view that was never served.
    await resolveScoutPacketByToken('some-token');

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.assembleScoutPacket).not.toHaveBeenCalled();
  });

  it('leaks no player data in the refused model', async () => {
    const model = await resolveScoutPacketByToken('some-token');

    expect(model.playerId).toBeNull();
    expect(model.playerName).toBeNull();
    expect(model.programName).toBeNull();
    expect(model.teamId).toBeNull();
    expect(model.visibilityState).toBeNull();
    expect(model.contactRules).toBeNull();
    expect(model.identity).toEqual([]);
    expect(model.measurables).toEqual([]);
    expect(model.videos).toEqual([]);
    expect(model.visibleNotes).toEqual([]);
    expect(model.season).toBeNull();
  });

  it('reports module_disabled, NOT revoked — the program turned nothing off', async () => {
    // The distinction is user-facing: `revoked` tells a college coach the
    // program cut them off, which would be a false statement about a decision
    // the program never made, and generates a phone call about it.
    const model = await resolveScoutPacketByToken('some-token');

    expect(model.reason).not.toBe('revoked');
    expect(model.reason).not.toBe('expired');
    expect(model.reason).not.toBe('not_exposed');
  });

  it('resolves tokens again once the module is re-enabled (restoration path)', async () => {
    // Proves the gate is the ONLY thing stopping resolution — the packet
    // pipeline behind it is untouched and comes straight back.
    moduleFlags.recruitingEnabled = true;

    const model = await resolveScoutPacketByToken('');

    // Empty token, so this is the pre-existing not_found branch — reached only
    // because the module gate let execution past it.
    expect(model.reason).toBe('not_found');
  });
});
