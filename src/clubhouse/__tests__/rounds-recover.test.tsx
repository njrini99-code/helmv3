import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Swap audit F-02: with the flag on, a player can reach round recovery. The screen lists the rounds this device holds
 * (and only the signed-in player's), and Restore, Retry sync and Discard each do what they say. What the device is read
 * for and what a restore writes are in rounds-recover-ports.test.ts; the address and the page are tested here.
 */

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  search: { current: '' },
  flag: { on: true },
  session: { current: null as unknown },
  haptic: vi.fn(),
  layout: { phone: false },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.search.current),
  usePathname: () => '/golf/dashboard/rounds/recover',
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('../lib/haptics', () => ({ haptic: mocks.haptic }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => mocks.layout.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => mocks.flag.on }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(mocks.session.current) }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer({ current: {} }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
// The page hands off to the screens: only which one, and with what, is read here.
vi.mock('@/components/fairway', () => ({
  FeatureUnavailable: function FeatureUnavailable() {
    return null;
  },
  Skeleton: function Skeleton() {
    return <i data-fairway-skeleton />;
  },
}));
vi.mock('@/components/fairway/pages/rounds-recover', () => ({
  FairwayRecoverRound: function FairwayRecoverRound() {
    return null;
  },
}));
vi.mock('@/clubhouse/routes/round-recover', () => ({
  ClubhouseRoundRecoverRoute: function ClubhouseRoundRecoverRoute() {
    return null;
  },
}));

import RecoverRoundLoading from '@/app/golf/(dashboard)/dashboard/rounds/recover/loading';
import RecoverRoundPage from '@/app/golf/(dashboard)/dashboard/rounds/recover/page';
import { ClubhouseRoundRecoverRoute } from '@/clubhouse/routes/round-recover';
import { resolveRoundRoutes } from '@/lib/golf/round-session/routes';
import { isRebuilt, rebuiltHref } from '../shell/nav';
import { ClubhouseMarker } from '../shell/context';
import { ENGINE_ROUTES, ROUNDS_RECOVER } from '../screens/rounds/entry/routes';
import type { ChRecoverPorts } from '../screens/rounds/recover/ports';
import { RoundRecover } from '../screens/rounds/recover/RoundRecover';
import { buildRecoverRounds, type ChDeviceCopy, type ChDeviceDraft, type ChRecoverRound } from '../screens/rounds/recover/scan';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

/** The name of the component an element draws: the page's Fairway pieces are stood in for by functions of their own names. */
const nameOf = (el: ReactElement) => (typeof el.type === 'function' ? el.type.name : String(el.type));
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

const ROUND_ID = 'a0000000-0000-4000-8000-000000000001';
const NOW = Date.now();

/** A record on the device: nine holes of an eighteen-hole practice round at Finley GC, saved five minutes ago. */
function deviceCopy(over: Partial<Omit<ChDeviceCopy, 'draftData'>> & { draft?: Partial<ChDeviceDraft> } = {}): ChDeviceCopy {
  const { draft, ...rest } = over;
  return {
    id: 'q-1',
    playerId: 'p1',
    source: 'localstorage',
    timestamp: NOW - 5 * 60_000,
    draftData: {
      step: 'tracking',
      setupData: { courseName: 'Finley GC', courseCity: '', courseState: '', courseRating: '', courseSlope: '', teesPlayed: '', roundType: 'practice', roundDate: '2026-10-14' },
      holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: i < 9 ? 4 : null })),
      completedHoleStats: Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, score: 4 }) as never),
      currentHoleIndex: 9,
      ...draft,
    },
    ...rest,
  };
}
const roundOf = (over: Parameters<typeof deviceCopy>[0] = {}): ChRecoverRound => buildRecoverRounds([deviceCopy(over)], 'p1')[0]!;

/** Only on this device: no server round. */
const deviceOnly = () => roundOf({ id: 'localStorage_new_p1', storageId: 'new_p1' });
/** The queue holds it and could not send it. */
const queuedFailed = () =>
  roundOf({
    id: 'q-2',
    source: 'modern-indexeddb',
    serverRoundId: ROUND_ID,
    syncStatus: 'failed',
    syncError: 'That save did not go through. Your shots are still on this device. Please try again.',
    draft: { roundId: ROUND_ID },
  });

