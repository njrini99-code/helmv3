import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { readWaves } from './read-waves';

/**
 * Rounds (P011), the numbered contracts in docs/clubhouse/pages/P011-rounds/CONTRACT.md that no test named: offline writes (110702),
 * whose rounds the library reads (110803), what a failed Start or hole save keeps (111201, 111202), the scorecard's focusable region
 * (111810), the phone layout and the full-screen flows (111901, 111903), Esc and focus on every sheet (112001), and how many
 * round trips the loaders take (112101). Each test names its Bridge ID. The discard action's own refusals (110804) are in
 * rounds-actions-contracts.test.ts.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import { loadRoundsLibrary } from '../data/rounds';
import { loadRoundReview } from '../data/round-review';
import { ClubhouseRoundsRoute } from '../routes/rounds';
import { RoundReview } from '../screens/rounds/RoundReview';
import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import { RoundTracking, type RoundTrackingProps } from '../screens/rounds/track/RoundTracking';
import { ExitSheet, RoundCompleteSheet, ScorecardSheet } from '../screens/rounds/track/round-sheets';
import type { ChRoundsWrites } from '../screens/rounds/writes';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH } from '../preview/fixtures-round-review';
import { PREVIEW_ROUNDS, previewRow } from '../preview/fixtures-rounds';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../preview/fixtures-setup';
import type { ChSetupPorts } from '../screens/rounds/setup/shape';
import { formatDate, localToday } from '../ui/date-time';

/** A date as a DateField shows it: this year's dates without the year (ui/date-time formatDate). */
const fieldDate = (iso: string) => formatDate(iso, { omitYear: iso.slice(0, 4) === localToday().slice(0, 4) });

// jsdom has no layout: the state machine scrolls the distance box into view.
Element.prototype.scrollIntoView ??= function () {};

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}
function phoneWidth(phone: boolean) {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => ({ ...real(q), matches: phone && q === '(max-width: 820px)' })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}
const css = async (file: string) => (await import('node:fs')).readFileSync(`src/clubhouse/styles/${file}`, 'utf8');

beforeEach(() => {
  sessionStorage.clear();
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
});
afterEach(() => {
  cleanup();
  setOnline(true);
  tables.current = {};
  tables.gate = undefined;
  session.current = null;
  teamOf.current = null;
});

// ── Fixtures: the library, setup and the shot screen ───────────────────────

function showLibrary(w: ChRoundsWrites = { discard: vi.fn(() => Promise.resolve({ success: true })) }) {
  render(wrap(<RoundsLibrary data={PREVIEW_ROUNDS} playerId="p1" writes={w} />));
  return w;
}

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const fail = (error = 'nope') => Promise.resolve({ ok: false as const, error });
function showSetup(over: Partial<ChSetupPorts> = {}) {
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
    start: vi.fn(() => ok({ roundId: 'r-1' })),
    ...over,
  };
  const onStarted = vi.fn();
  render(
    wrap(<RoundSetup ports={ports} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={onStarted} />),
  );
  return { ports, onStarted, user: userEvent.setup() };
}
const dock = () => document.getElementById('ch-rsu-dock-s')!;
const startBtn = () => screen.getByRole('button', { name: /Start round|Starting/ });
async function pickFinleyBlue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Browse courses/ }));
  await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
  await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
}

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 420, score: null },
  { number: 2, par: 5, yardage: 540, score: null },
  { number: 3, par: 3, yardage: 170, score: null },
];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE_TO_GREEN = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 170, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet', shotDistance: 150 });
function showTracking(over: Partial<RoundTrackingProps> = {}, host: (node: ReactNode) => ReactNode = (n) => n) {
  const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 2, onHoleComplete: vi.fn(async () => true), onNavigateToHole: vi.fn(), ...over };
  render(wrap(host(<RoundTracking {...props} />)));
  return { props, user: userEvent.setup() };
}
const next = () => screen.getByRole('button', { name: /Record next shot|Complete hole/ });
const pickResult = (name: string | RegExp) => screen.getByRole('radio', { name });

