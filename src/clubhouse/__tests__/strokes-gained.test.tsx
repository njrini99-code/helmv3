import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Strokes gained everywhere the owner reads it (2026-09-30): one baseline label, the window mean as every headline,
 * bars on the data's own scale, the four legs on the phone profile, the Rounds table, the comparison table and the
 * round review, the change against the previous 10, and the early-read banner keyed on rounds with shots.
 * Each state's number is in docs/clubhouse/catalog (CH-4311, CH-4312, CH-5308, CH-5309, CH-5310, CH-11313).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
const detailed = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed }));

import { loadPlayerProfile, type ChPlayerProfile } from '../data/stats-player';
import { loadTeamStats, type ChTeamStats } from '../data/stats-team';
import { sgChange } from '../data/stats-common';
import { loadRoundReview } from '../data/round-review';
import type { ChRoundReview } from '../data/round-review-shape';
import { sgBaseline, sgScale, sgShare, sgTint } from '../lib/sg';
import { PlayerHome } from '../screens/home/PlayerHome';
import { RoundReview } from '../screens/rounds/RoundReview';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { CrumbProvider } from '../shell/crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_NO_SG, PREVIEW_REVIEW_ROUND } from '../preview/fixtures-round-review';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY, PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const ROOT = { className: 'ch-root', 'data-ui': 'clubhouse' } as const;
function shell(node: React.ReactNode) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div {...ROOT}>{node}</div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>
  );
}
const wrap = (node: React.ReactNode) => render(shell(node));
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
/** At phone width for the length of a describe. */
function phoneWidth() {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });
}

const team = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...over });
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...over });
const showTeam = (data: ChTeamStats) => wrap(<StatsTeam data={data} />);
const showPlayer = (data: ChPlayerProfile, initialTab?: string) => wrap(<StatsPlayer data={data} coachId="c1" initialTab={initialTab} />);
const showPlayerPhone = (data: ChPlayerProfile, coachId: string | null = 'c1') =>
  wrap(
    <>
      <SlotHost />
      <StatsPlayer data={data} coachId={coachId} />
    </>,
  );
const card = (label: string) => [...document.querySelectorAll('.ch-fg__c')].find((c) => c.querySelector('.ch-fg__l')?.textContent === label) as HTMLElement;
const barWidth = (row: Element) => parseFloat((row.querySelector('[class*="__v"]') as HTMLElement).style.width);

beforeEach(() => {
  logServer.mockClear();
  router.push.mockClear();
  detailed.mockReset();
  detailed.mockResolvedValue({ roundsPlayed: 3 });
  tables.current = {};
});

/* ─── The baseline, said one way ─── */

