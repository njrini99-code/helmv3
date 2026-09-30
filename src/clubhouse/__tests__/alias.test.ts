/**
 * @vitest-environment node
 *
 * Old addresses whose screen lives elsewhere in Clubhouse go there, and only
 * with Clubhouse on for the signed-in role and the target rebuilt for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT ${href}`);
});
let session: { coach?: object; player?: object } | null = { coach: {} };
let flagOn = true;

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (h: string) => redirect(h) }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session }));
vi.mock('../gate', () => ({ isClubhouseFor: (role: string | null) => !!role && flagOn }));

const { redirectToClubhouse } = await import('../routes/alias');
const HUB = '/golf/dashboard/team-hub';

beforeEach(() => {
  redirect.mockClear();
  session = { coach: {} };
  flagOn = true;
});

describe('redirectToClubhouse', () => {
  it("sends a coach with Clubhouse on to the role's target", async () => {
    await expect(redirectToClubhouse({ coach: `${HUB}?tab=tasks`, player: HUB })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks`);
  });

  it("sends a player to the player's target", async () => {
    session = { player: {} };
    await expect(redirectToClubhouse({ coach: `${HUB}?tab=tasks`, player: HUB })).rejects.toThrow(`REDIRECT ${HUB}`);
  });

  it('leaves the Fairway page alone with the flag off, signed out, or with no target for the role', async () => {
    flagOn = false;
    await redirectToClubhouse({ coach: HUB });
    flagOn = true;
    session = null;
    await redirectToClubhouse({ coach: HUB });
    session = { player: {} };
    await redirectToClubhouse({ coach: '/golf/dashboard/stats?player=p1' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('never sends anyone to a screen not rebuilt for their role', async () => {
    session = { player: {} };
    await redirectToClubhouse({ player: '/golf/dashboard/roster' });
    expect(redirect).not.toHaveBeenCalled();
  });
});
