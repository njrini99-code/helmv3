import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Rounds (P011) review: every numbered state in docs/clubhouse/catalog/rounds.md for /rounds/[id], found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const redirectSpy = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/rounds/x', redirect: redirectSpy }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import { loadRoundReview } from '../data/round-review';
import { distribution, nineOf, toHoles, toShot, type ChRoundReview, type ChShotRow } from '../data/round-review-shape';
import { ClubhouseRoundReviewRoute } from '../routes/round-review';
import { firstHole, RoundReview } from '../screens/rounds/RoundReview';
import { isRebuilt } from '../shell/nav';
import { ToastProvider } from '../ui/Toast';
import { ClubhouseMarker } from '../shell/context';
import ReviewLoading from '@/app/golf/(dashboard)/dashboard/rounds/[id]/loading';
import {
  PREVIEW_REVIEW,
  PREVIEW_REVIEW_COACH,
  PREVIEW_REVIEW_HOLE_BY_HOLE,
  PREVIEW_REVIEW_HOLES,
  PREVIEW_REVIEW_NO_HOLES,
  PREVIEW_REVIEW_NO_SHOTS,
  PREVIEW_REVIEW_ROUND,
  PREVIEW_REVIEW_SHOTS,
  PREVIEW_REVIEW_TOTAL_ONLY,
} from '../preview/fixtures-round-review';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const wrap = (node: React.ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const show = (r: ChRoundReview) => wrap(<RoundReview review={r} />);
const holeTitle = () => screen.getByRole('heading', { level: 3, name: /^Hole / }).textContent;

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  redirectSpy.mockClear();
});
afterEach(() => {
  tables.current = {};
});