/** A hole holed out on its second shot, whose save fails: the shot review shows with Try again. */
async function holeOutThatDoesNotSave(onHoleComplete: RoundTrackingProps['onHoleComplete'], over: Partial<RoundTrackingProps> = {}) {
  const t = showTracking({ initialShots: [TEE_TO_GREEN], initialShotNumber: 2, onHoleComplete, ...over });
  await t.user.click(pickResult(/^Holed/));
  await t.user.click(next());
  return t;
}

// ── 110702: Discard, Start and a hole's Try again refuse offline ───────────

describe('110702 writes refuse offline: nothing is sent, the error haptic fires, the toast names what did not happen, with Retry', () => {
  it('110702 Discard (the library): refused offline with the round kept, and Retry discards it once the browser is back', async () => {
    const user = userEvent.setup();
    const w = showLibrary();
    await user.click(screen.getByRole('button', { name: 'Discard the round at Finley GC' }));
    const confirm = await screen.findByRole('button', { name: 'Discard round' });
    setOnline(false);
    await user.click(confirm);
    await expectCode('CH-1903', /Couldn’t discard the round at Finley GC: you’re offline/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(w.discard).not.toHaveBeenCalled();
    expect(screen.getByText('In progress')).toBeTruthy();
    setOnline(true);
    await user.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('No round in progress')).toBeTruthy());
    expect(w.discard).toHaveBeenCalledTimes(1);
  });

  it('110702 Start (setup): refused offline, the setup is left as it was, and Retry starts the round once the browser is back', async () => {
    const { ports, onStarted, user } = showSetup();
    await pickFinleyBlue(user);
    setOnline(false);
    await user.click(startBtn());
    await expectCode('CH-1903', /Couldn’t start your round at Finley GC: you’re offline/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(ports.start).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(dock()).toHaveTextContent('Finley GC · Blue · 18 holes · Par 72');
    setOnline(true);
    await user.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('r-1'));
    expect(ports.start).toHaveBeenCalledTimes(1);
  });

  it('110702 a hole’s Try again while offline gives the warning haptic and sends nothing; online it saves the hole', async () => {
    const onHoleComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { user } = await holeOutThatDoesNotSave(onHoleComplete);
    await waitFor(() => expect(code('CH-11003')).not.toBeNull());
    expect(code('CH-11003')).toHaveTextContent(/Reconnect|Try again to move on/);
    setOnline(false);
    // The card says what to do before the player taps (the line is read at render, so a re-render follows the browser).
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(onHoleComplete).toHaveBeenCalledTimes(1);
    expect(code('CH-11003')).not.toBeNull();
    setOnline(true);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onHoleComplete).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(code('CH-11003')).toBeNull());
  });
});

// ── 110803: the library holds only the player's own rounds ─────────────────

describe('110803 the library loader reads golf_rounds for the signed-in player only', () => {
  type Filters = Array<[string, unknown[]]>;
  const arg = (f: Filters, key: string, col: string) => f.find(([k, a]) => k === key && a[0] === col)?.[1][1];

  it('110803 both reads (completed for the book, in progress for the card) filter on the player’s id and leave test rounds out, whoever the player is', async () => {
    const seen: Filters[] = [];
    tables.current = {
      golf_rounds: (f) => {
        seen.push(f);
        return { data: [] };
      },
    };
    for (const id of ['p-mine', 'p-other']) {
      seen.length = 0;
      await loadRoundsLibrary({ playerId: id, teamId: null });
      expect(seen.map((f) => arg(f, 'eq', 'status')).sort()).toEqual(['completed', 'in_progress']);
      for (const f of seen) {
        expect(arg(f, 'eq', 'player_id')).toBe(id);
        expect(arg(f, 'eq', 'is_test')).toBe(false);
      }
    }
  });

  it('110803 the holes behind the card are read only for the rounds that read returned', async () => {
    let holesFor: unknown;
    tables.current = {
      golf_rounds: (f) =>
        arg(f, 'eq', 'status') === 'completed'
          ? { data: [] }
          : { data: [{ id: 'u1', course_name: 'Finley GC', tees_played: 'Blue', round_date: '2026-10-14', round_type: 'practice', holes_played: 18, current_hole: 2, updated_at: '2026-10-14T13:12:00Z' }] },
      golf_holes: (f) => {
        holesFor = arg(f, 'in', 'round_id');
        return { data: [] };
      },
    };
    await loadRoundsLibrary({ playerId: 'p-mine', teamId: null });
    expect(holesFor).toEqual(['u1']);
  });

  it('110803 the route hands the loader the session’s player and nobody else’s; a coach session reads nothing', async () => {
    const seen: Filters[] = [];
    tables.current = {
      golf_rounds: (f) => {
        seen.push(f);
        return { data: [] };
      },
    };
    session.current = { userId: 'u1', coach: { id: 'c1' }, player: null };
    expect(await ClubhouseRoundsRoute()).toBeNull();
    expect(seen).toHaveLength(0);
    session.current = { userId: 'u2', coach: null, player: { id: 'p-mine' } };
    teamOf.current = null;
    await ClubhouseRoundsRoute();
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map((f) => arg(f, 'eq', 'player_id')))).toEqual(new Set(['p-mine']));
  });
});

