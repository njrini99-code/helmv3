import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Rounds (P011) library: every numbered state in docs/clubhouse/catalog/rounds.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/golf', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => (teamOf.current instanceof Error ? Promise.reject(teamOf.current) : Promise.resolve(teamOf.current)) }));

import { deleteInProgressRound } from '@/app/golf/actions/golf';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import { loadRoundsLibrary } from '../data/rounds';
import { seasonFrom, teeColorFor, teeLabel, toLibraryRound, type ChRoundsLibrary } from '../data/rounds-shape';
import { ClubhouseRoundsRoute } from '../routes/rounds';
import { groupRounds, RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import { SeasonCard } from '../screens/rounds/parts';
import { RoundsSkeleton } from '../screens/rounds/RoundsSkeleton';
import { LIVE_ROUNDS_WRITES, type ChRoundsWrites } from '../screens/rounds/writes';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import {
  PREVIEW_ROUNDS,
  PREVIEW_ROUNDS_EMPTY,
  PREVIEW_ROUNDS_FAILED,
  PREVIEW_ROUNDS_IDLE,
  PREVIEW_ROUNDS_MANY,
  PREVIEW_ROUNDS_NO_SEASON,
  PREVIEW_ROUNDS_UNFINISHED_FAILED,
  PREVIEW_UNFINISHED,
  previewRow,
} from '../preview/fixtures-rounds';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function show(data: ChRoundsLibrary, w: ChRoundsWrites = { discard: vi.fn(() => Promise.resolve({ success: true })) }) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <RoundsLibrary data={data} playerId="p1" writes={w} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return w;
}

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
});
afterEach(() => {
  tables.current = {};
});