describe('112401 Round review, on screen', () => {
  it('110102 the hero: date and type, course, tees with yards, rating and slope, then the score and to par', () => {
    show(PREVIEW_REVIEW);
    const hero = screen.getByRole('banner');
    expect(within(hero).getByText('Wed Oct 14 · Practice')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Finley GC' })).toBeTruthy();
    expect(within(hero).getByText('Blue tees · 6,984 yds · 73.1 / 133')).toBeTruthy();
    expect(within(hero).getByText('74')).toBeTruthy();
    const toPar = within(hero).getByText('+2');
    expect(toPar.className).not.toContain('is-under');
  });

  it('a round under par shows its to par as under', () => {
    show({ ...PREVIEW_REVIEW, score: 70, toPar: -2 });
    expect(within(screen.getByRole('banner')).getByText('−2').className).toContain('is-under');
  });

  it('111811 the five figures: front and back with to par, putts per hole, fairways and greens with their rates', () => {
    show(PREVIEW_REVIEW);
    const fig = (k: string) => {
      const dt = screen.getByText(k, { selector: 'dt' });
      return [dt.nextSibling!.textContent, dt.nextSibling!.nextSibling!.textContent];
    };
    expect(fig('Front 9')).toEqual(['37', '+1']);
    expect(fig('Back 9')).toEqual(['37', '+1']);
    expect(fig('Putts')[1]).toMatch(/^\d\.\d \/ hole$/);
    expect(fig('Fairways')[0]).toBe(`${PREVIEW_REVIEW.fairways!.hit}/14`);
    expect(fig('Greens')[1]).toBe(`${Math.round((PREVIEW_REVIEW.greens!.hit / 18) * 100)}%`);
  });

  it('110102 opens on the first hole over par, with every shot: club, distances, where it finished, the miss and the read', () => {
    show(PREVIEW_REVIEW);
    expect(holeTitle()).toBe('Hole 2 · Par 5 · 518 yds');
    const shots = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(shots).toHaveLength(6);
    expect(shots[0]!.textContent).toContain('Tee · Driver');
    expect(shots[0]!.textContent).toContain('518 yds → rough, 238 yds · missed right');
    expect(shots[shots.length - 1]!.textContent).toContain('3 ft → holed');
    expect(shots[shots.length - 1]!.textContent).toContain('Straight · level');
  });

  it('CH-11704 picking a hole on the card, or stepping, shows its shots with the selection haptic', async () => {
    const user = userEvent.setup();
    show(PREVIEW_REVIEW);
    await user.click(screen.getByRole('button', { name: 'Hole 5' }));
    expect(holeTitle()).toBe('Hole 5 · Par 4 · 425 yds');
    expect(screen.getByRole('button', { name: 'Hole 5' }).getAttribute('aria-pressed')).toBe('true');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Next hole' }));
    expect(holeTitle()).toMatch(/^Hole 6 /);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('button', { name: 'Hole 1' }));
    expect((screen.getByRole('button', { name: 'Previous hole' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Hole 18' }));
    expect((screen.getByRole('button', { name: 'Next hole' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('CH-11704 a tap on a score picks that hole too, as the hole number does; the Tot cell picks nothing', async () => {
    const user = userEvent.setup();
    show(PREVIEW_REVIEW);
    await user.click(document.querySelector('.ch-rv-nine .is-score td[data-hole="12"]')!);
    expect(holeTitle()).toMatch(/^Hole 12 /);
    expect(screen.getByRole('button', { name: 'Hole 12' }).getAttribute('aria-pressed')).toBe('true');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    const tot = document.querySelector('.ch-rv-nine .is-score td:last-child')!;
    expect(tot.hasAttribute('data-hole')).toBe(false);
    await user.click(tot);
    expect(holeTitle()).toMatch(/^Hole 12 /);
  });

  it('CH-11804 the card is two captioned tables; a par 3 has no fairway; three putts are flagged', () => {
    show(PREVIEW_REVIEW);
    const [out] = screen.getAllByRole('table');
    expect(out!.querySelector('caption')!.textContent).toMatch(/^Front nine/);
    const firRow = within(out!).getByRole('row', { name: /^FIR/ });
    // Hole 3 is a par 3.
    expect(
      within(firRow)
        .getAllByLabelText(/Hit|Missed|Not applicable/)[2]!
        .getAttribute('aria-label'),
    ).toBe('Not applicable');
    expect(document.querySelectorAll('.ch-rv-nine td.is-warn').length).toBe(PREVIEW_REVIEW_HOLES.filter((h) => (h.putts ?? 0) >= 3).length);
    expect(
      screen
        .getByRole('heading', { level: 3, name: /^Hole / })
        .closest('section')!
        .getAttribute('aria-live'),
    ).toBe('polite');
  });

  it('the scoring distribution counts every scored hole', () => {
    show(PREVIEW_REVIEW);
    const row = (l: string) => screen.getByText(l, { selector: '.ch-rv-dist__r > span:first-child' }).parentElement!.querySelector('b')!.textContent;
    expect([row('Eagle+'), row('Birdie'), row('Par'), row('Bogey'), row('Double+')]).toEqual(['0', '2', '12', '4', '0']);
  });

  it('the recap and the player’s notes, when there are any; a coach sees whose notes they are and whose round', () => {
    show(PREVIEW_REVIEW);
    expect(screen.getByRole('region', { name: 'Round recap' }).textContent).toContain('four bogeys undid two birdies');
    expect(screen.getByRole('heading', { name: 'Your notes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Rounds/ }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });

  it('110102 a coach viewing: the player’s name in the kicker, "Jonah’s notes", and back to that player’s rounds on Stats', () => {
    show(PREVIEW_REVIEW_COACH);
    expect(within(screen.getByRole('banner')).getByText('Jonah Okafor · Wed Oct 14 · Practice')).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Jonah's notes" })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Jonah Okafor/ }).getAttribute('href')).toBe('/golf/dashboard/stats?player=preview-player&tab=rounds');
  });

  it('CH-11204 the card fails to load: said so with Try again; the hero and figures stay', async () => {
    const user = userEvent.setup();
    show(PREVIEW_REVIEW_NO_HOLES);
    await expectCode('CH-11204', /The scorecard didn't load/);
    expect(screen.getByRole('heading', { level: 1, name: 'Finley GC' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(within(code('CH-11204') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-11205 the shots fail to load: said in the hole card; the card still shows', async () => {
    show(PREVIEW_REVIEW_NO_SHOTS);
    await expectCode('CH-11205', /The shots for this round didn't load/);
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(code('CH-11306')).toBeNull();
  });

  it('CH-11305 a round posted as a total says so instead of an empty card', async () => {
    show(PREVIEW_REVIEW_TOTAL_ONLY);
    await expectCode('CH-11305', /Posted as a total/);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Round recap' })).toBeNull();
  });

  it('CH-11306 a hole scored without shots says it was scored as a total', async () => {
    show(PREVIEW_REVIEW_HOLE_BY_HOLE);
    await expectCode('CH-11306', /No shots were tracked on this hole/);
  });
});

describe('Round review, shaping', () => {
  const shot = (over: Partial<ChShotRow>): ChShotRow => ({ ...PREVIEW_REVIEW_SHOTS[0]!, ...over });

  it('a penalty, a putt read, a miss and feet or yards each read plainly', () => {
    expect(toShot(shot({ shot_type: 'penalty', result: 'penalty', is_penalty: true }))).toMatchObject({ kind: 'Penalty', penalty: true, lie: 'penalty' });
    expect(toShot(shot({ shot_type: 'putting', club_type: 'putter', putt_break: 'multiple', putt_slope: 'severe', result: 'green' }))).toMatchObject({
      kind: 'Putt',
      club: null,
      read: 'Multiple breaks · severe',
    });
    expect(toShot(shot({ miss_direction: 'short_right' })).miss).toBe('missed short right');
    expect(toShot(shot({ distance_to_hole_after: 24.4, distance_unit_after: 'feet', result: 'green' })).to).toBe('24 ft');
    expect(toShot(shot({ result: 'hole' })).to).toBeNull();
    expect(toShot(shot({ result: 'lipout' })).lie).toBe('other');
  });

  it('111502 a nine with a hole unscored has no total, rather than a short one', () => {
    const holes = toHoles(
      PREVIEW_REVIEW_HOLES.map((h) => (h.hole_number === 4 ? { ...h, score: null } : h)),
      [],
    );
    expect(nineOf(holes, 1, 9)).toEqual({ score: null, toPar: null });
    expect(nineOf(holes, 10, 18).score).toBe(37);
  });

  it('111502 a par 3 never counts a fairway, whatever was stored', () => {
    const holes = toHoles([{ hole_number: 3, par: 3, yardage: 170, score: 3, putts: 2, fairway_hit: false, gir: true, penalty_strokes: 0 }], []);
    expect(holes[0]!.fairway).toBeNull();
  });

  it('110102 the review opens on the first hole over par, or the first hole', () => {
    expect(firstHole(PREVIEW_REVIEW.holes)).toBe(2);
    expect(firstHole(PREVIEW_REVIEW.holes.map((h) => ({ ...h, score: h.par })))).toBe(1);
    expect(distribution([]).every((d) => d.count === 0)).toBe(true);
  });
});

describe('Round review loader', () => {
  type Filters = Array<[string, unknown[]]>;
  const eq = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];
  const round = (over: Record<string, unknown> = {}) => ({ ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'completed', tee_id: 't1', is_test: false, ...over });
  const full = (over: Record<string, unknown> = {}) => ({
    golf_rounds: { data: round(over) },
    golf_team_members: (f: Filters) => ({ data: eq(f, 'player_id') === 'p1' && eq(f, 'team_id') === 'team1' ? [{ id: 'm1' }] : [] }),
    golf_holes: { data: PREVIEW_REVIEW_HOLES },
    golf_shots: { data: PREVIEW_REVIEW_SHOTS },
    golf_course_tees: { data: { total_yards: 6984 } },
    golf_players: { data: { first_name: 'Jonah', last_name: 'Okafor' } },
  });

  it('the player who played it sees it, with holes, shots and tee yards; no name is read for them', async () => {
    tables.current = full();
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1' });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.review).toMatchObject({ score: 74, toPar: 2, teeFacts: '6,984 yds · 73.1 / 133', playerName: null, holesError: false, shotsError: false });
    expect(r.review.holes).toHaveLength(18);
    expect(r.review.holes[1]!.shots).toHaveLength(6);
  });

  it('111501 the total is the canonical one: front plus back over a stale total_score', async () => {
    tables.current = full({ total_score: 71, score_to_par: -1 });
    const r = await loadRoundReview('x', { role: 'player', playerId: 'p1' });
    expect(r.kind === 'ok' && [r.review.score, r.review.toPar]).toEqual([74, 2]);
  });

  it('110802 another player’s round is "not found", never confirmed', async () => {
    tables.current = full();
    expect(await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p2' })).toEqual({ kind: 'notFound' });
  });

  it('110802 a coach sees a round of a player on their team, with the player’s name; off the team is "not found"', async () => {
    tables.current = full();
    const ok = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'coach', teamId: 'team1' });
    expect(ok.kind === 'ok' && ok.review.playerName).toBe('Jonah Okafor');
    expect(await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'coach', teamId: 'team2' })).toEqual({ kind: 'notFound' });
  });

  it('112301 110802 a failed membership check is an error, not a permission answer', async () => {
    tables.current = { ...full(), golf_team_members: { error: { message: 'down' } } };
    expect(await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'coach', teamId: 'team1' })).toEqual({ kind: 'error' });
    expect(logServer).toHaveBeenCalledWith('rounds.review', 'membership', expect.anything());
  });

  it('110802 a missing or test round is "not found"; a failed read is an error; a round still being played is in progress', async () => {
    tables.current = { ...full(), golf_rounds: { data: null } };
    expect((await loadRoundReview('x', { role: 'player', playerId: 'p1' })).kind).toBe('notFound');
    tables.current = full({ is_test: true });
    expect((await loadRoundReview('x', { role: 'player', playerId: 'p1' })).kind).toBe('notFound');
    tables.current = { ...full(), golf_rounds: { error: { message: 'boom' } } };
    expect((await loadRoundReview('x', { role: 'player', playerId: 'p1' })).kind).toBe('error');
    tables.current = full({ status: 'in_progress' });
    expect((await loadRoundReview('x', { role: 'player', playerId: 'p1' })).kind).toBe('inProgress');
  });

  it('110619 failed hole or shot reads each flag only their part', async () => {
    tables.current = { ...full(), golf_shots: { error: { message: 'boom' } } };
    const a = await loadRoundReview('x', { role: 'player', playerId: 'p1' });
    expect(a.kind === 'ok' && [a.review.holes.length, a.review.shotsError, a.review.holesError]).toEqual([18, true, false]);
    tables.current = { ...full(), golf_holes: { error: { message: 'boom' } } };
    const b = await loadRoundReview('x', { role: 'player', playerId: 'p1' });
    expect(b.kind === 'ok' && [b.review.holes.length, b.review.holesError, b.review.score]).toEqual([0, true, 74]);
  });
});

/**
 * Owner rules (2026-10-01), rule 1: a missing total is never "0 strokes"; a supporting read that failed is said, with a retry,
 * instead of the page quietly drawing different content (a coach seeing "Player", a missing yardage, a dropped baseline).
 */
describe('Round review: never a wrong figure or a silent difference', () => {
  type Filters = Array<[string, unknown[]]>;
  const eq = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];
  const round = (over: Record<string, unknown> = {}) => ({ ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'completed', tee_id: 't1', is_test: false, ...over });
  const base = (over: Record<string, unknown> = {}) => ({
    golf_rounds: { data: round(over) },
    golf_team_members: (f: Filters) => ({ data: eq(f, 'player_id') === 'p1' && eq(f, 'team_id') === 'team1' ? [{ id: 'm1' }] : [] }),
    golf_holes: { data: PREVIEW_REVIEW_HOLES },
    golf_shots: { data: PREVIEW_REVIEW_SHOTS },
    golf_course_tees: { data: { total_yards: 6984 } },
    golf_players: { data: { first_name: 'Jonah', last_name: 'Okafor' } },
    golf_teams: { data: { gender: 'mens' } },
  });
  const heroScore = () => document.querySelector('.ch-rv-hero__s b')!.textContent;

  it('110102 a round with no total shows an em dash and "Score not recorded", never 0 strokes', async () => {
    tables.current = base({ total_score: null, front_nine: null, back_nine: null, score_to_par: null });
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: 'team1' });
    expect(r.kind === 'ok' && r.review.score).toBeNull();
    if (r.kind !== 'ok') return;
    show(r.review);
    expect(heroScore()).toBe('—');
    const hero = within(screen.getByRole('banner'));
    expect(hero.getByText('Score not recorded')).toBeTruthy();
    expect(hero.queryByText('Strokes')).toBeNull();
    expect(hero.queryByText('0')).toBeNull();
  });

  it('110102 a round with a total still shows it as before (the em dash is only for no total)', () => {
    show(PREVIEW_REVIEW);
    expect(heroScore()).toBe('74');
    expect(screen.getByText('Strokes')).toBeTruthy();
  });

  it('CH-11216 a failed tee read says the tee’s yardage is missing, with Try again; the scores stay', async () => {
    const user = userEvent.setup();
    tables.current = { ...base(), golf_course_tees: { error: { message: 'down' } } };
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: 'team1' });
    expect(r.kind === 'ok' && [r.review.teeError, r.review.teeFacts]).toEqual([true, '73.1 / 133']);
    if (r.kind !== 'ok') return;
    show(r.review);
    await expectCode('CH-11216', /Some details of this round didn't load.*The tee’s yardage is missing; the scores are right/);
    expect(heroScore()).toBe('74');
    await user.click(within(code('CH-11216') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-11216 a good tee read says nothing; a round with no tee on file says nothing either (that is not a failure)', async () => {
    tables.current = base({ tee_id: null });
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: 'team1' });
    expect(r.kind === 'ok' && r.review.teeError).toBeFalsy();
    if (r.kind !== 'ok') return;
    show(r.review);
    expect(code('CH-11216')).toBeNull();
  });

  it('CH-11216 a coach whose read of the player’s name failed sees no invented "Player": a notice, Back still goes to Stats, the notes are "The player’s"', async () => {
    tables.current = { ...base(), golf_players: { error: { message: 'down' } } };
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'coach', teamId: 'team1' });
    expect(r.kind === 'ok' && [r.review.playerName, r.review.coachView, r.review.playerError]).toEqual([null, true, true]);
    if (r.kind !== 'ok') return;
    show(r.review);
    await expectCode('CH-11216', /The player’s name is missing/);
    expect(within(screen.getByRole('banner')).getByText('Wed Oct 14 · Practice')).toBeTruthy();
    expect(screen.queryByText(/Player ·/)).toBeNull();
    expect(screen.getByRole('link', { name: /Stats/ }).getAttribute('href')).toBe('/golf/dashboard/stats?player=p1&tab=rounds');
    expect(screen.getByRole('heading', { name: 'The player’s notes' })).toBeTruthy();
  });

  it('CH-11216 a coach whose player read worked but found no player row gets the same notice, never an invented "Player"; a player’s own round never does', async () => {
    tables.current = { ...base(), golf_players: { data: null } };
    const r = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'coach', teamId: 'team1' });
    expect(r.kind === 'ok' && [r.review.playerName, r.review.coachView, r.review.playerError]).toEqual([null, true, true]);
    if (r.kind !== 'ok') return;
    const { unmount } = show(r.review);
    await expectCode('CH-11216', /The player’s name is missing/);
    expect(screen.queryByText(/Player ·/)).toBeNull();
    expect(screen.getByRole('link', { name: /Stats/ }).getAttribute('href')).toBe('/golf/dashboard/stats?player=p1&tab=rounds');
    unmount();

    tables.current = { ...base(), golf_players: { data: null } };
    const own = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: 'team1' });
    expect(own.kind === 'ok' && [own.review.playerName, own.review.coachView, own.review.playerError]).toEqual([null, false, undefined]);
  });

  it('CH-11216 both missing at once are said in one notice', () => {
    show({ ...PREVIEW_REVIEW_COACH, playerName: null, coachView: true, teeError: true, playerError: true });
    expect(code('CH-11216')!.textContent).toMatch(/The tee’s yardage and the player’s name are missing/);
  });

  it('CH-11217 a failed team read says which baseline is unknown, with Try again; a player with no team gets no notice (no team is not a failure)', async () => {
    const user = userEvent.setup();
    tables.current = { ...base(), golf_teams: { error: { message: 'down' } } };
    const failed = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: 'team1' });
    expect(failed.kind === 'ok' && [failed.review.tour, failed.review.tourError]).toEqual([null, true]);
    if (failed.kind !== 'ok') return;
    const { unmount } = show(failed.review);
    await expectCode('CH-11217', /Which Tour this is measured against didn't load/);
    await user.click(within(code('CH-11217') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    unmount();

    tables.current = base();
    const none = await loadRoundReview(PREVIEW_REVIEW_ROUND.id, { role: 'player', playerId: 'p1', teamId: null });
    expect(none.kind === 'ok' && none.review.tourError).toBeFalsy();
    if (none.kind !== 'ok') return;
    show(none.review);
    expect(code('CH-11217')).toBeNull();
  });

  it('CH-11217 a round with no strokes gained draws no baseline notice (it claims no baseline)', () => {
    show({ ...PREVIEW_REVIEW, strokesGained: null, tourError: true });
    expect(code('CH-11217')).toBeNull();
    expect(code('CH-11313')).not.toBeNull();
  });

  it('a Try again that lands on the scorecard opens it on the first hole over par, not on the hole 1 an empty card defaulted to', () => {
    const { rerender } = render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <RoundReview review={PREVIEW_REVIEW_NO_HOLES} />
        </ToastProvider>
      </LazyMotion>,
    );
    expect(code('CH-11204')).not.toBeNull();
    rerender(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <RoundReview review={PREVIEW_REVIEW} />
        </ToastProvider>
      </LazyMotion>,
    );
    expect(code('CH-11204')).toBeNull();
    expect(holeTitle()).toBe('Hole 2 · Par 5 · 518 yds');
  });

  it('a hole the player picked stays picked when the page refreshes under them', async () => {
    const user = userEvent.setup();
    const ui = (r: ChRoundReview) => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <RoundReview review={r} />
        </ToastProvider>
      </LazyMotion>
    );
    const { rerender } = render(ui(PREVIEW_REVIEW));
    await user.click(screen.getByRole('button', { name: 'Hole 5' }));
    rerender(ui({ ...PREVIEW_REVIEW }));
    expect(holeTitle()).toMatch(/^Hole 5 /);
  });

  it('CH-11206 the failed-round page retries through the shared refresh', async () => {
    const user = userEvent.setup();
    const { ReviewLoadFailed } = await import('../screens/rounds/ReviewLoadFailed');
    render(<ReviewLoadFailed />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('Round review route', () => {
  it('CH-11307 a player on someone else’s round gets "This round isn’t here" and a way back to their rounds', async () => {
    session.current = { userId: 'u2', coach: null, player: { id: 'p2' } };
    teamOf.current = { role: 'player', teamId: 'team1', playerId: 'p2' };
    tables.current = { golf_rounds: { data: { ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'completed', is_test: false } } };
    wrap(await ClubhouseRoundReviewRoute({ id: PREVIEW_REVIEW_ROUND.id }));
    await expectCode('CH-11307', /This round isn't here.*It may have been deleted, or it isn’t one of your rounds\./);
    expect(screen.getByRole('link', { name: 'Go to your rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });

  it('CH-11307 a coach off the player’s team gets the coach’s wording and a way back to Stats', async () => {
    session.current = { userId: 'u1', coach: { id: 'c1' }, player: null };
    teamOf.current = { role: 'coach', teamId: 'team2', coachId: 'c1' };
    tables.current = { golf_rounds: { data: { ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'completed', is_test: false } }, golf_team_members: { data: [] } };
    wrap(await ClubhouseRoundReviewRoute({ id: PREVIEW_REVIEW_ROUND.id }));
    await expectCode('CH-11307', /played by someone who isn’t on your team/);
    expect(screen.getByRole('link', { name: 'Go to Stats' })).toBeTruthy();
  });

  it('111402 CH-11206 the round didn’t load: said so, and Try again asks the server again', async () => {
    const user = userEvent.setup();
    session.current = { userId: 'u2', coach: null, player: { id: 'p1' } };
    teamOf.current = null;
    tables.current = { golf_rounds: { error: { message: 'boom' } } };
    wrap(await ClubhouseRoundReviewRoute({ id: PREVIEW_REVIEW_ROUND.id }));
    await expectCode('CH-11206', /This round didn't load/);
    await user.click(screen.getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('110109 a round still being played goes to be continued, as on the legacy page', async () => {
    session.current = { userId: 'u2', coach: null, player: { id: 'p1' } };
    teamOf.current = null;
    tables.current = { golf_rounds: { data: { ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'in_progress', is_test: false } } };
    await expect(ClubhouseRoundReviewRoute({ id: 'r-live' })).rejects.toThrow('NEXT_REDIRECT /golf/dashboard/rounds/continue/r-live');
  });

  it('110801 110105 the review is rebuilt for both roles; the coach’s Rounds library is not', () => {
    const id = PREVIEW_REVIEW_ROUND.id;
    expect([isRebuilt(`/golf/dashboard/rounds/${id}`, 'coach'), isRebuilt(`/golf/dashboard/rounds/${id}`, 'player')]).toEqual([true, true]);
    expect([isRebuilt('/golf/dashboard/rounds', 'coach'), isRebuilt(`/golf/dashboard/rounds/${id}/review`, 'player'), isRebuilt('/golf/dashboard/rounds/new', 'coach')]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('Round review · loading', () => {
  it('CH-11406 inside Clubhouse the review loads in its own shape; outside it, Fairway keeps its skeleton', () => {
    const { unmount } = render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="player">
        <ReviewLoading />
      </ClubhouseMarker>,
    );
    expect(document.querySelector('[data-ch-code="CH-11406"]')!.getAttribute('aria-busy')).toBe('true');
    unmount();
    render(<ReviewLoading />);
    expect(document.querySelector('[data-ch-code="CH-11406"]')).toBeNull();
  });
});