// ── 111201: a Start that fails leaves the setup as it was ──────────────────

describe('111201 a Start that fails keeps the setup as it was, until the round opens', () => {
  it('111201 the course and tees, the nine, the date and the holes as edited all stay; Start can be pressed again and sends the same setup', async () => {
    const start = vi.fn().mockReturnValueOnce(fail('The server is busy')).mockReturnValue(ok({ roundId: 'r-2' }));
    const { user, onStarted } = showSetup({ start });
    await pickFinleyBlue(user);
    await user.click(within(screen.getByRole('radiogroup', { name: 'Holes' })).getByRole('radio', { name: '9 holes' }));
    await user.click(screen.getByRole('radio', { name: 'Back 9' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Hole 12 par' })).getByRole('radio', { name: '5' }));
    const date = screen.getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-10-12');
    await user.click(startBtn());
    await expectCode('CH-11007', /Couldn’t start your round at Finley GC/);
    expect(onStarted).not.toHaveBeenCalled();
    // Everything is where it was.
    expect(dock()).toHaveTextContent('Finley GC · Blue · Back nine');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(fieldDate('2026-10-12'));
    expect(within(screen.getByRole('radiogroup', { name: 'Holes' })).getByRole('radio', { name: '9 holes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Back 9' })).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('radiogroup', { name: 'Hole 12 par' })).getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 hole edited for this round')).toBeInTheDocument();
    expect(startBtn()).toBeEnabled();
    // Pressing Start again (not only the toast's Retry) sends the same setup, and then the round opens.
    await user.click(startBtn());
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('r-2'));
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1]![0]).toEqual(start.mock.calls[0]![0]);
    expect(start.mock.calls[0]![0]).toMatchObject({ date: '2026-10-12', count: 9, nine: 'back', pick: { courseName: 'Finley GC', teeId: 'finley-blue' } });
  });

  it('111201 a qualifier round stays chosen, with its course and tees and the round it counts as', async () => {
    const start = vi.fn().mockReturnValueOnce(fail('The server is busy')).mockReturnValue(ok({ roundId: 'r-3' }));
    const { user, onStarted } = showSetup({ start });
    await user.click(screen.getByRole('button', { name: /Fall qualifier 2/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    await user.click(startBtn());
    await expectCode('CH-11007', /Couldn’t start your round/);
    expect(within(screen.getByRole('radiogroup', { name: 'Round type' })).getByRole('radio', { name: 'Qualifier' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('This counts as round 3 of 3 in Fall qualifier 2.')).toBeInTheDocument();
    expect(dock()).toHaveTextContent('Finley GC · Blue');
    await user.click(within(code('CH-11007')!).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('r-3'));
    expect(start.mock.calls[1]![0]).toEqual(start.mock.calls[0]![0]);
    expect(start.mock.calls[0]![0]).toMatchObject({ type: 'qualifier', pick: { teeId: 'finley-blue' } });
  });
});

// ── 111202: the shots stay when a hole doesn't save ────────────────────────

describe('111202 the shots stay when a holed-out hole does not save', () => {
  it('111202 the shot review keeps every shot listed, says they are kept on this device, and the round does not move on', async () => {
    const onHoleComplete = vi.fn(async () => false);
    const { props } = await holeOutThatDoesNotSave(onHoleComplete);
    await waitFor(() => expect(code('CH-11003')).not.toBeNull());
    expect(code('CH-11003')).toHaveTextContent('Hole 3 didn’t save');
    expect(code('CH-11003')).toHaveTextContent('Your shots are kept on this device');
    // Both shots (the tee shot and the holed putt) are still there to change.
    const review = screen.getByRole('region', { name: 'Hole 3 shots' });
    expect(within(review).getAllByRole('button', { name: /^Change shot/ })).toHaveLength(2);
    expect(within(review).getByRole('button', { name: /^Change shot 1/ })).toBeEnabled();
    // The round stays on the hole that did not save.
    expect(props.onNavigateToHole).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /Hole 3.*current/ })).toBeTruthy();
  });

  it('111202 Try again keeps the same shots; once the save lands the note goes', async () => {
    const onHoleComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { user } = await holeOutThatDoesNotSave(onHoleComplete);
    await waitFor(() => expect(code('CH-11003')).not.toBeNull());
    const before = within(screen.getByRole('region', { name: 'Hole 3 shots' })).getAllByRole('button', { name: /^Change shot/ }).map((b) => b.getAttribute('aria-label'));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onHoleComplete).toHaveBeenCalledTimes(2);
    expect(onHoleComplete.mock.calls[1]![1]).toEqual(onHoleComplete.mock.calls[0]![1]);
    await waitFor(() => expect(code('CH-11003')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Hole 3 shots' })).getAllByRole('button', { name: /^Change shot/ }).map((b) => b.getAttribute('aria-label'))).toEqual(before);
  });
});

// ── 111810: the scorecard scrolls in a focusable region ────────────────────

describe('111810 the scorecard scrolls sideways inside a labelled, focusable region', () => {
  const card = [
    { number: 1, par: 4, score: 5, putts: 2 },
    { number: 2, par: 5, score: 4, putts: 1 },
    { number: 3, par: 3, score: null, putts: null },
  ];
  const region = () => screen.getByRole('region', { name: 'Scorecard' });

  it('111810 the Scorecard sheet: role region, tabIndex 0, named Scorecard, and the keyboard can reach it', async () => {
    render(<ScorecardSheet open onClose={vi.fn()} course="Finley GC" tee="Blue" holes={card} current={3} />);
    expect(region().getAttribute('tabindex')).toBe('0');
    expect(within(region()).getAllByRole('table').length).toBeGreaterThan(0);
    region().focus();
    expect(document.activeElement).toBe(region());
  });

  it('111810 the Round complete sheet has the same region', () => {
    const holes = card.map((h) => ({ ...h, score: h.score ?? 4, putts: h.putts ?? 2, fairwayHit: true, gir: true }));
    render(<RoundCompleteSheet open heading="Finley GC · Blue · Oct 14" holes={holes} onBack={vi.fn()} onSubmit={vi.fn()} />);
    expect(region().getAttribute('tabindex')).toBe('0');
    expect(within(region()).getAllByRole('table').length).toBeGreaterThan(0);
  });
});

// ── 111901 / 111903: the phone layout and the full-screen flows ────────────

describe('111901 the library and the review are the phone build at phone width', () => {
  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const inFrame = (node: ReactNode) =>
    render(
      wrap(
        <PhoneChromeProvider>
          <SlotHost />
          {node}
        </PhoneChromeProvider>,
      ),
    );

  it('111901 the library: the top bar is the tab root’s Rounds with no back link, and the page keeps its own header', () => {
    const restore = phoneWidth(true);
    try {
      inFrame(<RoundsLibrary data={PREVIEW_ROUNDS} playerId="p1" writes={{ discard: vi.fn() }} />);
      const top = screen.getByTestId('phone-top');
      expect(within(top).getByText('Rounds')).toBeTruthy();
      expect(within(top).queryByRole('button', { name: /Back/ })).toBeNull();
      expect(within(top).queryByRole('link', { name: /Back/ })).toBeNull();
      expect(document.querySelector('.ch-rd.is-phone')).not.toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'Your rounds' })).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('111901 the library at desktop width has no phone class and no phone top bar', () => {
    const restore = phoneWidth(false);
    try {
      inFrame(<RoundsLibrary data={PREVIEW_ROUNDS} playerId="p1" writes={{ discard: vi.fn() }} />);
      expect(document.querySelector('.ch-rd.is-phone')).toBeNull();
      expect(within(screen.getByTestId('phone-top')).queryByText('Rounds')).toBeNull();
    } finally {
      restore();
    }
  });

  it('111901 the review: the top bar is Round with ‹ Rounds for a player and ‹ Stats for a coach', () => {
    const restore = phoneWidth(true);
    try {
      inFrame(<RoundReview review={PREVIEW_REVIEW} />);
      const top = screen.getByTestId('phone-top');
      expect(within(top).getByText('Round')).toBeTruthy();
      expect(top.textContent).toMatch(/Rounds/);
      expect(top.textContent).not.toMatch(/Stats/);
      cleanup();
      inFrame(<RoundReview review={PREVIEW_REVIEW_COACH} />);
      // A coach's review is reached from the player's rounds on Stats.
      const coachTop = screen.getByTestId('phone-top');
      expect(within(coachTop).getByText('Round')).toBeTruthy();
      expect(coachTop.textContent).toMatch(/Stats/);
      expect(coachTop.textContent).not.toMatch(/Rounds/);
    } finally {
      restore();
    }
  });

  it('111901 below 860px the round card and the season card stack; at 640px and below the book drops Out · In · Tot and the meters, and a group’s header drops its average and low', async () => {
    const rounds = await css('rounds.css');
    const at860 = rounds.slice(rounds.indexOf('@container chrd (max-width: 860px)'));
    expect(at860.slice(0, at860.indexOf('}\n}') + 3)).toMatch(/\.ch-rd-hero\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    const at640 = rounds.slice(rounds.indexOf('@container chrd (max-width: 640px)'));
    const block = at640.slice(0, at640.indexOf('\n}\n') + 3);
    expect(block).toMatch(/\.ch-rd-sc__grid\s*\{\s*display:\s*none/);
    expect(block).toMatch(/\.ch-rd-sc\s*\{\s*grid-template-columns:\s*56px minmax\(0,\s*1fr\) 56px/);
    expect(block).toMatch(/\.ch-rd-grp__h > span:nth-last-child\(-n \+ 2\)\s*\{\s*display:\s*none/);
    // The review's hero stacks at its own container width.
    expect(rounds).toMatch(/@container chrv \(max-width: 640px\)/);
  });
});

describe('111903 a new round and the shot screen are full-screen flows on the phone: the tab bar hides while either is open', () => {
  /** Reads what the shell reads: whether the tab bar is hidden. */
  function Probe() {
    const { noTabs } = usePhoneChromeState();
    return <output data-testid="tabs">{noTabs ? 'hidden' : 'shown'}</output>;
  }
  const framed = (node: ReactNode) => (
    <PhoneChromeProvider>
      <Probe />
      {node}
    </PhoneChromeProvider>
  );

  it('111903 the setup hides the tab bar while it is open and gives it back when it closes; Start round is in its dock and Back in its band', () => {
    const ports: ChSetupPorts = { listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)), listTees: vi.fn(() => ok([])), teeHoles: vi.fn(() => ok([])), start: vi.fn(() => ok({ roundId: 'r' })) };
    const view = render(wrap(framed(<RoundSetup ports={ports} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={vi.fn()} />)));
    expect(screen.getByTestId('tabs').textContent).toBe('hidden');
    expect(within(document.querySelector('.ch-rsu-dock') as HTMLElement).getByRole('button', { name: /Start round/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
    view.rerender(wrap(framed(null)));
    expect(screen.getByTestId('tabs').textContent).toBe('shown');
  });

  it('111903 the shot screen hides the tab bar while it is open and keeps Exit and Scorecard in its own top bar', () => {
    const view = render(wrap(framed(<RoundTracking round={ROUND} holes={HOLES} currentHoleIndex={0} onHoleComplete={vi.fn(async () => true)} onNavigateToHole={vi.fn()} onExit={vi.fn()} onOpenScorecard={vi.fn()} />)));
    expect(screen.getByTestId('tabs').textContent).toBe('hidden');
    const top = document.querySelector('.ch-rt-top') as HTMLElement;
    expect(within(top).getByRole('button', { name: /Exit/ })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Scorecard' })).toBeTruthy();
    view.rerender(wrap(framed(null)));
    expect(screen.getByTestId('tabs').textContent).toBe('shown');
  });
});

// ── 112001: every sheet closes on Esc and focus goes back to its opener ────

describe('112001 every sheet is the shell’s Modal: Esc closes it and focus goes back to the button that opened it', () => {
  const dialogOf = (c: string) => document.querySelector(`dialog[data-ch-code="${c}"]`) as HTMLDialogElement;
  const isOpen = (d: HTMLElement | null) => !!d && d.isConnected && d.hasAttribute('open');
  /** Esc, as a <dialog> raises it: a cancelable `cancel` event. */
  const esc = (c: string) => fireEvent(dialogOf(c), new Event('cancel', { cancelable: true }));
  async function closesAndReturns(c: string, opener: HTMLElement) {
    await waitFor(() => expect(isOpen(dialogOf(c))).toBe(true));
    esc(c);
    await waitFor(() => expect(isOpen(dialogOf(c))).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  }

  /** A sheet that opens from a button, for a sheet the page itself opens from a flow too deep to drive here. */
  function Opener({ children, label }: { children: (open: boolean, close: () => void) => ReactNode; label: string }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          {label}
        </button>
        {children(open, () => setOpen(false))}
      </>
    );
  }
  const card = [
    { number: 1, par: 4, score: 5, putts: 2 },
    { number: 2, par: 5, score: 4, putts: 1 },
    { number: 3, par: 3, score: null, putts: null },
  ];

  it('112001 Discard (CH-11501): Esc keeps the round and sends nothing', async () => {
    const user = userEvent.setup();
    const w = showLibrary();
    const opener = screen.getByRole('button', { name: 'Discard the round at Finley GC' });
    await user.click(opener);
    await closesAndReturns('CH-11501', opener);
    expect(w.discard).not.toHaveBeenCalled();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('112001 the course picker (CH-11510) and Add a course (CH-11511): Esc closes each, the picker comes back under Add a course', async () => {
    const { user } = showSetup();
    const browse = screen.getByRole('button', { name: /Browse courses/ });
    await user.click(browse);
    await waitFor(() => expect(isOpen(dialogOf('CH-11510'))).toBe(true));
    await user.click(await screen.findByRole('button', { name: /Add a course/ }));
    await waitFor(() => expect(isOpen(dialogOf('CH-11511'))).toBe(true));
    // Add a course is opened from the picker and closing it goes back there: the picker opens again as it closes.
    esc('CH-11511');
    await waitFor(() => expect(isOpen(dialogOf('CH-11511'))).toBe(false));
    await waitFor(() => expect(isOpen(dialogOf('CH-11510'))).toBe(true));
    esc('CH-11510');
    await waitFor(() => expect(isOpen(dialogOf('CH-11510'))).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(browse));
  });

  it('112001 Penalty (CH-11503): Esc closes it without adding a stroke', async () => {
    const { user } = showTracking({ currentHoleIndex: 0 });
    const opener = screen.getByRole('button', { name: 'Add penalty stroke' });
    await user.click(opener);
    await closesAndReturns('CH-11503', opener);
    expect(screen.queryByText(/penalt.*stroke/i)).toBeNull();
  });

  it('112001 Change a shot (CH-11505): Esc closes it and the shot is as it was', async () => {
    const holed = [
      shot({ shotNumber: 1, shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 170, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      shot({ shotNumber: 2, shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', result: 'hole', distanceUnitAfter: 'feet' }),
    ];
    const holes = [HOLES[0]!, HOLES[1]!, { ...HOLES[2]!, score: 2 }];
    const { user } = showTracking({ holes, initialShots: holed, initialShotNumber: 3 });
    const opener = screen.getByRole('button', { name: /^Change shot 1/ });
    await user.click(opener);
    await closesAndReturns('CH-11505', opener);
    expect(screen.getByRole('button', { name: /^Change shot 1/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Change shot/ })).toHaveLength(2);
  });

  it('112001 Leave this shot (CH-11504): Esc is Stay, and the player does not leave the hole', async () => {
    const holes = [{ ...HOLES[0]!, score: 4 }, HOLES[1]!, HOLES[2]!];
    const { user, props } = showTracking({ holes, currentHoleIndex: 1 });
    await user.click(pickResult('Fairway'));
    const opener = screen.getByRole('button', { name: 'Hole 1, 4, even' });
    await user.click(opener);
    await closesAndReturns('CH-11504', opener);
    expect(props.onNavigateToHole).not.toHaveBeenCalled();
  });

  it('112001 Exit (CH-11506): Esc is Keep playing, and nothing is saved or discarded', async () => {
    const user = userEvent.setup();
    const onKeep = vi.fn();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(
      <Opener label="Exit">
        {(open, close) => <ExitSheet open={open} course="Finley GC" holes={card} currentNumber={3} discarding={false} discardError={null} onSave={onSave} onKeep={() => (onKeep(), close())} onDiscard={onDiscard} />}
      </Opener>,
    );
    const opener = screen.getByRole('button', { name: 'Exit' });
    await user.click(opener);
    await closesAndReturns('CH-11506', opener);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('112001 Scorecard (CH-11509): Esc closes it', async () => {
    const user = userEvent.setup();
    render(<Opener label="Open the scorecard">{(open, close) => <ScorecardSheet open={open} onClose={close} course="Finley GC" tee="Blue" holes={card} current={3} />}</Opener>);
    const opener = screen.getByRole('button', { name: 'Open the scorecard' });
    await user.click(opener);
    await closesAndReturns('CH-11509', opener);
  });

  it('112001 Round complete (CH-11508): Esc is Back to the round, and nothing is posted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const holes = card.map((h) => ({ ...h, score: h.score ?? 4, putts: h.putts ?? 2, fairwayHit: true, gir: true }));
    render(
      <Opener label="Review and post">
        {(open, close) => <RoundCompleteSheet open={open} heading="Finley GC · Blue · Oct 14" holes={holes} onBack={close} onSubmit={onSubmit} />}
      </Opener>,
    );
    const opener = screen.getByRole('button', { name: 'Review and post' });
    await user.click(opener);
    await closesAndReturns('CH-11508', opener);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ── 112101: the loaders read in a few rounds, never one request per round ──

describe('112101 the loaders read on the server before first paint, never one request per round', () => {
  const flat = (waves: string[][]) => waves.flat();
  const at = (waves: string[][], name: string) => waves.findIndex((w) => w.includes(name));
  const inProgress = (id: string) => ({ id, course_name: 'Finley GC', tees_played: 'Blue', round_date: '2026-10-14', round_type: 'practice', holes_played: 18, current_hole: 2, updated_at: '2026-10-14T13:12:00Z' });
  type Filters = Array<[string, unknown[]]>;
  const arg = (f: Filters, key: string, col: string) => f.find(([k, a]) => k === key && a[0] === col)?.[1][1];
  const rangeOf = (f: Filters) => f.find(([k]) => k === 'range')?.[1] as [number, number] | undefined;

  it('112101 the library: the team’s clock, the posted rounds and the in-progress rounds start together, and the holes of every in-progress round are one read after them', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_rounds: (f) => (arg(f, 'eq', 'status') === 'completed' ? { data: [] } : { data: ['u1', 'u2', 'u3'].map(inProgress) }),
      golf_holes: { data: [] },
    };
    const { result, waves: depth } = await waves.run(loadRoundsLibrary({ playerId: 'p1', teamId: 't1' }));
    expect(result.unfinished.list).toHaveLength(3);
    expect(depth).toHaveLength(2);
    expect(depth[0]).toEqual(['golf_rounds', 'golf_rounds', 'golf_team_settings']);
    expect(depth[1]).toEqual(['golf_holes']);
  });

  it('112101 the library: the posted rounds are paged, the in-progress rounds are at most 20, and their holes are one read for all of them', async () => {
    const posted: Filters[] = [];
    const unfinished: Filters[] = [];
    const holes: Filters[] = [];
    const row = (i: number) => ({ ...previewRow(0, ['2026-09-26', 'Finley GC', "Men's Blue", 'practice', 72, 72, 30, [9, 14], 12, 35]), id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
    tables.current = {
      golf_rounds: (f) => {
        if (arg(f, 'eq', 'status') === 'completed') {
          posted.push(f);
          const [from, to] = rangeOf(f)!;
          return { data: Array.from({ length: Math.max(0, Math.min(to, 1199) - from + 1) }, (_, i) => row(from + i)) };
        }
        unfinished.push(f);
        return { data: Array.from({ length: 20 }, (_, i) => inProgress(`u${i}`)) };
      },
      golf_holes: (f) => {
        holes.push(f);
        return { data: [] };
      },
    };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.rounds.list).toHaveLength(1200);
    expect(posted.map((f) => rangeOf(f))).toEqual([[0, 999], [1000, 1999]]);
    expect(unfinished).toHaveLength(1);
    expect(unfinished[0]!.find(([k]) => k === 'limit')?.[1][0]).toBe(20);
    expect(holes).toHaveLength(1);
    expect((arg(holes[0]!, 'in', 'round_id') as string[]).length).toBe(20);
  });

  it('112101 the review (player): the round first, then the holes, the shots and the tee together; no membership check and no player read', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_rounds: { data: { id: 'r1', player_id: 'p1', status: 'completed', is_test: false, tee_id: 'tee-1', team_id: 't1', holes_played: 18, round_date: '2026-10-14', round_type: 'practice', course_name: 'Finley GC' } },
      golf_holes: { data: [] },
      golf_shots: { data: [] },
      golf_course_tees: { data: { total_yards: 6984 } },
      golf_teams: { data: { gender: 'mens' } },
    };
    const { result, waves: depth } = await waves.run(loadRoundReview('r1', { role: 'player', playerId: 'p1', teamId: 't1' }));
    expect(result.kind).toBe('ok');
    expect(depth[0]).toEqual(['golf_rounds']);
    expect(at(depth, 'golf_holes')).toBe(1);
    for (const t of ['golf_shots', 'golf_course_tees', 'golf_teams']) expect(at(depth, t)).toBe(1);
    expect(flat(depth)).not.toContain('golf_team_members');
    expect(flat(depth)).not.toContain('golf_players');
    // Each once, however many holes and shots the round has.
    for (const t of ['golf_holes', 'golf_shots', 'golf_course_tees']) expect(flat(depth).filter((x) => x === t)).toHaveLength(1);
  });

  it('112101 the review (coach): the round, then the coach’s membership check, then the holes, the shots, the tee and the player’s name together', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_rounds: { data: { id: 'r1', player_id: 'p1', status: 'completed', is_test: false, tee_id: 'tee-1', team_id: 't1', holes_played: 18, round_date: '2026-10-14', round_type: 'practice', course_name: 'Finley GC' } },
      golf_team_members: { data: [{ id: 'm1' }] },
      golf_holes: { data: [] },
      golf_shots: { data: [] },
      golf_course_tees: { data: { total_yards: 6984 } },
      golf_players: { data: { first_name: 'Jonah', last_name: 'Okafor' } },
      golf_teams: { data: { gender: 'mens' } },
    };
    const { result, waves: depth } = await waves.run(loadRoundReview('r1', { role: 'coach', teamId: 't1' }));
    expect(result.kind).toBe('ok');
    expect(depth[0]).toEqual(['golf_rounds']);
    expect(depth[1]).toEqual(['golf_team_members']);
    for (const t of ['golf_holes', 'golf_shots', 'golf_course_tees', 'golf_players', 'golf_teams']) expect(at(depth, t)).toBe(2);
  });

  it('112101 the review: the shots are paged (a page after a full one), and a read that fails is flagged on its own part and logged, never thrown', async () => {
    const shotRanges: Array<[number, number]> = [];
    tables.current = {
      golf_rounds: { data: { id: 'r1', player_id: 'p1', status: 'completed', is_test: false, tee_id: null, team_id: null, holes_played: 18, round_date: '2026-10-14', round_type: 'practice', course_name: 'Finley GC' } },
      golf_holes: { error: { message: 'boom' } },
      golf_shots: (f) => {
        shotRanges.push(rangeOf(f)!);
        return { data: Array.from({ length: shotRanges.length === 1 ? 1000 : 3 }, (_, i) => ({ hole_number: 1, shot_number: i + 1 })) };
      },
    };
    const res = await loadRoundReview('r1', { role: 'player', playerId: 'p1' });
    expect(res.kind).toBe('ok');
    expect(shotRanges).toEqual([[0, 999], [1000, 1999]]);
    expect(logServer).toHaveBeenCalledWith('rounds.review', 'holes', expect.anything());
    if (res.kind === 'ok') expect(res.review.holesError).toBe(true);
  });
});