describe('112401 Rounds library, on screen', () => {
  it('110101 shows the round in progress: course, tees, type, holes, and the score through the holes played', () => {
    show(PREVIEW_ROUNDS);
    expect(screen.getByRole('heading', { level: 1, name: 'Your rounds' })).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Blue tees · Practice · 18 holes')).toBeTruthy();
    expect(document.querySelector('.ch-rd-unf__f > span')!.textContent).toBe('+1 through 3');
    expect(screen.getByText('Since August 1 · 8 counted rounds')).toBeTruthy();
  });

  it('110105 draws a control only for a screen that is rebuilt: New round and Continue (round entry is), and every round opens its review', () => {
    show(PREVIEW_ROUNDS);
    expect(screen.getByRole('link', { name: /New round/ }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    expect(screen.getByRole('link', { name: /Continue at hole/ }).getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${PREVIEW_UNFINISHED.id}`);
    const reviews = screen.getAllByRole('link').filter((l) => /^\/golf\/dashboard\/rounds\/a0000000-/.test(l.getAttribute('href') ?? ''));
    expect(reviews).toHaveLength(PREVIEW_ROUNDS.rounds.list.length);
  });

  it('110105 a round whose review can’t be opened is still there to read, as one named group', () => {
    const odd = { ...PREVIEW_ROUNDS_IDLE.rounds.list[0]!, id: 'not-a-round-id' };
    show({ ...PREVIEW_ROUNDS_IDLE, rounds: { list: [odd], error: false } });
    expect(screen.getByRole('group', { name: 'Sep 26, Finley GC, 72 (E)' })).toBeTruthy();
    // Its row is not a link; only the page's own controls (New round, Continue) are.
    expect(screen.queryByRole('link', { name: /Sep 26, Finley GC/ })).toBeNull();
  });

  it('CH-11703 New round, and Continue at the next hole with the press haptic', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS);
    expect(screen.getByRole('link', { name: 'New round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    const go = screen.getByRole('link', { name: /Continue at hole 4/ });
    expect(go.getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${PREVIEW_UNFINISHED.id}`);
    await user.click(go);
    expect(hapticSpy).toHaveBeenCalledWith('press');
  });

  it('CH-11802 the hole strip is hidden from screen readers; the card says it in words', () => {
    show(PREVIEW_ROUNDS);
    const strip = document.querySelector('.ch-rd-unf .ch-rd-strip')!;
    expect(strip.getAttribute('aria-hidden')).toBe('true');
    const cells = strip.querySelectorAll('span');
    expect(cells).toHaveLength(18);
    // 4 on a 4, 6 on a 5, 3 on a 3; the fourth is next.
    expect([...cells].slice(0, 4).map((c) => `${c.className}:${c.textContent}`)).toEqual(['is-par:4', 'is-over:6', 'is-par:3', 'is-next:4']);
  });

  it('a hole under par is marked as under in the strip; over and par are not', () => {
    const birdie = {
      ...PREVIEW_UNFINISHED,
      played: [
        { n: 1, score: 3, par: 4 },
        { n: 2, score: 5, par: 5 },
      ],
      toParThru: -1,
      nextHole: 3,
    };
    show({ ...PREVIEW_ROUNDS, unfinished: { list: [birdie], error: false } });
    const cells = [...document.querySelectorAll('.ch-rd-unf .ch-rd-strip span')].slice(0, 3);
    expect(cells.map((c) => c.className)).toEqual(['is-under', 'is-par', 'is-next']);
    expect(document.querySelector('.ch-rd-unf__f > span')!.textContent).toBe('−1 through 2');
  });

  it('110106 a round with every hole scored reads Ready to submit, and its link says Submit round', () => {
    const done = PREVIEW_ROUNDS_MANY.unfinished.list[2]!;
    show({ ...PREVIEW_ROUNDS_MANY, unfinished: { list: [done], error: false } });
    expect(screen.getByText('Ready to submit')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Submit round/ }).getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${PREVIEW_ROUNDS_MANY.unfinished.list[2]!.id}`);
    expect(document.querySelector('.ch-rd-strip .is-next')).toBeNull();
  });

  it('110106 more than one unfinished round: the newest in the card, the rest listed with Continue or Submit', () => {
    show(PREVIEW_ROUNDS_MANY);
    const more = screen.getByRole('region', { name: '2 more unfinished rounds' });
    expect(within(more).getByText('Oct 2 · not started')).toBeTruthy();
    expect(within(more).getByText('Sep 29 · through 18')).toBeTruthy();
    expect(within(more).getByRole('link', { name: 'Submit' }).getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${PREVIEW_ROUNDS_MANY.unfinished.list[2]!.id}`);
    expect(within(more).getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${PREVIEW_ROUNDS_MANY.unfinished.list[1]!.id}`);
  });

  it('CH-11304 with no round in progress: the idle card and the last round', async () => {
    show(PREVIEW_ROUNDS_IDLE);
    await expectCode('CH-11304', /No round in progress.*Ready when you are\..*Last round Sep 26 · Finley GC/);
    expect(document.querySelectorAll('.ch-rd-strip.is-ghost span')).toHaveLength(18);
  });

  it('CH-11301 nothing posted and nothing in progress: the first-run page, with Start a round (and no second New round)', async () => {
    show(PREVIEW_ROUNDS_EMPTY);
    await expectCode('CH-11301', /No rounds yet.*Track your first round shot by shot/);
    expect(screen.getByRole('link', { name: 'Start a round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    expect(screen.queryByRole('link', { name: 'New round' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('111402 CH-11201 the posted rounds fail to load: said so, Try again asks the server again, never "no rounds"', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS_FAILED);
    await expectCode('CH-11201', /Your rounds didn't load/);
    expect(screen.queryByText('No rounds yet')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    // The round in progress still shows: it loaded.
    expect(screen.getByText('In progress')).toBeTruthy();
    await user.click(within(code('CH-11201') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('110413 CH-11201 a failed list with no round in progress is still the error, never the first-run page', async () => {
    show({ ...PREVIEW_ROUNDS_FAILED, unfinished: { list: [], error: false } });
    await expectCode('CH-11201', /Your rounds didn't load/);
    expect(code('CH-11301')).toBeNull();
  });

  it('CH-11202 the round-in-progress check fails: said in place of the card, with Try again', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS_UNFINISHED_FAILED);
    await expectCode('CH-11202', /Couldn't check for a round in progress/);
    expect(screen.queryByText('No round in progress')).toBeNull();
    await user.click(within(code('CH-11202') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-11203 a section that crashes while drawing is contained: the rest of the page stays', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A season whose ribbon can't be read throws inside SeasonCard only.
    show({ ...PREVIEW_ROUNDS, season: { ...PREVIEW_ROUNDS.season, ribbon: null as never } });
    await expectCode('CH-11203', /Season scoring couldn’t be shown\./);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
    quiet.mockRestore();
  });

  it('110107 CH-11302 rounds posted but no countable 18-hole round this season: the season card says how it fills; the round still lists', async () => {
    show(PREVIEW_ROUNDS_NO_SEASON);
    await expectCode('CH-11302', /Your season starts with your first 18-hole round/);
    const row = screen.getByRole('link', { name: 'Sep 9, Finley GC, 38 (+2)' });
    expect(within(row).getByText('Holes').nextSibling!.textContent).toBe('9');
    expect(screen.getByText('Since August 1')).toBeTruthy();
  });

  it('CH-11303 a search with no match says so; a match keeps only that course', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS_IDLE);
    const search = screen.getByRole('searchbox', { name: 'Search rounds by course' });
    await user.type(search, 'Pinehurst');
    await expectCode('CH-11303', /No rounds at “Pinehurst”/);
    await user.clear(search);
    await user.type(search, 'hope');
    expect(screen.getAllByRole('link').map((g) => g.getAttribute('aria-label')).filter(Boolean)).toEqual(['Sep 18, Hope Valley CC, 71 (+1)', 'Sep 12, Hope Valley CC, 74 (+4)']);
  });

  it('110108 groups by month (newest first) or by course, each with its count and low', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS_IDLE);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['September 2026', 'August 2026']);
    await user.click(screen.getByRole('radio', { name: 'By course' }));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Finley GC', 'Hope Valley CC', 'Old Chatham GC', 'Carolina GC']);
    const finley = screen.getByRole('region', { name: 'Finley GC' });
    expect(within(finley).getByText(/rounds$/).textContent).toBe('5 rounds');
    expect(within(finley).getByText('low').textContent).toBe('low 38');
  });

  it('110107 a round under par is marked in red on its score only; a round that does not count says Not counted', () => {
    const nc = toLibraryRound({ ...previewRow(30, ['2026-09-01', 'Finley GC', 'Blue', 'practice', 40, 72, 20, [2, 14], 2, 20]) });
    show({ ...PREVIEW_ROUNDS_IDLE, rounds: { list: [...PREVIEW_ROUNDS_IDLE.rounds.list, nc!], error: false } });
    const under = screen.getByRole('link', { name: 'Aug 18, Carolina GC, 69 (−3)' });
    expect(under.querySelector('.ch-rd-sc__s')!.className).toContain('is-under');
    expect(screen.getByRole('link', { name: 'Sep 26, Finley GC, 72 (E)' }).querySelector('.ch-rd-sc__s')!.className).not.toContain('is-under');
    expect(within(screen.getByRole('link', { name: 'Sep 1, Finley GC, 40 (−32)' })).getByText('Not counted')).toBeTruthy();
  });

  it('CH-11702 CH-11801 each round is one named link to its review, with the selection haptic', async () => {
    const user = userEvent.setup();
    show(PREVIEW_ROUNDS_IDLE);
    const r = screen.getByRole('link', { name: 'Sep 26, Finley GC, 72 (E)' });
    expect(r.getAttribute('href')).toBe('/golf/dashboard/rounds/a0000000-0000-4000-8000-000000000001');
    await user.click(r);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-rd-title');
    expect(screen.getByRole('region', { name: 'September 2026' })).toBeTruthy();
  });

  it('CH-11803 the ribbon is one labelled image of the season, oldest to newest, with the average', () => {
    show(PREVIEW_ROUNDS_IDLE);
    const rib = screen.getByRole('img', { name: 'Strokes over par for your last 8 rounds, oldest to newest; average +1.9' });
    expect(rib.querySelectorAll('rect.is-under, rect.is-even, rect.is-over, rect.is-q')).toHaveLength(8);
    expect(rib.querySelectorAll('rect.is-under')).toHaveLength(1);
    expect([...rib.querySelectorAll('title')].map((t) => t.textContent)[0]).toBe('Aug 18 · 69 (−3) · Qualifier');
    expect(screen.getByText('Under par')).toBeTruthy();
  });

  it('111902 on the phone the ribbon draws the last ten rounds, on a narrower canvas', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: 'x' + i, date: '2026-09-' + String(i + 1).padStart(2, '0'), score: 72 + (i % 4), toPar: i % 4, type: null }));
    render(<SeasonCard season={{ ...PREVIEW_ROUNDS_IDLE.season, ribbon: many }} phone />);
    const rib = screen.getByRole('img', { name: /last 10 rounds/ });
    expect(rib.getAttribute('viewBox')).toMatch(/^0 0 380 /);
    expect([...rib.querySelectorAll('title')].map((t) => t.textContent)[0]).toMatch(/^Sep 5 /);
  });

  it('111811 the season figures: average, to par, best, putts and greens from countable 18-hole rounds', () => {
    show(PREVIEW_ROUNDS_IDLE);
    const season = screen.getByRole('region', { name: 'Season scoring' });
    expect(within(season).getByText('73.4')).toBeTruthy();
    expect(within(season).getByText('avg · +1.9 to par')).toBeTruthy();
    expect(within(season).getByText('Best').nextSibling!.textContent).toBe('69');
    expect(within(season).getByText('Carolina · Aug 18')).toBeTruthy();
    expect(within(season).getByText('GIR').nextSibling!.textContent).toBe('62%');
  });
});

/**
 * Owner rules (2026-10-01), rule 1: no zero or empty copy beside a failed or unread read; a retry that lands shows what it read.
 */
describe('Rounds library: never a false empty or a wrong figure', () => {
  const lib = (data: ChRoundsLibrary) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <RoundsLibrary data={data} playerId="p1" writes={{ discard: vi.fn(() => Promise.resolve({ success: true })) }} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );

  it('CH-11201 a failed list with no round in progress: the idle card does not say "No rounds posted yet" or name a last round', async () => {
    show({ ...PREVIEW_ROUNDS_FAILED, unfinished: { list: [], error: false } });
    await expectCode('CH-11201', /Your rounds didn't load/);
    // The card is the verified empty of the in-progress read (nothing in progress); what it says about posted rounds is nothing.
    expect(code('CH-11304')).not.toBeNull();
    expect(screen.queryByText('No rounds posted yet')).toBeNull();
    expect(screen.queryByText(/Last round/)).toBeNull();
    expect(screen.queryByText('No rounds yet')).toBeNull();
  });

  it('CH-11214 a card whose holes did not load says so, with Try again, and never "no holes scored yet"', async () => {
    const user = userEvent.setup();
    const unread = { ...PREVIEW_UNFINISHED, played: [], toParThru: null, readyToSubmit: false, holesError: true };
    show({ ...PREVIEW_ROUNDS, unfinished: { list: [unread], error: false } });
    await expectCode('CH-11214', /This round's scores didn't load/);
    expect(screen.queryByText('Set up, no holes scored yet')).toBeNull();
    // The strip draws numbers only: nothing is marked scored, and the next hole is not claimed.
    const strip = document.querySelector('.ch-rd-unf .ch-rd-strip')!;
    expect(strip.className).toContain('is-ghost');
    expect(strip.querySelector('.is-next')).toBeNull();
    await user.click(within(code('CH-11214') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The saved current hole still says where to go on.
    expect(screen.getByRole('link', { name: /Continue at hole 4/ })).toBeTruthy();
  });

  it('CH-11214 the more-unfinished list says a round’s scores did not load, not "not started"', () => {
    const unread = (id: string, over: Partial<typeof PREVIEW_UNFINISHED> = {}) => ({ ...PREVIEW_UNFINISHED, id, played: [], toParThru: null, holesError: true, ...over });
    show({ ...PREVIEW_ROUNDS, unfinished: { list: [unread('a0000000-0000-4000-8000-000000000041'), unread('a0000000-0000-4000-8000-000000000042', { course: 'Hope Valley CC' })], error: false } });
    const more = screen.getByRole('region', { name: '1 more unfinished round' });
    expect(within(more).getByText(/scores didn’t load/)).toBeTruthy();
    expect(within(more).queryByText(/not started/)).toBeNull();
  });

  it('CH-11215 a finished round whose "already posted" check could not run is not offered Submit', async () => {
    const all = Array.from({ length: 18 }, (_, i) => ({ n: i + 1, score: 4, par: 4 }));
    const finished = { ...PREVIEW_UNFINISHED, played: all, toParThru: 0, nextHole: null, readyToSubmit: false, submitUnchecked: true };
    show({ ...PREVIEW_ROUNDS_FAILED, unfinished: { list: [finished], error: false } });
    await expectCode('CH-11215', /Couldn't check whether this round was already posted/);
    expect(screen.queryByRole('link', { name: /Submit/ })).toBeNull();
    expect(screen.queryByText('Ready to submit')).toBeNull();
    expect(screen.getByRole('link', { name: 'Continue' })).toBeTruthy();
  });

  it('CH-11215 a finished round in the more-unfinished list says its posted check failed, and is Continue, never Submit', () => {
    const all = Array.from({ length: 18 }, (_, i) => ({ n: i + 1, score: 4, par: 4 }));
    const finished = { ...PREVIEW_UNFINISHED, id: 'a0000000-0000-4000-8000-000000000043', course: 'Governors Club', played: all, toParThru: 0, nextHole: null, readyToSubmit: false, submitUnchecked: true };
    show({ ...PREVIEW_ROUNDS_FAILED, unfinished: { list: [PREVIEW_UNFINISHED, finished], error: false } });
    const more = screen.getByRole('region', { name: '1 more unfinished round' });
    expect(within(more).getByText(/through 18 · couldn’t check if posted/)).toBeTruthy();
    expect(within(more).queryByRole('link', { name: 'Submit' })).toBeNull();
    expect(within(more).getByRole('link', { name: 'Continue' })).toBeTruthy();
  });

  it('a Try again that lands shows the in-progress card it read (the cards are not seeded once from the first render)', () => {
    const { rerender } = render(lib({ ...PREVIEW_ROUNDS_IDLE, unfinished: { list: [], error: true } }));
    expect(code('CH-11202')).not.toBeNull();
    rerender(lib(PREVIEW_ROUNDS));
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(code('CH-11202')).toBeNull();
    expect(screen.queryByText('No round in progress')).toBeNull();
    expect(screen.getByRole('link', { name: /Continue at hole 4/ })).toBeTruthy();
  });

  it('a Try again that lands on a failed list shows the rounds, not the first-run page', () => {
    const { rerender } = render(lib({ ...PREVIEW_ROUNDS_FAILED, unfinished: { list: [], error: false } }));
    expect(code('CH-11201')).not.toBeNull();
    rerender(lib(PREVIEW_ROUNDS_IDLE));
    expect(code('CH-11201')).toBeNull();
    expect(code('CH-11301')).toBeNull();
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.getAllByRole('link').filter((l) => /^Sep 26, Finley GC/.test(l.getAttribute('aria-label') ?? ''))).toHaveLength(1);
  });

  it('a discarded card stays out of a refreshed page that still lists it, and a new card still comes in', async () => {
    const user = userEvent.setup();
    const { rerender } = render(lib(PREVIEW_ROUNDS));
    await user.click(screen.getByRole('button', { name: 'Discard the round at Finley GC' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await waitFor(() => expect(screen.getByText('No round in progress')).toBeTruthy());
    rerender(lib({ ...PREVIEW_ROUNDS, unfinished: { list: [PREVIEW_UNFINISHED, { ...PREVIEW_UNFINISHED, id: 'a0000000-0000-4000-8000-000000000099', course: 'Hope Valley CC' }], error: false } }));
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard the round at Hope Valley CC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Discard the round at Finley GC' })).toBeNull();
  });

  it('CH-11315 posted rounds with no score at all are said, never hidden: not the first-run page, and the count is stated', async () => {
    show({ ...PREVIEW_ROUNDS_EMPTY, rounds: { list: [], error: false, unscored: 2 } });
    await expectCode('CH-11315', /2 posted rounds have no score recorded, so they aren’t listed here/);
    expect(code('CH-11301')).toBeNull();
    expect(screen.queryByText('No rounds yet')).toBeNull();
  });

  it('CH-11315 one unscored round beside the listed ones says "1 posted round"', async () => {
    show({ ...PREVIEW_ROUNDS_IDLE, rounds: { ...PREVIEW_ROUNDS_IDLE.rounds, unscored: 1 } });
    await expectCode('CH-11315', /^1 posted round has no score recorded, so it isn’t listed here\.$/);
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('a failed list never says how many rounds are unscored (it knows of none)', () => {
    show({ ...PREVIEW_ROUNDS_FAILED, rounds: { list: [], error: true, unscored: 3 } });
    expect(code('CH-11315')).toBeNull();
  });
});

describe('Discarding an unfinished round', () => {
  it('110901 CH-11701 CH-11501 the warning comes first, then the question; Discard round deletes it and the idle card takes its place', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_ROUNDS);
    await user.click(screen.getByRole('button', { name: 'Discard the round at Finley GC' }));
    expect(hapticSpy).toHaveBeenNthCalledWith(1, 'warning');
    await expectCode('CH-11501', /Discard this round\?.*Every shot from Finley GC on Oct 14 is deleted\. This can't be undone\./);
    await user.click(screen.getByRole('button', { name: 'Discard round' }));
    expect(w.discard).toHaveBeenCalledWith(PREVIEW_UNFINISHED.id, 'p1');
    await waitFor(() => expect(screen.getByText('No round in progress')).toBeTruthy());
    expect(await screen.findByText('Round discarded')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('Keep it closes the question and sends nothing', async () => {
    const user = userEvent.setup();
    const w = show(PREVIEW_ROUNDS);
    await user.click(screen.getByRole('button', { name: 'Discard the round at Finley GC' }));
    await user.click(await screen.findByRole('button', { name: 'Keep it' }));
    expect(w.discard).not.toHaveBeenCalled();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('111401 111301 CH-11001 a failed discard says so and keeps the card; Retry that works removes it', async () => {
    const user = userEvent.setup();
    const discard = vi.fn().mockResolvedValueOnce({ success: false, error: 'refused' }).mockResolvedValueOnce({ success: true });
    show(PREVIEW_ROUNDS, { discard });
    await user.click(screen.getByRole('button', { name: 'Discard the round at Finley GC' }));
    await user.click(await screen.findByRole('button', { name: 'Discard round' }));
    await expectCode('CH-11001', /Couldn't discard the round at Finley GC/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByText('In progress')).toBeTruthy();
    await user.click(within(code('CH-11001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('No round in progress')).toBeTruthy());
    expect(discard).toHaveBeenCalledTimes(2);
  });

  it('111301 the live discard is the legacy action, and clears the device copy only when it worked', async () => {
    vi.mocked(deleteInProgressRound).mockResolvedValueOnce({ success: false, error: 'nope' } as never);
    await LIVE_ROUNDS_WRITES.discard('u1', 'p1');
    expect(clearEmergencySave).not.toHaveBeenCalled();
    vi.mocked(deleteInProgressRound).mockResolvedValueOnce({ success: true } as never);
    await LIVE_ROUNDS_WRITES.discard('u1', 'p1');
    expect(deleteInProgressRound).toHaveBeenLastCalledWith('u1');
    expect(clearEmergencySave).toHaveBeenCalledWith('u1', 'p1');
  });
});

describe('Rounds loader', () => {
  type Filters = Array<[string, unknown[]]>;
  const status = (f: Filters) => f.find(([k, a]) => k === 'eq' && a[0] === 'status')?.[1][1];
  const completedRow = (over: Record<string, unknown> = {}) => ({
    ...previewRow(0, ['2026-09-26', 'Finley GC', "Men's Blue", 'qualifier', 72, 72, 30, [9, 14], 12, 35]),
    ...over,
  });
  const inProgress = {
    id: 'u1',
    course_name: 'Finley GC',
    tees_played: 'Blue',
    round_date: '2026-10-14',
    round_type: 'practice',
    holes_played: 18,
    current_hole: 4,
    updated_at: '2026-10-14T13:12:00Z',
  };

  it('111501 lists every completed round with its canonical total, and sets the season from countable 18-hole rounds since August 1', async () => {
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_rounds: (f) =>
        status(f) === 'completed'
          ? {
              data: [
                // A stale total_score: front + back (35 + 37) wins, as everywhere else.
                completedRow({ total_score: 70 }),
                completedRow({ id: 'nine', holes_played: 9, total_score: 38, front_nine: 38, back_nine: null, round_date: '2026-09-20' }),
                completedRow({ id: 'july', round_date: '2026-07-20', total_score: 70, front_nine: 35, back_nine: 35, score_to_par: -2 }),
              ],
            }
          : { data: [] },
    };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: 't1' });
    expect(d.rounds.error).toBe(false);
    expect(d.rounds.list.map((r) => [r.id, r.score])).toEqual([
      ['a0000000-0000-4000-8000-000000000001', 72],
      ['nine', 38],
      ['july', 70],
    ]);
    expect(d.rounds.list[0]).toMatchObject({ tee: "Men's Blue tees", teeColor: 'blue', type: 'qualifier', out: 35, inn: 37, fairways: { hit: 9, of: 14 }, greens: { hit: 12, of: 18 } });
    expect(d.season.rounds).toBe(1);
    expect(d.season.avg).toBe(72);
  });

  it('112301 CH-11201 a failed list read is an error, logged, never an empty library', async () => {
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { error: { message: 'boom' } } : { data: [] }) };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.rounds).toEqual({ list: [], error: true });
    expect(logServer).toHaveBeenCalledWith('rounds', 'list', expect.anything());
  });

  it('the round in progress: holes played from golf_holes, the next hole, and the score against par', async () => {
    tables.current = {
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }),
      golf_holes: {
        data: [
          { round_id: 'u1', hole_number: 2, par: 5, score: 6 },
          { round_id: 'u1', hole_number: 1, par: 4, score: 4 },
          { round_id: 'u1', hole_number: 3, par: 3, score: 3 },
          { round_id: 'u1', hole_number: 4, par: 4, score: null },
        ],
      },
    };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.unfinished.list[0]).toMatchObject({ played: [{ n: 1 }, { n: 2 }, { n: 3 }], nextHole: 4, toParThru: 1, readyToSubmit: false, tee: 'Blue tees' });
  });

  it('110106 every hole scored is ready to submit, unless a completed round already holds that course and day', async () => {
    const all = Array.from({ length: 18 }, (_, i) => ({ round_id: 'u1', hole_number: i + 1, par: 4, score: 4 }));
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }), golf_holes: { data: all } };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ readyToSubmit: true, nextHole: null });
    tables.current = {
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [completedRow({ round_date: '2026-10-14' })] } : { data: [inProgress] }),
      golf_holes: { data: all },
    };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]!.readyToSubmit).toBe(false);
  });

  it('112301 110619 a failed hole read keeps the card, falls back to the saved current hole, and never claims ready to submit', async () => {
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }), golf_holes: { error: { message: 'boom' } } };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.unfinished.list[0]).toMatchObject({ played: [], nextHole: 4, readyToSubmit: false });
    expect(logServer).toHaveBeenCalledWith('rounds', 'unfinished-holes', expect.anything());
  });

  it('CH-11214 a failed hole read is carried to the card as a flag, so the card never reads "no holes scored"; a good read carries none', async () => {
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }), golf_holes: { error: { message: 'boom' } } };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ holesError: true, submitUnchecked: false });
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }), golf_holes: { data: [] } };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ holesError: false, played: [] });
  });

  it('CH-11215 a failed completed list cannot rule out a duplicate: a finished card is not ready to submit, and says its check failed', async () => {
    const all = Array.from({ length: 18 }, (_, i) => ({ round_id: 'u1', hole_number: i + 1, par: 4, score: 4 }));
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { error: { message: 'boom' } } : { data: [inProgress] }), golf_holes: { data: all } };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.rounds.error).toBe(true);
    expect(d.unfinished.list[0]).toMatchObject({ readyToSubmit: false, submitUnchecked: true, nextHole: null });
    // An unfinished card is not "submit unchecked" when it is not finished.
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { error: { message: 'boom' } } : { data: [inProgress] }), golf_holes: { data: all.slice(0, 3) } };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ readyToSubmit: false, submitUnchecked: false });
  });

  it('CH-11315 a completed round with no score at all is counted as left out, not dropped silently; it sets no figure', async () => {
    tables.current = {
      golf_rounds: (f) =>
        status(f) === 'completed'
          ? { data: [completedRow(), completedRow({ id: 'blank', total_score: null, front_nine: null, back_nine: null, score_to_par: null }), completedRow({ id: 'blank2', total_score: null, front_nine: null, back_nine: null })] }
          : { data: [] },
    };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.rounds.list.map((r) => r.id)).toEqual(['a0000000-0000-4000-8000-000000000001']);
    expect(d.rounds.unscored).toBe(2);
    expect(d.season.rounds).toBe(1);
    // Nothing unscored: no key at all (the shape other tests compare whole).
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [completedRow()] } : { data: [] }) };
    expect('unscored' in (await loadRoundsLibrary({ playerId: 'p1', teamId: null })).rounds).toBe(false);
  });

  it('110619 CH-11202 a failed in-progress read is its own error', async () => {
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { error: { message: 'boom' } }) };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.unfinished).toEqual({ list: [], error: true });
    expect(d.rounds.error).toBe(false);
  });

  it('tee names: the colour a name spells out, and "tees" added only when missing', () => {
    expect([teeColorFor("Men's Blue"), teeColorFor('Championship'), teeColorFor('Seahawk (Black)'), teeColorFor(null)]).toEqual(['blue', null, 'black', null]);
    expect([teeLabel('Blue'), teeLabel('Qualifying Tees'), teeLabel('  '), teeLabel(null)]).toEqual(['Blue tees', 'Qualifying Tees', null, null]);
  });

  it('the season keeps the best round by strokes against par, and at most the ribbon length', () => {
    const list = PREVIEW_ROUNDS_IDLE.rounds.list;
    expect(seasonFrom(list, '2026-08-01').best).toMatchObject({ score: 69, toPar: -3, course: 'Carolina GC' });
    expect(seasonFrom(list, '2026-09-01').rounds).toBe(5);
  });

  it('110108 groupRounds: by month in date order, by course in order of each course’s newest round', () => {
    const list = PREVIEW_ROUNDS_IDLE.rounds.list;
    expect(groupRounds(list, 'course', '').map((g) => g.key)).toEqual(['Finley GC', 'Hope Valley CC', 'Old Chatham GC', 'Carolina GC']);
    expect(groupRounds(list, 'month', 'CHATHAM').map((g) => [g.key, g.rounds.length])).toEqual([['August 2026', 1]]);
  });
});

describe('Rounds route', () => {
  it('110801 is for players: a coach session renders nothing here (the Fairway page keeps the coach)', async () => {
    session.current = { userId: 'u1', coach: { id: 'c1' }, player: null };
    expect(await ClubhouseRoundsRoute()).toBeNull();
  });

  it('110801 a player without a team still sees their own rounds', async () => {
    session.current = { userId: 'u2', coach: null, player: { id: 'p1' } };
    teamOf.current = null;
    tables.current = { golf_rounds: { data: [] } };
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>{(await ClubhouseRoundsRoute())!}</ToastProvider>
      </LazyMotion>,
    );
    expect(screen.getByText('No rounds yet')).toBeTruthy();
  });

  it('110801 a team read that fails costs only the team clock: the rounds still show, and the failure is logged', async () => {
    session.current = { userId: 'u2', coach: null, player: { id: 'p1' } };
    teamOf.current = new Error('Clubhouse: the player team membership read failed');
    tables.current = { golf_rounds: { data: [] } };
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>{(await ClubhouseRoundsRoute())!}</ToastProvider>
      </LazyMotion>,
    );
    expect(screen.getByText('No rounds yet')).toBeTruthy();
    expect(logServer).toHaveBeenCalledWith('rounds', 'team', expect.any(Error));
    teamOf.current = null;
  });

  it('CH-11401 the route skeleton holds the page shape and says it is loading', async () => {
    render(<RoundsSkeleton />);
    await expectCode('CH-11401');
    expect(screen.getByRole('main', { name: 'Loading your rounds' }).getAttribute('aria-busy')).toBe('true');
  });

  it('the fixture in progress is the board’s: Finley GC, Blue, holes 1 to 3', () => {
    expect(PREVIEW_UNFINISHED.played.map((h) => h.score)).toEqual([4, 6, 3]);
  });
});
