/**
 * @vitest-environment node
 *
 * The `ui` tag on the autosave and submit traces (swap audit §18) says which UI wrote the round. Clubhouse is the only
 * UI since Fairway's retirement (2026-11-14), so it is always 'clubhouse', whatever the dashboard role. The tag is
 * computed before the flight recorder exists and reads no session for it, so a failed session read can never fail the
 * save itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as unknown,
  sessionFails: false,
  recorderInputs: [] as Array<{ workflow: string; metadata?: Record<string, unknown> }>,
}));

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: vi.fn(async () => {
    if (state.sessionFails) throw new Error('session read failed');
    return state.session;
  }),
}));
vi.mock('@/lib/observability/helm-flight-recorder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/helm-flight-recorder')>()),
  // Captures the construction input, then fails: createSafeFlightRecorder falls back to its no-op recorder.
  createHelmFlightRecorder: vi.fn(async (input: { workflow: string; metadata?: Record<string, unknown> }) => {
    state.recorderInputs.push(input);
    throw new Error('recorder store unavailable in this test');
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <T extends (...args: never[]) => unknown>(_name: string, _options: unknown, action: T) => action,
}));

import { savePartialRound } from '../round-partial';
import { submitGolfRoundComprehensive } from '../round-submit';
import { getGolfSessionProfile } from '@/lib/auth/session';

const playerDashboard = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: false }, player: { id: 'p-1', onboarding_completed: true } };
const coachDashboard = { userId: 'u-1', role: 'coach', coach: { id: 'c-1', onboarding_completed: true }, player: { id: 'p-1', onboarding_completed: true } };

async function uiTags(): Promise<unknown[]> {
  state.recorderInputs = [];
  // Invalid input on purpose: each action builds its recorder first, then refuses the payload.
  await (savePartialRound as (...a: unknown[]) => Promise<unknown>)({}).catch(() => undefined);
  await (submitGolfRoundComprehensive as (...a: unknown[]) => Promise<unknown>)({}).catch(() => undefined);
  return state.recorderInputs.map((i) => i.metadata?.ui);
}

beforeEach(() => {
  state.session = playerDashboard;
  state.sessionFails = false;
  vi.mocked(getGolfSessionProfile).mockClear();
});

describe('round trace ui tag', () => {
  it('is clubhouse for a dual-profile user on the player dashboard', async () => {
    expect(await uiTags()).toEqual(['clubhouse', 'clubhouse']);
  });

  it('is clubhouse on the coach dashboard too: there is no other UI', async () => {
    state.session = coachDashboard;
    expect(await uiTags()).toEqual(['clubhouse', 'clubhouse']);
  });

  it('reads no session for it, so a failed session read cannot fail the save', async () => {
    state.sessionFails = true;
    expect(await uiTags()).toEqual(['clubhouse', 'clubhouse']);
    expect(getGolfSessionProfile).not.toHaveBeenCalled();
  });
});