describe('the strokes gained baseline', () => {
  it('names the Tour for a men’s team, the women’s Tour baseline for a women’s team, and claims none when the tour is unknown', () => {
    expect(sgBaseline('pga')).toEqual({ vs: 'vs Tour', noun: 'the Tour baseline' });
    expect(sgBaseline('lpga')).toEqual({ vs: "vs the women's Tour baseline", noun: "the women's Tour baseline" });
    expect(sgBaseline(null)).toEqual({ vs: 'vs the baseline', noun: 'the baseline' });
  });

  it('the player profile says vs Tour (never vs D1) on the hero, on the phone figure and in the comparison table; a women’s team says so', () => {
    showPlayer(player());
    const hero = [...document.querySelectorAll('.ch-pf-hero__figs > div')].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    expect(hero.querySelector('.ch-pf-hero__sub')!.textContent).toBe('Per round vs Tour');
    expect(screen.getByText(/Same window, active players · strokes gained vs Tour/)).toBeTruthy();
  });

  it('a women’s team reads the women’s Tour baseline on the hero and the leg card', () => {
    showPlayer(player({ tour: 'lpga' }));
    expect(document.querySelector('.ch-pf-hero__figs')!.textContent).toContain("Per round vs the women's Tour baseline");
    expect(screen.getByText(/Per round vs the women's Tour baseline/, { selector: '.ch-yb__meta' })).toBeTruthy();
  });

  describe('on the phone', () => {
    phoneWidth();
    it('the SG figure and the strokes gained panel say vs Tour, not vs D1', () => {
      showPlayerPhone(player());
      const figs = document.querySelector('.ch-stm-figs')!;
      const sg = [...figs.children].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
      expect(sg.textContent).toContain('vs Tour');
      expect(sg.textContent).not.toContain('D1');
      expect(document.getElementById('ch-spm-sg')!.closest('section')!.textContent).toContain('Per round · vs Tour');
    });
  });

  it('Home: the season’s strokes gained is vs Tour, and the legs’ header says the strokes gained are the season’s and D1 marks the stats', () => {
    wrap(<PlayerHome data={PREVIEW_PLAYER_HOME} now={PREVIEW_HOME_NOW} />);
    const sg = [...document.querySelectorAll('.ch-ph-figs > div')].find((d) => d.querySelector('dt')!.textContent === 'Strokes gained')!;
    expect(sg.textContent).toContain('Season, per round vs Tour');
    const legs = document.getElementById('ch-ph-legs')!.closest('section')!;
    expect(legs.querySelector('.ch-ph-game__h span')!.textContent).toBe('Last 10 rounds · strokes gained this season vs Tour · D1 marks the stats');
    expect(document.body.textContent).not.toMatch(/strokes gained vs D1|Per round vs D1/);
  });

  it('Home: a women’s team reads the women’s Tour baseline', () => {
    wrap(<PlayerHome data={{ ...PREVIEW_PLAYER_HOME, tour: 'lpga' }} now={PREVIEW_HOME_NOW} />);
    expect(document.body.textContent).toContain("Season, per round vs the women's Tour baseline");
    expect(document.body.textContent).toContain("strokes gained this season vs the women's Tour baseline");
  });
});

/* ─── Bars on the data's own scale ─── */

describe('bar scale', () => {
  it('is the largest value rounded up to a whole stroke, never under 1, symmetric around zero', () => {
    expect(sgScale([2.6, -1.9, 0.3])).toBe(3);
    expect(sgScale([-2.6, 0.3])).toBe(3);
    expect(sgScale([0.3, -0.4, null])).toBe(1);
    expect(sgScale([1.4])).toBe(2);
    expect(sgScale([null, undefined])).toBe(1);
    expect(sgShare(2.6, 3)).toBeCloseTo(0.8667, 3);
    expect(sgShare(-9, 3)).toBe(1);
  });

  it('the grid tint follows the scale: 2.6 on a scale of 3 is not the full tint a fixed 1.2 would give', () => {
    expect(sgTint(-2.6, 3)).toBe('rgb(154 101 18 / 0.32)');
    expect(sgTint(2.6, 3)).toBe('rgb(21 90 57 / 0.32)');
    expect(sgTint(null, 3)).toBe('var(--ch-ivory-100)');
  });

  it('the team grid uses that scale in the page: a −2.6 cell is tinted 0.32, not the full tint a fixed 1.2 gave', () => {
    showTeam(team({ grid: [{ ...PREVIEW_TEAM_STATS.grid[0]!, legs: [-2.6, 0.3, 0.1, 0.2] }] }));
    const cell = document.querySelector('.ch-lg__r:not(.ch-lg__r--h) .ch-lg__cell') as HTMLElement;
    expect(cell.getAttribute('style') ?? '').toContain('0.32');
  });

  it('desktop player: the leg route draws a −2.6 leg at 2.6 of 3, not clamped at 1.4', () => {
    const win = { ...PREVIEW_PLAYER.win, sgLegs: { tee: 0.3, approach: -2.6, around: 0.1, putting: -1.9 } };
    showPlayer(player({ win }));
    const rects = [...document.querySelectorAll('svg.ch-route rect')];
    const heights = rects.map((r) => parseFloat(r.getAttribute('height')!));
    // Half-height 64: approach 2.6/3, putting 1.9/3, tee 0.3/3.
    expect(heights[1]).toBeCloseTo((2.6 / 3) * 64, 1);
    expect(heights[3]).toBeCloseTo((1.9 / 3) * 64, 1);
    expect(heights[0]).toBeCloseTo((0.3 / 3) * 64, 1);
  });

});

describe('bar scale · team phone', () => {
  phoneWidth();
  it('a −2.6 leg is drawn at 2.6 of 3 (43% of the track), not clamped at 1.4 (50%); the total sits under it on the same scale', () => {
    showTeam(team({ legTotals: [0.4, -2.6, 0.1, -1.9], team: { ...PREVIEW_TEAM_STATS.team, sgMean: -4.0 } }));
    const panel = document.getElementById('ch-stm-legs')!.closest('section')!;
    const rows = [...panel.querySelectorAll('.ch-stm-leg')];
    expect(rows.map((r) => r.querySelector('span')!.textContent)).toEqual(['Off the tee', 'Approach', 'Around green', 'Putting', 'Team total']);
    // The total (−4.0) sets the scale: 4 of 4 fills its half of the track, and −2.6 is 2.6 / 4.
    expect(barWidth(rows[4]!)).toBeCloseTo(50, 1);
    expect(barWidth(rows[1]!)).toBeCloseTo((2.6 / 4) * 50, 1);
    expect(rows[4]!.className).toContain('is-total');
    expect(rows[4]!.querySelector('b')!.textContent).toBe('−4.0');
    expect(panel.querySelector('.ch-stm-panel__h span')!.textContent).toBe('Per round · vs Tour');
  });

  it('the legs alone set the scale when the total is small: a −2.6 leg is 2.6 of 3', () => {
    showTeam(team({ legTotals: [0.4, -2.6, 0.1, -1.9], team: { ...PREVIEW_TEAM_STATS.team, sgMean: -0.5 } }));
    const rows = [...document.getElementById('ch-stm-legs')!.closest('section')!.querySelectorAll('.ch-stm-leg')];
    expect(barWidth(rows[1]!)).toBeCloseTo((2.6 / 3) * 50, 1);
  });

  it('a women’s team’s note names the women’s Tour baseline', () => {
    showTeam(team({ tour: 'lpga', legTotals: [0.4, 0.2, 0.1, 0.3] }));
    expect(screen.getByText("No leg is losing strokes against the women's Tour baseline.")).toBeTruthy();
  });
});

/* ─── Team, desktop: the headline, the sort, the notes ─── */

describe('team stats · desktop', () => {
  it('the SG headline card: a signed figure, gain green or loss amber, its change chip, and what it is measured against', () => {
    showTeam(team());
    const c = card('Team SG per round');
    expect(c.querySelector('.ch-fg__v')!.textContent).toBe('−0.5');
    expect(c.querySelector('.ch-fg__v')!.className).toContain('ch-loss');
    expect(c.querySelector('.ch-delta')!.textContent).toBe('+0.4');
    expect(c.querySelector('.ch-delta')!.className).toContain('is-good');
    expect(c.querySelector('.ch-fg__n')!.textContent).toBe('vs Tour · 58 rounds with shots');
    // Six cards, laid out in six columns.
    expect((document.querySelector('.ch-fg') as HTMLElement).style.getPropertyValue('--ch-fg-n')).toBe('6');
  });

  it('CH-4311 no rounds with shots: a dash and what it needs, never a zero', () => {
    const [sg, ...rest] = PREVIEW_TEAM_STATS.figures;
    showTeam(team({ figures: [{ ...sg!, value: null, delta: null, context: 'Needs rounds with shots', note: 'vs Tour', state: 'empty' }, ...rest] }));
    expect(code('CH-4311')!.querySelector('.ch-fg__v')!.textContent).toBe('—');
    expect(code('CH-4311')!.textContent).toContain('Needs rounds with shots');
  });

  it('CH-4312 no earlier rounds to compare: the headline says so instead of a chip', () => {
    const [sg, ...rest] = PREVIEW_TEAM_STATS.figures;
    showTeam(team({ figures: [{ ...sg!, delta: null, context: 'No earlier rounds', state: 'no-comparison' }, ...rest] }));
    expect(code('CH-4312')!.textContent).toContain('No earlier rounds');
    expect(code('CH-4312')!.querySelector('.ch-delta')).toBeNull();
  });

  it('each leg card’s headline is the window’s mean a round, not the latest week: putting is −0.3 (amber) though its last week was +0.3', () => {
    showTeam(team());
    const putting = [...document.querySelectorAll('.ch-sgm')].find((b) => b.querySelector('.ch-sgm__l')!.textContent === 'Putting')!;
    expect(PREVIEW_TEAM_STATS.legWeeks.Putting.at(-1)).toBe(0.3);
    expect(putting.querySelector('.ch-sgm__v')!.textContent).toBe('−0.3');
    expect(putting.querySelector('.ch-sgm__v')!.className).toContain('ch-loss');
    const tee = [...document.querySelectorAll('.ch-sgm')].find((b) => b.querySelector('.ch-sgm__l')!.textContent === 'Off the tee')!;
    expect(tee.querySelector('.ch-sgm__v')!.textContent).toBe('+0.4');
  });

  it('the player list beside the trend is sorted by the window’s mean, not the last week, and shows that mean', async () => {
    const user = userEvent.setup();
    const mk = (id: string, sg: number[], sgMean: number, score: number[], scoreMean: number) => ({ id, name: `${id} Player`, first: id, sg, score, sgMean, scoreMean });
    // A gained 0.5 a round over the window but lost strokes in the last week; B is the reverse.
    showTeam(team({ players: [mk('B', [-1, 1], -0.2, [74, 75], 72.6), mk('A', [1, -1], 0.5, [72, 71], 73.4)] }));
    // Each entry is a name and the number beside it.
    const ends = () => [...document.querySelectorAll('.ch-sgt__end')].map((e) => `${e.children[1]!.textContent}${e.querySelector('b')!.textContent}`);
    expect(ends()).toEqual(['A+0.5', 'B−0.2']);
    // Scoring: B's mean 72.6 is lower (better) than A's 73.4, though B's last week (75) is worse than A's (71).
    await user.click(screen.getByRole('radio', { name: 'Scoring' }));
    expect(ends()).toEqual(['B73', 'A73']);
  });

  it('the team’s figure at the head of the list is the window mean too', () => {
    showTeam(team());
    expect(document.querySelector('.ch-sgt__team b')!.textContent).toBe('−0.5');
  });

  it('a change reads as a change: "up about 1.0 a round since Aug 30", not a level the team has gained', async () => {
    const user = userEvent.setup();
    showTeam(team());
    const note = () => document.querySelector('.ch-sgt > .ch-note')!.textContent!;
    expect(note()).toBe("The team's strokes gained are up about 1.0 a round since Aug 30, a weekly average from −1.0 to 0.0.");
    expect(note()).not.toMatch(/has gained|has lost/);
    // A player: Jonah went 0.8 to −0.9.
    await user.click(screen.getByRole('button', { name: /Jonah/ }));
    expect(note()).toBe("Jonah's strokes gained are down about 1.7 a round since Aug 30, a weekly average from +0.8 to −0.9.");
  });

  it('a flat line is flat, not a change', () => {
    showTeam(team({ team: { ...PREVIEW_TEAM_STATS.team, sg: [0.1, 0.1, 0.0, 0.1, 0.1, 0.0, 0.1] } }));
    expect(document.querySelector('.ch-sgt > .ch-note')!.textContent).toBe("The team's strokes gained are flat since Aug 30.");
  });

  it('the trend says what the dashed line is: the Tour baseline, or the women’s; the list is the window average', () => {
    showTeam(team());
    expect(document.querySelector('.ch-sgt__head span')!.textContent).toBe('Per round, weekly average · dashed line is the Tour baseline · names show the window average');
    document.body.innerHTML = '';
    showTeam(team({ tour: 'lpga' }));
    expect(document.querySelector('.ch-sgt__head span')!.textContent).toContain("dashed line is the women's Tour baseline");
  });
});

/* ─── Team loader ─── */

const day = (ago: number) => new Date(Date.UTC(2026, 9, 15 - ago)).toISOString().slice(0, 10);
function rnd(id: string, playerId: string, ago: number, sg: number | null, legs: Array<number | null> | null = null, over: Record<string, unknown> = {}) {
  const total = 72;
  return {
    id,
    player_id: playerId,
    course_name: 'Finley GC',
    tees_played: null,
    round_date: day(ago),
    round_type: 'practice',
    total_score: total,
    score_to_par: 0,
    front_nine: 36,
    back_nine: 36,
    holes_played: 18,
    status: 'completed',
    total_putts: null,
    total_gir: null,
    total_gir_possible: null,
    total_fairways_hit: null,
    total_fairways: null,
    strokes_gained_total: sg,
    strokes_gained_tee: legs?.[0] ?? null,
    strokes_gained_approach: legs?.[1] ?? null,
    strokes_gained_around_green: legs?.[2] ?? null,
    strokes_gained_putting: legs?.[3] ?? null,
    ...over,
  };
}

describe('team loader', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const teamTables = (gender = 'men', rounds: unknown[] = []): import('./supabase-fake').ChFakeTables => ({
    golf_teams: { data: { name: 'Varsity', gender } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }] },
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [] },
    golf_shots: { data: [] },
  });
  // Three rounds in three weeks: +2, +2, then −2 the newest. The window mean is +0.67; the last week alone is −2.0.
  const three = [rnd('r1', 'p1', 21, 2, [1, 1, 0, 0]), rnd('r2', 'p1', 14, 2, [1, 1, 0, 0]), rnd('r3', 'p1', 1, -2, [-1, -1, 0, 0])];

  it('the headline is the window’s mean a round over its rounds with strokes gained, not the newest week’s value', async () => {
    tables.current = teamTables('men', three);
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    const sg = data.figures[0]!;
    expect(sg).toMatchObject({ label: 'Team SG per round', signed: true, lowerIsBetter: false });
    expect(sg.value).toBeCloseTo(2 / 3, 5);
    expect(data.team.sgMean).toBeCloseTo(2 / 3, 5);
    expect(data.team.sg.at(-1)).toBe(-2);
    expect(data.legTotals[0]).toBeCloseTo(1 / 3, 5);
    expect(data.sgRounds).toBe(3);
    expect(sg.note).toBe('vs Tour');
    expect(sg.context).toBe('3 rounds with shots');
    // The player's mean needs three rounds, as in the grid.
    expect(data.players[0]!.sgMean).toBeCloseTo(2 / 3, 5);
    expect(data.players[0]!.scoreMean).toBe(72);
  });

  it('a player with fewer than three strokes gained rounds has no mean to sort by (an early read, as in the grid)', async () => {
    tables.current = teamTables('men', three.slice(0, 2));
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(data.players[0]!.sgMean).toBeNull();
    expect(data.figures[0]!.value).toBe(2);
  });

  it('CH-4311 no strokes gained in the window: no value, never a zero', async () => {
    tables.current = teamTables('men', [rnd('r1', 'p1', 1, null)]);
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(data.figures[0]).toMatchObject({ value: null, state: 'empty', context: 'Needs rounds with shots' });
    expect(data.sgRounds).toBe(0);
  });

  it('a women’s team says so; an unknown tour claims none', async () => {
    tables.current = teamTables('women', three);
    expect((await loadTeamStats({ teamId: 't1', window: 'season' })).figures[0]!.note).toBe("vs the women's Tour baseline");
    tables.current = { ...teamTables('men', three), golf_teams: { error: { message: 'boom' } } };
    const unknown = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(unknown.tour).toBeNull();
    expect(unknown.figures[0]!.note).toBe('vs the baseline');
  });

  it('CH-4312 the change against the previous 10 only with three earlier rounds with shots; otherwise the reason', async () => {
    const many = (n: number, sg: number, from: number) => Array.from({ length: n }, (_, i) => rnd(`m${from}${i}`, 'p1', from + i, sg, [sg, 0, 0, 0]));
    // Ten newest at +2, five before them at +0.5: the change is +1.5.
    tables.current = teamTables('men', [...many(10, 2, 1), ...many(5, 0.5, 11)]);
    const last10 = await loadTeamStats({ teamId: 't1', window: 'last10' });
    expect(last10.figures[0]).toMatchObject({ delta: 1.5, context: 'vs. previous 10' });
    expect(last10.figures[0]!.state).toBeUndefined();
    // Ten rounds and nothing before them.
    tables.current = teamTables('men', many(10, 2, 1));
    expect((await loadTeamStats({ teamId: 't1', window: 'last10' })).figures[0]).toMatchObject({ delta: null, context: 'No earlier rounds', state: 'no-comparison' });
    // Two earlier rounds: too few to compare, and it doesn't say there are none.
    tables.current = teamTables('men', [...many(10, 2, 1), ...many(2, 0.5, 11)]);
    expect((await loadTeamStats({ teamId: 't1', window: 'last10' })).figures[0]).toMatchObject({ delta: null, context: 'Too few earlier rounds with shots' });
    // The season has no previous window by design, so it never claims "no earlier rounds".
    tables.current = teamTables('men', many(10, 2, 1));
    const season = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(season.figures[0]!.context).toBe('10 rounds with shots');
    expect(season.figures[0]!.state).toBeUndefined();
  });
});

