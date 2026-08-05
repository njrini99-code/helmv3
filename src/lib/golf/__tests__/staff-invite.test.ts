import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  signStaffInvite,
  verifyStaffInvite,
  STAFF_INVITE_TTL_MS,
} from '../staff-invite';

/**
 * Staff invitations must not be forgeable, and must not be upgradeable.
 *
 * The first attempt at staff invitation let a caller submit a team's JOIN CODE
 * plus the role they wanted. The join code is handed to every player, so any
 * athlete could have made themselves head coach of the whole program. These
 * tests exist to make sure the replacement cannot be talked into the same
 * thing: the role lives INSIDE a signed token, and touching it breaks the
 * signature.
 */

const TEAM = 'team-womens-uuid';
const ORG = 'org-shenandoah-uuid';
const KEY = 'internal-secret-for-tests';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.COACHHELM_INTERNAL_SECRET;
  process.env.COACHHELM_INTERNAL_SECRET = KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.COACHHELM_INTERNAL_SECRET;
  else process.env.COACHHELM_INTERNAL_SECRET = saved;
});

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
const reencode = (payload: unknown, sig: string) =>
  `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${sig}`;

describe('staff invite tokens', () => {
  it('round-trips the role it was minted with', () => {
    for (const role of ['coach', 'admin'] as const) {
      const token = signStaffInvite(TEAM, ORG, role)!;
      const v = verifyStaffInvite(token);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.payload.r).toBe(role);
        expect(v.payload.t).toBe(TEAM);
        expect(v.payload.o).toBe(ORG);
      }
    }
  });

  it('REFUSES a coach invite edited into an admin invite', () => {
    // The whole point. A recipient who reads their own link and swaps the role
    // must not be able to promote themselves to program administrator.
    const token = signStaffInvite(TEAM, ORG, 'coach')!;
    const [, sig] = token.split('.');
    const payload = decode(token);
    expect(payload.r).toBe('coach');

    payload.r = 'admin';
    const forged = reencode(payload, sig!);

    const v = verifyStaffInvite(forged);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('bad-signature');
  });

  it('REFUSES a token retargeted at another team or program', () => {
    const token = signStaffInvite(TEAM, ORG, 'admin')!;
    const [, sig] = token.split('.');
    for (const mutate of [
      (p: Record<string, unknown>) => { p.t = 'someone-elses-team'; },
      (p: Record<string, unknown>) => { p.o = 'someone-elses-org'; },
    ]) {
      const payload = decode(token);
      mutate(payload);
      const v = verifyStaffInvite(reencode(payload, sig!));
      expect(v.ok).toBe(false);
    }
  });

  it('REFUSES a token whose expiry was pushed out', () => {
    const token = signStaffInvite(TEAM, ORG, 'coach')!;
    const [, sig] = token.split('.');
    const payload = decode(token);
    payload.e = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    const v = verifyStaffInvite(reencode(payload, sig!));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('bad-signature');
  });

  it('expires on its own after the TTL', () => {
    const minted = Date.now();
    const token = signStaffInvite(TEAM, ORG, 'admin', minted)!;
    expect(verifyStaffInvite(token, minted + STAFF_INVITE_TTL_MS - 1000).ok).toBe(true);
    const late = verifyStaffInvite(token, minted + STAFF_INVITE_TTL_MS + 1000);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('expired');
  });

  it('REFUSES a token signed with a different key', () => {
    const token = signStaffInvite(TEAM, ORG, 'admin')!;
    process.env.COACHHELM_INTERNAL_SECRET = 'a-completely-different-key';
    const v = verifyStaffInvite(token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('bad-signature');
  });

  it('rejects junk instead of throwing', () => {
    for (const junk of ['', '   ', 'nodot', '.', 'a.', '.b', 'not-base64.$$$', 'x'.repeat(500)]) {
      const v = verifyStaffInvite(junk);
      expect(v.ok).toBe(false);
    }
    expect(verifyStaffInvite(null).ok).toBe(false);
    expect(verifyStaffInvite(undefined).ok).toBe(false);
  });

  it('fails CLOSED when no signing key is configured', () => {
    delete process.env.COACHHELM_INTERNAL_SECRET;
    expect(signStaffInvite(TEAM, ORG, 'admin')).toBeNull();
    const v = verifyStaffInvite('anything.atall');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('unconfigured');
  });

  it('mints distinguishable tokens for the same team and role', () => {
    // A nonce, so re-inviting does not reproduce a link that was already sent
    // out and possibly forwarded.
    const a = signStaffInvite(TEAM, ORG, 'coach')!;
    const b = signStaffInvite(TEAM, ORG, 'coach')!;
    expect(a).not.toBe(b);
  });

  it('never embeds the signing key in the token', () => {
    const token = signStaffInvite(TEAM, ORG, 'admin')!;
    expect(token).not.toContain(KEY);
    expect(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')).not.toContain(KEY);
  });
});