function fakePorts(rounds: ChRecoverRound[], over: Partial<ChRecoverPorts> = {}) {
  const ports = {
    scan: vi.fn(async () => ({ rounds, unreadable: false })),
    resume: vi.fn(async () => ({ success: true, data: { href: `/golf/dashboard/rounds/continue/${ROUND_ID}`, done: 'Round progress restored' } })),
    retrySync: vi.fn(async () => ({ success: true, data: { synced: 1, declined: false } })),
    discard: vi.fn(async () => ({ success: true })),
    ...over,
  };
  return ports as typeof ports & ChRecoverPorts;
}

function show(ports: ChRecoverPorts, playerId = 'p1') {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <RoundRecover playerId={playerId} ports={ports} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.current = '';
  mocks.flag.on = true;
  mocks.layout.phone = false;
  mocks.session.current = { userId: 'u1', role: 'player', player: { id: 'p1' }, coach: null };
});
afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

// ── The address: where the engine's recover destination lands ──

describe('Round recovery: the address (swap audit F-02)', () => {
  it('the engine’s recover destination is the Clubhouse screen: a rebuilt route for a player, with ?from=submit as Fairway’s', () => {
    expect(ROUNDS_RECOVER).toBe('/golf/dashboard/rounds/recover');
    expect(ENGINE_ROUTES.recover).toBe('/golf/dashboard/rounds/recover?from=submit');
    // What the engines read is this, over their defaults: the library is still Fairway-shaped, only recover is named.
    expect(resolveRoundRoutes(ENGINE_ROUTES).recover).toBe('/golf/dashboard/rounds/recover?from=submit');
    expect(isRebuilt('/golf/dashboard/rounds/recover', 'player')).toBe(true);
    expect(isRebuilt('/golf/dashboard/rounds/recover/', 'player')).toBe(true);
    expect(rebuiltHref(ENGINE_ROUTES.recover, 'player')).toBe(ENGINE_ROUTES.recover);
    // A coach does not log rounds, so has none to recover; nothing nested under it is the screen.
    expect(isRebuilt('/golf/dashboard/rounds/recover', 'coach')).toBe(false);
    expect(isRebuilt('/golf/dashboard/rounds/recover/x', 'player')).toBe(false);
  });

  it('the page draws Clubhouse’s screen for a player when the flag is on, and Fairway’s when it is off', async () => {
    const on = (await RecoverRoundPage()) as ReactElement<{ playerId: string }>;
    expect(on.type).toBe(ClubhouseRoundRecoverRoute);
    expect(on.props.playerId).toBe('p1');
    mocks.flag.on = false;
    const off = (await RecoverRoundPage()) as ReactElement<{ children: ReactElement }>;
    expect(off.type).not.toBe(ClubhouseRoundRecoverRoute);
    expect(nameOf(off.props.children)).toBe('FairwayRecoverRound');
  });

  it('the page keeps Fairway’s message for a session with no player, flag on or off (a coach has no rounds to recover)', async () => {
    mocks.session.current = { userId: 'u2', role: 'coach', player: null, coach: { id: 'c1' } };
    const on = (await RecoverRoundPage()) as ReactElement;
    expect(nameOf(on)).toBe('FeatureUnavailable');
    mocks.flag.on = false;
    expect(nameOf((await RecoverRoundPage()) as ReactElement)).toBe('FeatureUnavailable');
  });

  it('CH-11408 the route loads with Clubhouse’s skeleton inside Clubhouse, and Fairway’s everywhere else', () => {
    const inside = render(
      <ClubhouseMarker>
        <RecoverRoundLoading />
      </ClubhouseMarker>,
    );
    expect(code('CH-11408')).not.toBeNull();
    expect(inside.container.querySelector('[data-fairway-skeleton]')).toBeNull();
    inside.unmount();
    const outside = render(<RecoverRoundLoading />);
    expect(code('CH-11408')).toBeNull();
    expect(outside.container.querySelector('[data-fairway-skeleton]')).not.toBeNull();
  });
});

// ── What it shows ──