describe('the change against the previous window', () => {
  it('a change, or the honest reason; nothing to say for the season or for no strokes gained', () => {
    expect(sgChange(1, 0.4, 'last10', 12)).toEqual({ delta: 0.6, context: 'vs. previous 10' });
    expect(sgChange(1, null, 'last10', 0)).toEqual({ delta: null, context: 'No earlier rounds' });
    expect(sgChange(1, null, 'last10', 2)).toEqual({ delta: null, context: 'Too few earlier rounds with shots' });
    expect(sgChange(1, null, 'season', 40)).toEqual({ delta: null, context: '' });
    expect(sgChange(1, null, 'qualifiers', 0)).toEqual({ delta: null, context: '' });
    expect(sgChange(null, null, 'last10', 0)).toEqual({ delta: null, context: '' });
  });
});

/* ─── Player loader ─── */

describe('player loader', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const profileTables = (rounds: unknown[], over: import('./supabase-fake').ChFakeTables = {}): import('./supabase-fake').ChFakeTables => ({
    golf_teams: { data: { gender: 'men' } },
    golf_players: { data: { id: 'p1', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2029, hometown: null, state: null, handicap: null, handicap_index: 3.9 } },
    golf_team_members: (f) => (f.some(([k, a]) => k === 'select' && a[0] === 'status') ? { data: { status: 'active' } } : { data: [{ player_id: 'p1' }, { player_id: 'p2' }] }),
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [] },
    golf_shots: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    ...over,
  });
  // p1: five rounds, +1 to +5 (mean +3); p2: three rounds at −1. The team pools eight: (15 − 3) / 8 = +1.5.
  const p1 = [1, 2, 3, 4, 5].map((sg, i) => rnd(`a${i}`, 'p1', i + 1, sg, [sg / 2, sg / 2, null, null]));
  const p2 = [1, 2, 3].map((_, i) => rnd(`b${i}`, 'p2', i + 1, -1, [-0.5, -0.5, null, null]));
  const load = (viewer: 'coach' | 'player', window: 'last10' | 'season' = 'last10') => loadPlayerProfile({ viewer, teamId: 't1', playerId: 'p1', window });

  it('the comparison table has strokes gained first: the player’s window mean against the team’s pooled mean for a coach', async () => {
    tables.current = profileTables([...p1, ...p2]);
    const data = (await load('coach'))!;
    const rows = data.comparisons.slice(0, 5);
    expect(rows.map((r) => r.label)).toEqual(['SG total', 'SG off the tee', 'SG approach', 'SG around green', 'SG putting']);
    expect(rows.every((r) => r.sg === true && r.d1 === null && r.lowerIsBetter === false)).toBe(true);
    expect(rows[0]).toMatchObject({ you: 3, team: 1.5 });
    // Off the tee: p1 mean 1.5; the pool of eight, (7.5 − 1.5) / 8 = 0.75.
    expect(rows[1]).toMatchObject({ you: 1.5, team: 0.75 });
    // Around the green has no value on any round: a dash for both, never zero.
    expect(rows[3]).toMatchObject({ you: null, team: null });
    expect(data.comparisons.slice(5).map((r) => r.label)).toEqual(['Scoring avg', 'Fairways hit', 'Greens in regulation', 'Putts per round', 'Scrambling']);
    expect(data.tour).toBe('pga');
  });

  it('a player is never compared with teammates: the strokes gained rows carry no team figure, and no teammate’s rounds are pooled', async () => {
    tables.current = profileTables([...p1, ...p2]);
    const data = (await load('player'))!;
    expect(data.comparisons.slice(0, 5).map((r) => r.team)).toEqual([null, null, null, null, null]);
    expect(data.comparisons[0]!.you).toBe(3);
  });

  it('each round carries its four legs; the tour follows the team’s gender', async () => {
    tables.current = { ...profileTables(p1), golf_teams: { data: { gender: 'women' } } };
    const data = (await load('coach'))!;
    expect(data.tour).toBe('lpga');
    expect(data.rounds[0]!.sgLegs).toEqual([0.5, 0.5, null, null]);
    expect(data.rounds[0]!.sg).toBe(1);
  });

  it('CH-5208 the team’s row does not load: no baseline is claimed', async () => {
    tables.current = { ...profileTables(p1), golf_teams: { error: { message: 'boom' } } };
    expect((await load('coach'))!.tour).toBeNull();
  });

  it('CH-5310 the change against the previous 10: a value with three earlier rounds with shots, or why there is none', async () => {
    const at = (n: number, sg: number, from: number) => Array.from({ length: n }, (_, i) => rnd(`c${from}${i}`, 'p1', from + i, sg, [sg, 0, 0, 0]));
    tables.current = profileTables([...at(10, 2, 1), ...at(5, 0.5, 11)]);
    expect((await load('coach'))!.sgChange).toEqual({ delta: 1.5, context: 'vs. previous 10' });
    tables.current = profileTables(at(10, 2, 1));
    expect((await load('coach'))!.sgChange).toEqual({ delta: null, context: 'No earlier rounds' });
    tables.current = profileTables([...at(10, 2, 1), ...at(2, 0.5, 11)]);
    expect((await load('coach'))!.sgChange.context).toBe('Too few earlier rounds with shots');
    // The season has no previous window: nothing is claimed.
    tables.current = profileTables(at(10, 2, 1));
    expect((await load('coach', 'season'))!.sgChange).toEqual({ delta: null, context: '' });
  });

  it('the make-rate bands come from the window’s putts in the team page’s bands, with exact counts; a failed read leaves them out', async () => {
    const shots = [
      { round_id: 'a0', putt_distance_feet: 30, putt_made: true },
      { round_id: 'a0', putt_distance_feet: 31, putt_made: false },
      { round_id: 'a0', putt_distance_feet: 27, putt_made: false },
      { round_id: 'a0', putt_distance_feet: 8, putt_made: true },
    ];
    tables.current = profileTables(p1, { golf_shots: { data: shots } });
    const bands = (await load('coach'))!.puttBands!;
    expect(bands.map((b) => b.label)).toEqual(['0–3 ft', '3–5 ft', '5–10 ft', '10–15 ft', '15–25 ft', '25+ ft']);
    expect(bands.find((b) => b.label === '25+ ft')).toMatchObject({ attempts: 3, made: 1 });
    expect(bands.find((b) => b.label === '5–10 ft')).toMatchObject({ attempts: 1, made: 1 });
    tables.current = profileTables(p1, { golf_shots: { error: { message: 'boom' } } });
    expect((await load('coach'))!.puttBands).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'putts', expect.anything(), 'stats_analytics');
    tables.current = profileTables(p1);
    expect((await load('coach'))!.puttBands).toBeNull();
  });
});

