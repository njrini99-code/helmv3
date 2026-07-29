// =============================================================================
// The Bridge read gate must agree with the Bridge write gate.
//
// These tests changed shape on 2026-07-29 because the BEHAVIOUR deliberately
// changed. They used to encode "SUPER_ADMIN_USER_IDS decides", which is what
// produced the incident: the console gated on the env var while
// `resolve_admin_event` gated on `is_super_admin()` reading the
// `admin_allowlist` table, an account sat in one and not the other, and every
// Resolve click raised Forbidden while the console looked completely healthy.
// Measured: 0 events resolved in 24h.
//
// The gate now calls `is_super_admin()` itself, so there is only one rule. The
// env var survives as break-glass for an UNREACHABLE database — see the
// degraded cases below, which are the reason this is not simply "read the
// table instead".
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

// react's cache() memoises per request; there is no request here, so reset the
// module registry between loads or the first RPC answer would serve them all.
async function loadGate() {
  vi.resetModules();
  return import('@/lib/admin/require-super-admin');
}

const NICK = '11111111-1111-1111-1111-111111111111';

/** The RPC answered cleanly. */
const dbSays = (isSuperAdmin: boolean) =>
  mocks.rpc.mockResolvedValue({ data: isSuperAdmin, error: null });

/** The RPC could not be reached — Postgres down, timeout, 522. */
const dbUnreachable = () =>
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: 'canceling statement due to statement timeout' },
  });

describe('requireSuperAdmin / checkSuperAdminAccess', () => {
  beforeEach(() => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', NICK);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: NICK, email: 'admin@helmsportslabs.com' } },
    });
    dbSays(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
  });

  it('returns context when is_super_admin() says yes', async () => {
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).resolves.toEqual({
      userId: NICK,
      email: 'admin@helmsportslabs.com',
    });
  });

  it('throws Unauthorized when there is no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).rejects.toThrow('Unauthorized');
  });

  it('DENIES when the database says no, even though the env var says yes', async () => {
    // THE REGRESSION TEST. This is the exact production state on 2026-07-29:
    // in SUPER_ADMIN_USER_IDS, absent from admin_allowlist. The old gate
    // allowed it, handed over a fully-rendered console, and let every write
    // fail with a bare `Forbidden`. Denying honestly beats a console that
    // cannot do anything — and it is the only way the read gate and the write
    // gate can be the same gate.
    dbSays(false);
    const { requireSuperAdmin } = await loadGate();
    await expect(
      requireSuperAdmin(),
      'The env var overrode a successful "no" from is_super_admin(). That is ' +
        'the console-can-read-but-not-write split that cost hours to diagnose.',
    ).rejects.toThrow('Forbidden');
  });

  it('denies an authenticated non-admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
    dbSays(false);
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
  });

  it('break-glass: falls back to the env var when the RPC is UNREACHABLE', async () => {
    // Postgres served zero queries for 9.4 hours earlier the same day. Locking
    // admins out of the console during an outage is the one failure mode worse
    // than the split this replaces.
    dbUnreachable();
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).resolves.toEqual({
      userId: NICK,
      email: 'admin@helmsportslabs.com',
      degraded: true,
    });
  });

  it('break-glass still fails CLOSED when the env allowlist is unset', async () => {
    vi.stubEnv('SUPER_ADMIN_USER_IDS', '');
    dbUnreachable();
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
  });

  it('break-glass does not admit someone the env var does not list', async () => {
    // Non-vacuity for the fallback: a narrower path, not an open door.
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
    dbUnreachable();
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).rejects.toThrow('Forbidden');
  });

  it('a thrown RPC is treated as unreachable, not as a denial', async () => {
    mocks.rpc.mockRejectedValue(new Error('fetch failed'));
    const { requireSuperAdmin } = await loadGate();
    await expect(requireSuperAdmin()).resolves.toMatchObject({ degraded: true });
  });

  it('probe variant never throws (the checkAdminAccess polling-flood lesson)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'intruder', email: 'x@y.z' } } });
    dbSays(false);
    const { checkSuperAdminAccess } = await loadGate();
    await expect(checkSuperAdminAccess()).resolves.toEqual({
      allowed: false,
      reason: 'forbidden',
    });

    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const gate2 = await loadGate();
    await expect(gate2.checkSuperAdminAccess()).resolves.toEqual({
      allowed: false,
      reason: 'unauthenticated',
    });
  });

  it('wraps the allowlist read in react cache() for per-request dedupe', async () => {
    // Structural, not behavioural, and deliberately so. `cache()` memoises
    // within a React REQUEST SCOPE; vitest has no such scope, so calling the
    // gate three times here really does issue three RPCs and asserting
    // "called once" would be asserting something this environment cannot
    // demonstrate. Verified by trying it: 3, not 1.
    //
    // What is worth pinning is that the wrapper is present at all, since
    // removing it is silent — a layout + page + action render pays one RPC
    // each instead of sharing one.
    const src = readFileSync(join(__dirname, '..', 'require-super-admin.ts'), 'utf8');
    expect(src).toMatch(/import \{ cache \} from 'react'/);
    expect(src).toMatch(/cache\(async \(\)/);
  });
});