describe('Round recovery: the rounds on the device', () => {
  it('CH-11409 says the device is being read, then lists what it holds', async () => {
    type Scan = { rounds: ChRecoverRound[]; unreadable: boolean };
    let finish: (v: Scan) => void = () => {};
    const ports = fakePorts([], { scan: vi.fn(() => new Promise<Scan>((resolve) => (finish = resolve))) });
    show(ports);
    expect(screen.getByRole('heading', { level: 1, name: 'Recover a round' })).toBeTruthy();
    await expectCode('CH-11409');
    expect(screen.queryByText('Nothing to recover')).toBeNull();
    await act(async () => finish({ rounds: [deviceOnly()], unreadable: false }));
    await waitFor(() => expect(code('CH-11409')).toBeNull());
    expect(screen.getByText('Finley GC')).toBeTruthy();
  });

  it('a round that is only on this device appears with what it holds, and Restore and Discard; Retry sync is for the queue’s', async () => {
    const ports = fakePorts([deviceOnly()]);
    show(ports);
    const card = (await screen.findByRole('article', { name: 'Saved round at Finley GC' })) as HTMLElement;
    expect(ports.scan).toHaveBeenCalledWith('p1');
    expect(within(card).getByText('Only on this device')).toBeTruthy();
    expect(within(card).getByText('Practice · Oct 14 · 9 of 18 holes · 36 strokes')).toBeTruthy();
    // The time is told after hydration (`useNow`), so the card is there a beat before it.
    expect(await within(card).findByText('Saved 5 min ago')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Restore round' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Discard' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Retry sync' })).toBeNull();
    expect(screen.getByText('1 saved round on this device. Nothing is deleted until you discard it.')).toBeTruthy();
  });

  it('a round the queue could not send says so, with the reason, and offers Retry sync', async () => {
    show(fakePorts([queuedFailed()]));
    const card = (await screen.findByRole('article', { name: 'Saved round at Finley GC' })) as HTMLElement;
    expect(within(card).getByText('Didn’t sync')).toBeTruthy();
    expect(within(card).getByText(/That save did not go through/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Retry sync' })).toBeTruthy();
  });

  it('a finished round whose submit failed is Submit round, not Restore round', async () => {
    const terminal = { courseName: 'Finley GC', roundType: 'practice', roundDate: '2026-10-14', holes: [] } as never;
    const finished = roundOf({
      serverRoundId: ROUND_ID,
      source: 'modern-indexeddb',
      draft: {
        submissionIntent: 'submit',
        terminalSubmission: terminal,
        holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: 4 })),
      },
    });
    expect(finished.finished).toBe(true);
    show(fakePorts([finished]));
    expect(await screen.findByRole('button', { name: 'Submit round' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore round' })).toBeNull();
  });

  it('CH-11314 nothing on the device is an honest empty page, with the way back to Rounds', async () => {
    show(fakePorts([]));
    await expectCode('CH-11314', /Nothing to recover/);
    expect(screen.getByRole('link', { name: 'Back to Rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });

  it('CH-11212 a device that cannot be read is never "nothing to recover"; Try again reads it again', async () => {
    const scan = vi.fn().mockResolvedValueOnce({ rounds: [], unreadable: true }).mockResolvedValueOnce({ rounds: [deviceOnly()], unreadable: false });
    const user = userEvent.setup();
    show(fakePorts([], { scan }));
    await expectCode('CH-11212', /saved rounds couldn’t be read.*Nothing is deleted/);
    expect(screen.queryByText('Nothing to recover')).toBeNull();
    await user.click(within(code('CH-11212')!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Finley GC')).toBeTruthy();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('CH-11212 a scan that throws is the same notice, not a blank page', async () => {
    show(fakePorts([], { scan: vi.fn().mockRejectedValue(new Error('boom')) }));
    await expectCode('CH-11212');
  });

  it('CH-11911 opened from a failed submit, it says the round was saved on the device', async () => {
    mocks.search.current = 'from=submit';
    show(fakePorts([deviceOnly()]));
    await expectCode('CH-11911', /Your round is saved on this device.*couldn’t reach the server/);
  });

  it('CH-11911 is not shown when opened any other way', async () => {
    show(fakePorts([deviceOnly()]));
    await screen.findByText('Finley GC');
    expect(code('CH-11911')).toBeNull();
  });
});

// ── Restore ──

describe('Round recovery: Restore', () => {
  it('writes through the port and opens the round it names, with a toast saying so', async () => {
    const user = userEvent.setup();
    const round = deviceOnly();
    const ports = fakePorts([round]);
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Restore round' }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(`/golf/dashboard/rounds/continue/${ROUND_ID}`));
    expect(ports.resume).toHaveBeenCalledWith(round, 'p1');
    expect(await screen.findByText('Round progress restored')).toBeTruthy();
  });

  it('a submitted round opens its review', async () => {
    const user = userEvent.setup();
    const resume = vi.fn(async () => ({ success: true, data: { href: `/golf/dashboard/rounds/${ROUND_ID}`, done: 'Round submitted' } }));
    show(fakePorts([deviceOnly()], { resume }));
    await user.click(await screen.findByRole('button', { name: 'Restore round' }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(`/golf/dashboard/rounds/${ROUND_ID}`));
    expect(await screen.findByText('Round submitted')).toBeTruthy();
  });

  it('CH-11017 a restore that fails says why in words, keeps the round, goes nowhere, and Retry tries again', async () => {
    const user = userEvent.setup();
    const resume = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'busy' })
      .mockResolvedValueOnce({ success: true, data: { href: `/golf/dashboard/rounds/continue/${ROUND_ID}`, done: 'Round progress restored' } });
    show(fakePorts([deviceOnly()], { resume }));
    await user.click(await screen.findByRole('button', { name: 'Restore round' }));
    await expectCode('CH-11017', /Couldn’t restore the round at Finley GC.*Another save for this round is just finishing/);
    expect(mocks.haptic).toHaveBeenCalledWith('error');
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(screen.getByText('Finley GC')).toBeTruthy();
    await user.click(within(code('CH-11017')!).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(`/golf/dashboard/rounds/continue/${ROUND_ID}`));
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('CH-11017 a long reason is shown whole, never dropped (the round_missing sentence is over 140 characters)', async () => {
    const user = userEvent.setup();
    const sentence = 'This round is no longer on the server and could not be re-created yet. Every hole is still saved on this device. Check your connection and try again.';
    show(fakePorts([deviceOnly()], { resume: vi.fn(async () => ({ success: false, error: 'round_missing' })) }));
    await user.click(await screen.findByRole('button', { name: 'Restore round' }));
    await expectCode('CH-11017', new RegExp(sentence.slice(0, 60)));
  });

  it('CH-1903 offline, nothing is sent and the round is untouched', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const ports = fakePorts([deviceOnly()]);
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Restore round' }));
    await expectCode('CH-1903', /offline/);
    expect(ports.resume).not.toHaveBeenCalled();
  });
});

// ── Retry sync ──

describe('Round recovery: Retry sync', () => {
  it('asks the engine through the port, reads the device again, and says what was sent', async () => {
    const user = userEvent.setup();
    const ports = fakePorts([queuedFailed()]);
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Retry sync' }));
    expect(await screen.findByText('Synced 1 round')).toBeTruthy();
    expect(ports.retrySync).toHaveBeenCalledTimes(1);
    expect(ports.scan).toHaveBeenCalledTimes(2);
  });

  it('a sync that was already running is not a failure', async () => {
    const user = userEvent.setup();
    show(fakePorts([queuedFailed()], { retrySync: vi.fn(async () => ({ success: true, data: { synced: 0, declined: true } })) }));
    await user.click(await screen.findByRole('button', { name: 'Retry sync' }));
    expect(await screen.findByText('A sync is already running')).toBeTruthy();
    expect(code('CH-11018')).toBeNull();
  });

  it('a round the engine could not send yet says so without calling it synced', async () => {
    const user = userEvent.setup();
    show(fakePorts([queuedFailed()], { retrySync: vi.fn(async () => ({ success: true, data: { synced: 0, declined: false } })) }));
    await user.click(await screen.findByRole('button', { name: 'Retry sync' }));
    expect(await screen.findByText(/Nothing was sent this time/)).toBeTruthy();
  });

  it('CH-11018 a sync that fails says so, keeps the round, and still reads the device again', async () => {
    const user = userEvent.setup();
    const ports = fakePorts([queuedFailed()], { retrySync: vi.fn(async () => ({ success: false, error: 'retry' })) });
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Retry sync' }));
    await expectCode('CH-11018', /Couldn’t sync your rounds.*That save did not go through/);
    expect(screen.getByText('Finley GC')).toBeTruthy();
    expect(ports.scan).toHaveBeenCalledTimes(2);
  });
});

// ── Discard ──

describe('Round recovery: Discard', () => {
  it('CH-11520 asks first, and says what goes; Keep it deletes nothing', async () => {
    const user = userEvent.setup();
    const ports = fakePorts([deviceOnly()]);
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await expectCode('CH-11520', /Discard this round\?.*Finley GC saved on this device is deleted\. It never reached the server, so this can’t be undone\./);
    expect(mocks.haptic).toHaveBeenCalledWith('warning');
    expect(ports.discard).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(ports.discard).not.toHaveBeenCalled();
    expect(screen.getByText('Finley GC')).toBeTruthy();
  });

  it('CH-11520 for a round the server holds too, it says the server’s copy goes and a submitted round is not touched', async () => {
    const user = userEvent.setup();
    show(fakePorts([queuedFailed()]));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await expectCode('CH-11520', /deleted, here and on the server\. A round you already submitted is not touched/);
  });

  it('Discard round calls the engine’s discard with the round and the player, and the card goes', async () => {
    const user = userEvent.setup();
    const round = deviceOnly();
    const ports = fakePorts([round]);
    show(ports);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(screen.queryByText('Finley GC')).toBeNull());
    expect(ports.discard).toHaveBeenCalledWith(round, 'p1');
    expect(ports.discard).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Round discarded')).toBeTruthy();
    // The last one gone is an honest empty page.
    expect(code('CH-11314')).not.toBeNull();
  });

  it('CH-11019 a discard that fails says so and keeps the card; Retry that works removes it', async () => {
    const user = userEvent.setup();
    const discard = vi.fn().mockResolvedValueOnce({ success: false, error: 'Failed to delete round' }).mockResolvedValueOnce({ success: true });
    show(fakePorts([deviceOnly()], { discard }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await expectCode('CH-11019', /Couldn’t discard the round at Finley GC/);
    expect(mocks.haptic).toHaveBeenCalledWith('error');
    expect(screen.getByText('Finley GC')).toBeTruthy();
    await user.click(within(code('CH-11019')!).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Finley GC')).toBeNull());
    expect(discard).toHaveBeenCalledTimes(2);
  });

  it('a round that exists only on this device is discarded offline (nothing is sent); one the server holds is not', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const local = fakePorts([deviceOnly()]);
    const view = show(local);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(local.discard).toHaveBeenCalledTimes(1));
    view.unmount();

    const remote = fakePorts([queuedFailed()]);
    show(remote);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await expectCode('CH-1903', /offline/);
    expect(remote.discard).not.toHaveBeenCalled();
  });
});

// ── The phone ──

describe('Round recovery: on the phone (the rounds grammar, docs/clubhouse/phone/rounds.md)', () => {
  it('draws the phone layout with 44px actions, and leaves the way back to the top bar', async () => {
    mocks.layout.phone = true;
    show(fakePorts([queuedFailed()]));
    const card = (await screen.findByRole('article', { name: 'Saved round at Finley GC' })) as HTMLElement;
    expect(document.querySelector('main.ch-rcv')!.classList.contains('is-phone')).toBe(true);
    for (const name of ['Restore round', 'Retry sync', 'Discard']) {
      expect(within(card).getByRole('button', { name }).classList.contains('ch-btn--lg')).toBe(true);
    }
    expect(screen.queryByRole('link', { name: 'Back to Rounds' })).toBeNull();
  });

  it('draws the desktop layout with the way back in the header', async () => {
    show(fakePorts([queuedFailed()]));
    const card = (await screen.findByRole('article', { name: 'Saved round at Finley GC' })) as HTMLElement;
    expect(document.querySelector('main.ch-rcv')!.classList.contains('is-phone')).toBe(false);
    expect(within(card).getByRole('button', { name: 'Restore round' }).classList.contains('ch-btn--lg')).toBe(false);
    expect(screen.getByRole('link', { name: 'Back to Rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });
});

// ── Whose rounds ──

describe('Round recovery: the signed-in player’s rounds only', () => {
  it('reads the device for the player it was given, never for another', async () => {
    const ports = fakePorts([]);
    show(ports, 'p9');
    await screen.findByText('Nothing to recover');
    expect(ports.scan).toHaveBeenCalledTimes(1);
    expect(ports.scan).toHaveBeenCalledWith('p9');
  });
});