/* ─── Player profile · desktop ─── */

describe('player profile · desktop', () => {
  it('the hero’s SG figure carries its change chip against the previous 10 (amber when it fell)', () => {
    showPlayer(player());
    const hero = [...document.querySelectorAll('.ch-pf-hero__figs > div')].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    const chip = hero.querySelector('.ch-delta')!;
    expect(chip.textContent).toBe('−1.3');
    expect(chip.className).toContain('is-bad');
    expect(hero.textContent).toContain('vs. previous 10');
  });

  it('CH-5310 no earlier rounds: the hero says so instead of a chip', () => {
    showPlayer(player({ sgChange: { delta: null, context: 'No earlier rounds' } }));
    expect(code('CH-5310')!.textContent).toBe('No earlier rounds');
    expect(document.querySelector('.ch-pf-hero__figs .ch-delta')).toBeNull();
  });

  it('the season window has no chip and no claim about earlier rounds', () => {
    showPlayer(player({ window: 'season', sgChange: { delta: null, context: '' } }));
    expect(code('CH-5310')).toBeNull();
    expect(document.querySelector('.ch-pf-hero__figs')!.textContent).not.toMatch(/earlier|previous/);
  });

  it('the Rounds tab shows each round’s four legs next to its total', async () => {
    const user = userEvent.setup();
    showPlayer(player());
    await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    const table = screen.getByRole('table', { name: 'Rounds' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads.slice(-5)).toEqual(['SG total', 'SG off the tee', 'SG approach', 'SG around green', 'SG putting']);
    const first = within(table).getAllByRole('row')[1]!;
    // Oct 12: −1.1 in total; tee +0.2, approach −1.3 (carries the difference), around −0.1, putting +0.1.
    expect(within(first).getAllByRole('cell').slice(-5).map((c) => c.textContent)).toEqual(['−1.1', '+0.2', '−1.3', '−0.1', '+0.1']);
    expect(within(first).getAllByRole('cell')[10]!.className).toContain('ch-gain');
    expect(within(first).getAllByRole('cell')[8]!.className).toContain('ch-loss');
  });

  it('the comparison table leads with strokes gained: signed, green for a gain and amber for a loss, the team’s figure beside it for a coach', () => {
    showPlayer(player());
    const rows = [...document.querySelectorAll('table.ch-ft tbody tr')];
    expect(rows.slice(0, 5).map((r) => r.querySelector('td')!.textContent)).toEqual(['SG total', 'SG off the tee', 'SG approach', 'SG around green', 'SG putting']);
    const total = rows[0]!.querySelectorAll('td');
    expect(total[1]!.textContent).toBe('−0.9');
    expect(total[1]!.querySelector('span')!.className).toContain('ch-loss');
    expect(total[2]!.textContent).toBe('−0.5');
    // Putting +0.2 is a gain even though the team is at −0.3, and a loss stays a loss when it beats the team.
    expect(rows[4]!.querySelectorAll('td')[1]!.querySelector('span')!.className).toContain('ch-gain');
  });

  it('a player’s own table has strokes gained with no team column and no D1 for it', () => {
    showPlayer(
      player({
        viewer: 'player',
        comparisons: PREVIEW_PLAYER.comparisons.map((c) => ({ ...c, team: null })),
      }),
    );
    const table = document.querySelector('table.ch-ft')!;
    expect([...table.querySelectorAll('th')].map((h) => h.textContent)).toEqual(['Stat', 'You', 'D1']);
    const total = table.querySelector('tbody tr')!.querySelectorAll('td');
    expect([total[0]!.textContent, total[1]!.textContent, total[2]!.textContent]).toEqual(['SG total', '−0.9', '—']);
  });
});

describe('the early-read banner keys on rounds with shots', () => {
  const win = (rounds: number, sgRounds: number) => ({ ...PREVIEW_PLAYER.win, rounds, sgRounds, sgPerRound: sgRounds >= 3 ? -0.9 : null });

  it('CH-5308 five rounds but one with shots: strokes gained needs three, and the banner says how many have them', () => {
    showPlayer(player({ win: win(5, 1) }));
    expect(code('CH-5308')!.textContent).toContain('Strokes gained needs three rounds posted with shots. Jonah has 1 of 5 rounds with shots in this window');
    expect(code('CH-5305')).toBeNull();
  });

  it('CH-5308 three rounds with shots, or fewer than three rounds: no shots banner (fewer rounds keeps the early read, CH-5305)', () => {
    showPlayer(player({ win: win(5, 3) }));
    expect(code('CH-5308')).toBeNull();
    expect(code('CH-5305')).toBeNull();
    document.body.innerHTML = '';
    showPlayer(PREVIEW_PLAYER_EARLY);
    expect(code('CH-5305')).not.toBeNull();
    expect(code('CH-5308')).toBeNull();
  });

  describe('on the phone', () => {
    phoneWidth();
    it('CH-5308 says it to a coach by name and to a player as “You”', () => {
      showPlayerPhone(player({ win: win(5, 1) }));
      expect(code('CH-5308')!.textContent).toContain('Jonah has 1 of 5 rounds with shots');
      document.body.innerHTML = '';
      showPlayerPhone(player({ viewer: 'player', win: win(5, 0) }), null);
      expect(code('CH-5308')!.textContent).toContain('You have 0 of 5 rounds with shots');
    });
  });
});

/* ─── Player profile · phone ─── */

describe('player profile · phone', () => {
  phoneWidth();
  const panel = () => document.getElementById('ch-spm-sg')!.closest('section')!;

  it('the four legs and the total, the window’s mean, each bar on the data’s own scale; the panel sits right after the figures', () => {
    showPlayerPhone(player({ win: { ...PREVIEW_PLAYER.win, sgPerRound: -3.3, sgLegs: { tee: 0.3, approach: -2.6, around: 0.1, putting: -1.9 } } }));
    expect(screen.getByRole('heading', { level: 2, name: 'Strokes gained' })).toBeTruthy();
    const rows = [...panel().querySelectorAll('.ch-stm-leg')];
    expect(rows.map((r) => [r.querySelector('span')!.textContent, r.querySelector('b')!.textContent])).toEqual([
      ['Off the tee', '+0.3'],
      ['Approach', '−2.6'],
      ['Around green', '+0.1'],
      ['Putting', '−1.9'],
      ['Total', '−3.3'],
    ]);
    // The total (3.3, rounded up to 4) sets the scale.
    expect(barWidth(rows[1]!)).toBeCloseTo((2.6 / 4) * 50, 1);
    expect(barWidth(rows[4]!)).toBeCloseTo((3.3 / 4) * 50, 1);
    expect(rows[4]!.className).toContain('is-total');
    expect(panel().querySelector('.ch-stm-note')!.textContent).toBe('2 legs are losing strokes: Approach, Putting.');
    const order = [...document.querySelectorAll('.ch-stm-figs, #ch-spm-sg')];
    expect(order[0]!.className).toContain('ch-stm-figs');
  });

  it('CH-5309 no strokes gained yet: the panel says what it needs instead of bars of dashes', () => {
    showPlayerPhone(player({ win: { ...PREVIEW_PLAYER.win, sgPerRound: null, sgRounds: 0, sgLegs: { tee: null, approach: null, around: null, putting: null } } }));
    expect(code('CH-5309')!.textContent).toContain('No strokes gained in this window.');
    expect(panel().querySelector('.ch-stm-leg')).toBeNull();
  });

  it('a change chip under the SG figure, and each round in the list carries its strokes gained', () => {
    const [first, second] = PREVIEW_PLAYER.rounds;
    showPlayerPhone(player({ rounds: [first!, { ...second!, sg: 0.6 }] }));
    const sg = [...document.querySelector('.ch-stm-figs')!.children].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    expect(sg.querySelector('.ch-delta')!.textContent).toBe('−1.3');
    expect(sg.textContent).toContain('vs. previous 10');
    const rows = [...document.querySelectorAll('.ch-spm-round')];
    expect(rows[0]!.querySelector('.ch-loss')!.textContent).toBe('−1.1 SG');
    expect(rows[1]!.querySelector('.ch-gain')!.textContent).toBe('+0.6 SG');
  });

  it('a round without strokes gained shows a dash, never zero', () => {
    showPlayerPhone(player({ rounds: [{ ...PREVIEW_PLAYER.rounds[0]!, sg: null, sgLegs: [null, null, null, null] }] }));
    expect(document.querySelector('.ch-spm-round')!.textContent).toContain('— SG');
  });
});

/* ─── Make rate by distance ─── */

describe('make rate by distance (Game detail)', () => {
  it('reaches 25+ feet with the window’s putts, in the team page’s bands', async () => {
    const user = userEvent.setup();
    showPlayer(player());
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const curve = document.querySelector('svg.ch-mk')!;
    expect(curve.getAttribute('aria-label')).toContain('25+ feet 3%');
    expect(curve.getAttribute('aria-label')).toContain('15–25 feet 11%');
    expect(curve.textContent).toContain('34 putts');
    expect(curve.textContent).toContain('25+ ft');
  });

  it('without the window’s putts the curve stops where the shot stats do, at 20 feet', async () => {
    const user = userEvent.setup();
    showPlayer(player({ puttBands: null }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const curve = document.querySelector('svg.ch-mk')!;
    expect(curve.getAttribute('aria-label')).toContain('15–20 feet');
    expect(curve.getAttribute('aria-label')).not.toContain('25+');
  });
});

/* ─── Round review ─── */

describe('round review · strokes gained', () => {
  const show = (r: ChRoundReview) => wrap(<RoundReview review={r} />);
  const rows = () => [...document.querySelectorAll('.ch-rv-sg__r')];

  it('the total and the four legs, each bar on the round’s own scale (approach +1.3 of 2), vs Tour', () => {
    show(PREVIEW_REVIEW);
    const card = screen.getByRole('heading', { level: 2, name: 'Strokes gained' }).closest('section')!;
    expect(card.querySelector('.ch-rv-card__h span')!.textContent).toBe('vs Tour');
    const total = card.querySelector('.ch-rv-sg__tot b')!;
    expect(total.textContent).toBe('+0.6');
    expect(total.className).toContain('is-gain');
    expect(rows().map((r) => [r.querySelector('dt')!.textContent, r.querySelector('b')!.textContent])).toEqual([
      ['Off the tee', '+0.4'],
      ['Approach', '+1.3'],
      ['Around green', '−0.2'],
      ['Putting', '−0.9'],
    ]);
    // Scale: the largest value (1.3) rounded up is 2.
    expect(barWidth(rows()[1]!)).toBeCloseTo((1.3 / 2) * 50, 1);
    expect(rows()[1]!.querySelector('.ch-rv-sg__v')!.className).toContain('is-gain');
    expect(rows()[3]!.querySelector('.ch-rv-sg__v')!.className).toContain('is-loss');
    expect(rows()[3]!.querySelector('.ch-rv-sg__v')!.getAttribute('style')).toContain('right: 50%');
  });

  it('a women’s team’s round says so; a nine-hole round says it is nine holes', () => {
    show({ ...PREVIEW_REVIEW, tour: 'lpga', holesPlayed: 9 });
    expect(document.querySelector('.ch-rv-sg .ch-rv-card__h span')!.textContent).toBe("9 holes · vs the women's Tour baseline");
  });

  it('CH-11313 a round posted without shots has none: one honest line instead of a card of dashes', () => {
    show(PREVIEW_REVIEW_NO_SG);
    expect(code('CH-11313')!.textContent).toBe('No strokes gained for this round. It is worked out from shots tracked hole by hole.');
    expect(screen.queryByRole('heading', { level: 2, name: 'Strokes gained' })).toBeNull();
    expect(document.querySelector('.ch-rv-sg')).toBeNull();
  });

  it('a leg the round has no value for is a dash, not zero', () => {
    show({ ...PREVIEW_REVIEW, strokesGained: { total: 0.6, tee: 0.6, approach: null, around: null, putting: null } });
    expect(rows()[1]!.querySelector('b')!.textContent).toBe('—');
    expect(rows()[1]!.querySelector('.ch-rv-sg__v')).toBeNull();
  });

  describe('on the phone', () => {
    phoneWidth();
    it('the same card sits under the figures', () => {
      show(PREVIEW_REVIEW);
      expect(document.querySelector('.ch-rv.is-phone')).not.toBeNull();
      expect(document.querySelector('.ch-rv-sg .ch-rv-sg__tot b')!.textContent).toBe('+0.6');
      expect(rows()).toHaveLength(4);
    });
  });

  describe('loader', () => {
    const roundRow = { ...PREVIEW_REVIEW_ROUND, is_test: false, status: 'completed', tee_id: null };
    const SG = { strokes_gained_total: 0.6, strokes_gained_tee: 0.4, strokes_gained_approach: 1.3, strokes_gained_around_green: -0.2, strokes_gained_putting: -0.9 };
    /** The fake ignores a select's columns, so this answers with SG only when the loader asked for it. */
    const reads = (gender: string | null = 'women'): import('./supabase-fake').ChFakeTables => ({
      golf_rounds: (f) => {
        const cols = String(f.find(([k]) => k === 'select')?.[1][0] ?? '');
        return { data: { ...roundRow, ...(cols.includes('strokes_gained_total') && cols.includes('strokes_gained_putting') ? SG : { strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null }) } };
      },
      golf_team_members: { data: [{ id: 'm1' }] },
      golf_holes: { data: [] },
      golf_shots: { data: [] },
      golf_players: { data: { first_name: 'Jonah', last_name: 'Okafor' } },
      golf_teams: gender ? { data: { gender } } : { error: { message: 'boom' } },
    });

    it('selects the round’s strokes gained and shapes it; a coach’s team names the tour', async () => {
      tables.current = reads('women');
      const r = await loadRoundReview(roundRow.id, { role: 'coach', teamId: 't1' });
      expect(r.kind === 'ok' && r.review.strokesGained).toEqual({ total: 0.6, tee: 0.4, approach: 1.3, around: -0.2, putting: -0.9 });
      expect(r.kind === 'ok' && r.review.tour).toBe('lpga');
    });

    it('a player’s own team names the tour; without one, or if the team doesn’t load, no baseline is claimed', async () => {
      tables.current = reads('men');
      const own = await loadRoundReview(roundRow.id, { role: 'player', playerId: roundRow.player_id, teamId: 't1' });
      expect(own.kind === 'ok' && own.review.tour).toBe('pga');
      const none = await loadRoundReview(roundRow.id, { role: 'player', playerId: roundRow.player_id });
      expect(none.kind === 'ok' && none.review.tour).toBeNull();
      tables.current = reads(null);
      const down = await loadRoundReview(roundRow.id, { role: 'player', playerId: roundRow.player_id, teamId: 't1' });
      expect(down.kind === 'ok' && down.review.tour).toBeNull();
      expect(logServer).toHaveBeenCalledWith('rounds.review', 'team', expect.anything());
    });

    it('a round with no strokes gained on it has none', async () => {
      tables.current = { ...reads('men'), golf_rounds: { data: { ...roundRow, strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null } } };
      const r = await loadRoundReview(roundRow.id, { role: 'player', playerId: roundRow.player_id });
      expect(r.kind === 'ok' && r.review.strokesGained).toBeNull();
    });
  });
});
