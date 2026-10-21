import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const isFlagEnabled = vi.fn((_id: string): boolean => false);
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (id: string) => isFlagEnabled(id) }));
const logServerError = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerError(...a) }));
const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));

import { dataPromptsV2ForShotEntry } from '../flag';
import { DATA_PROMPTS_FLAG } from '../recovery';

type Result = { data: unknown; error: { message: string } | null };

/** golf_team_members for the player: every filter returns itself; awaiting it answers `result`. */
function membersClient(result: Result) {
  const tables: string[] = [];
  return {
    tables,
    client: {
      from(table: string) {
        tables.push(table);
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) b[m] = () => b;
        b.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
        return b;
      },
    },
  };
}

beforeEach(() => {
  isFlagEnabled.mockReset().mockReturnValue(false);
  logServerError.mockReset();
  createClient.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe('dataPromptsV2ForShotEntry', () => {
  it('flag off: false, and nothing is read', async () => {
    vi.stubEnv('HELM_COACHHELM_TEAMS', 'team-a');
    expect(await dataPromptsV2ForShotEntry('p1')).toBe(false);
    expect(isFlagEnabled).toHaveBeenCalledWith(DATA_PROMPTS_FLAG);
  });

  it('no canary list: the global flag decides and no team is read', async () => {
    isFlagEnabled.mockReturnValue(true);
    expect(await dataPromptsV2ForShotEntry('p1')).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('canary list: on only for a player on a listed team (read in the player team scope)', async () => {
    isFlagEnabled.mockReturnValue(true);
    vi.stubEnv('HELM_COACHHELM_TEAMS', 'team-a');
    const listed = membersClient({ data: [{ team_id: 'team-a' }], error: null });
    createClient.mockResolvedValue(listed.client);
    expect(await dataPromptsV2ForShotEntry('p1')).toBe(true);
    expect(listed.tables).toEqual(['golf_team_members']);

    createClient.mockResolvedValue(membersClient({ data: [{ team_id: 'team-b' }], error: null }).client);
    expect(await dataPromptsV2ForShotEntry('p2')).toBe(false);
  });

  it('canary list and a failed team read: off (fail closed)', async () => {
    isFlagEnabled.mockReturnValue(true);
    vi.stubEnv('HELM_COACHHELM_TEAMS', 'team-a');
    createClient.mockResolvedValue(membersClient({ data: null, error: { message: 'timeout' } }).client);
    expect(await dataPromptsV2ForShotEntry('p1')).toBe(false);
    createClient.mockRejectedValue(new Error('no cookies'));
    expect(await dataPromptsV2ForShotEntry('p1')).toBe(false);
  });
});

describe('the round entry pages read the flag through the canary', () => {
  // A bare isFlagEnabled read would ignore HELM_COACHHELM_TEAMS and show the
  // prompts to every team once the flag is on (the #2258 class of bug).
  const pages = ['src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx', 'src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx'];
  it.each(pages)('%s', async (path) => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(path, 'utf8');
    expect(src).toContain('await dataPromptsV2ForShotEntry(player.id)');
    expect(src).not.toMatch(/isFlagEnabled\(\s*DATA_PROMPTS_FLAG/);
  });
});
