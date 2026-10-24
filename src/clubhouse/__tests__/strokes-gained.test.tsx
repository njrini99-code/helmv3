import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
const noSpray = vi.hoisted(() => {
  const group = (family: string) => ({ family, totalShots: 0, plottedShots: 0, averageForwardDistance: null, averageRemainingDistance: null, playableCount: 0, troubleCount: 0, penaltyCount: 0, dominantSector: null, points: [], summaryBands: [] });
  return vi.fn(async () => ({ driving: group('driving'), approach: group('approach'), scope: { roundId: 'overall', roundsIncluded: 0, filterApplied: false } }));
});
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: noSpray }));

import { loadPlayerProfile, type ChPlayerProfile } from '../data/stats-player';
import { loadTeamStats, type ChTeamStats } from '../data/stats-team';
import { sgChange } from '../data/stats-common';
import { loadRoundReview } from '../data/round-review';
import type { ChRoundReview } from '../data/round-review-shape';
import { sgBaseline, sgScale, sgShare, sgTint } from '../lib/sg';
import { deltaTone } from '../lib/stats-signal';
import { PlayerHome } from '../screens/home/PlayerHome';
import { RoundReview } from '../screens/rounds/RoundReview';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { ParTiles } from '../screens/stats/charts';
import { puttingNote } from '../screens/stats/notes';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { legScale, legScaleWords } from '../screens/stats/StatsTeamIslands';
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
    // `mark` and `zero` name the gauge's zero mark and the trend's zero line (A8.3).
    expect(sgBaseline('pga')).toEqual({ vs: 'vs Tour', noun: 'the Tour baseline', mark: 'Tour', name: 'the Tour', zero: 'Zero is the Tour' });
    expect(sgBaseline('lpga')).toEqual({ vs: "vs the women's Tour baseline", noun: "the women's Tour baseline", mark: "Women's Tour", name: "the women's Tour", zero: "Zero is the women's Tour" });
    expect(sgBaseline(null)).toEqual({ vs: 'vs the baseline', noun: 'the baseline', mark: 'Baseline', name: 'the baseline', zero: 'Zero is the baseline' });
  });

  it('the player profile says vs Tour (never vs D1) on the hero, on the phone figure and in the comparison table; a women’s team says so', () => {
    showPlayer(player());
    const hero = [...document.querySelectorAll('.ch-pf-hero__figs > div')].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    expect(hero.querySelector('.ch-pf-hero__sub')!.textContent).toBe('Per round vs Tour');
    expect(document.querySelector('.ch-zn__def')!.textContent).toContain('Zero is the Tour baseline');
  });

  it('a women’s team reads the women’s Tour baseline on the hero and the leg card', () => {
    showPlayer(player({ tour: 'lpga' }));
    expect(document.querySelector('.ch-pf-hero__figs')!.textContent).toContain("Per round vs the women's Tour baseline");
    expect(document.querySelector('.ch-zn__def')!.textContent).toContain("Zero is the women's Tour baseline");
    expect(document.querySelector('.ch-lb__axis')!.textContent).toContain("Zero is the women's Tour baseline");
    // Row 110: the gauge's legend, its title and the round-by-round note name the women's Tour too, never a bare Tour.
    expect(document.querySelector('.ch-zlegend')!.textContent).toContain("Women's Tour 0.0");
    expect(document.querySelector('.ch-zns')!.textContent).toMatch(/Against the team and the women's Tour|Against the women's Tour/);
    expect(document.querySelector('.ch-zns')!.textContent).toContain("per 18 holes. Zero is the women's Tour baseline;");
  });

  it('the par tiles name the bench they are against: the women’s Tour for a women’s team (row 110)', () => {
    render(<ParTiles rows={[{ par: 3, avg: 3.2, bench: 3.05 }]} mark={sgBaseline('lpga').mark} />);
    expect(document.querySelector('.ch-par3__d')!.textContent).toBe("Women's Tour 3.05");
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

  it('Home: the season’s strokes gained is vs Tour, and the legs’ header says the strokes gained are the season’s', () => {
    wrap(<PlayerHome data={PREVIEW_PLAYER_HOME} now={PREVIEW_HOME_NOW} />);
    const sg = [...document.querySelectorAll('.ch-ph-figs > div')].find((d) => d.querySelector('dt')!.textContent === 'Strokes gained')!;
    expect(sg.textContent).toContain('Season, per round vs Tour');
    const legs = document.getElementById('ch-ph-legs')!.closest('section')!;
    expect(legs.querySelector('.ch-ph-game__h span')!.textContent).toBe('Last 10 rounds · strokes gained this season vs Tour');
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
    expect(sgTint(-2.6, 3)).toBe('color-mix(in srgb, var(--ch-chart-loss) 32%, transparent)');
    expect(sgTint(2.6, 3)).toBe('color-mix(in srgb, var(--ch-chart-gain) 32%, transparent)');
    expect(sgTint(null, 3)).toBe('var(--ch-ivory-100)');
  });

  it('the team grid uses that scale in the page: a −2.6 cell is a bar from the zero line out to 6.7% of its track on a scale of 3, not at the end a fixed 1.2 gave', () => {
    // The ledger draws the value as a bar from the zero line on one shared scale, not a tint; the worst loss keeps a wash.
    showTeam(team({ grid: [{ ...PREVIEW_TEAM_STATS.grid[0]!, legs: [-2.6, 0.3, 0.1, 0.2] }] }));
    const cell = document.querySelector('.ch-lg__r:not(.ch-lg__r--h) .ch-lg__cell') as HTMLElement;
    const loss = cell.querySelector('.ch-lg__bar') as HTMLElement;
    expect(loss.className).toContain('is-loss');
    expect(loss.style.left).toBe('6.7%');
    expect(loss.style.width).toBe('43.3%');
    expect(cell.className).toContain('is-worst');
    // A gain starts at the zero line (50%) and grows right: 0.3 of 3 is 5%.
    const gain = document.querySelectorAll('.ch-lg__r:not(.ch-lg__r--h) .ch-lg__cell')[1]!.querySelector('.ch-lg__bar') as HTMLElement;
    expect(gain.className).toContain('is-gain');
    expect(gain.style.left).toBe('50%');
    expect(gain.style.width).toBe('5%');
    // The key names the bars, the tick and the scale (a full bar is the half-track scale, here 3).
    const key = document.querySelector('.ch-lg__key')!.textContent ?? '';
    expect(key).toContain('Loses strokes');
    expect(key).toContain('Gains strokes');
    expect(key).toContain('Team median');
    expect(key).toContain('±3');
  });

  it('a team grid figure opens that player\'s Game detail for its leg, and the row still opens the profile (Q12)', () => {
    showTeam(team({ grid: [{ ...PREVIEW_TEAM_STATS.grid[0]!, id: 'p1', name: 'Cole Bennett', legs: [1.9, -1.6, null, -4.9] }] }));
    const cells = [...document.querySelectorAll('.ch-lg__r:not(.ch-lg__r--h) .ch-lg__cell')];
    const hrefs = cells.map((c) => c.querySelector('a.ch-lg__cl')?.getAttribute('href') ?? null);
    expect(hrefs[0]).toContain('player=p1');
    expect(hrefs[0]).toContain('tab=game');
    expect(hrefs[0]!.endsWith('#gm-tee')).toBe(true);
    expect(hrefs[1]!.endsWith('#gm-approach')).toBe(true);
    expect(hrefs[2]).toBeNull();
    expect(hrefs[3]!.endsWith('#gm-putting')).toBe(true);
    expect(cells[1]!.querySelector('a.ch-lg__cl')!.getAttribute('aria-label')).toBe('Cole Bennett, approach −1.6: open game detail');
    expect(document.querySelectorAll('a.ch-lg__a')).toHaveLength(1);
  });

  it('a coach on a player\'s stats can open that player\'s CoachHelm reads', () => {
    showPlayer(player({ viewer: 'coach', id: 'p9' }));
    const link = screen.getByRole('link', { name: /CoachHelm/ });
    expect(link.getAttribute('href')).toContain('coachhelm?player=p9');
  });

  it('desktop player: a new window glides the same leg bars to their new lengths (row 5, B9); the figure beside them changes at once', async () => {
    const win = (approach: number) => ({ ...PREVIEW_PLAYER.win, sgLegs: { tee: 0.3, approach, around: 0.1, putting: -1.9 } });
    const view = showPlayer(player({ win: win(-2.6) }));
    const bar = () => document.querySelectorAll<HTMLElement>('.ch-lb__bar')[1]!;
    const before = bar();
    const was = parseFloat(before.style.width);
    view.rerender(shell(<StatsPlayer data={player({ win: win(-1.0) })} coachId="c1" />));
    // The page kept the chart (no remount on a window change), so the bar starts where it was; it ends on the new scale (2).
    expect(bar()).toBe(before);
    expect(parseFloat(bar().style.width)).toBeCloseTo(was, 5);
    expect(document.querySelectorAll('.ch-lb__v')[1]!.textContent).toBe('−1.0');
    await waitFor(() => expect(parseFloat(bar().style.width)).toBeCloseTo((1.0 / 2) * 50, 1), { timeout: 2000 });
  });

  it('desktop player: the leg bars draw a −2.6 leg at 2.6 of 3 on one scale from the zero line, not clamped at 1.4', () => {
    const win = { ...PREVIEW_PLAYER.win, sgLegs: { tee: 0.3, approach: -2.6, around: 0.1, putting: -1.9 } };
    showPlayer(player({ win }));
    const bars = [...document.querySelectorAll('.ch-lb__bar')] as HTMLElement[];
    expect(bars).toHaveLength(4);
    // Half the rail is the scale (3, the widest value rounded up): approach 2.6/3, putting 1.9/3, tee 0.3/3.
    const w = (el: HTMLElement) => parseFloat(el.style.width);
    expect(w(bars[1]!)).toBeCloseTo((2.6 / 3) * 50, 1);
    expect(w(bars[3]!)).toBeCloseTo((1.9 / 3) * 50, 1);
    expect(w(bars[0]!)).toBeCloseTo((0.3 / 3) * 50, 1);
    // A loss grows left of the zero line, a gain right of it.
    expect(bars[1]!.className).toContain('is-loss');
    expect(bars[1]!.style.right).toBe('50%');
    expect(bars[0]!.className).toContain('is-gain');
    expect(bars[0]!.style.left).toBe('50%');
    // Each leg says which shots it counts.
    expect([...document.querySelectorAll('.ch-lb__who span')].map((e) => e.textContent).every((t) => (t ?? '').length > 10)).toBe(true);
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
  it('the SG headline: a signed figure set large, gain green or loss amber, its change, and what it is measured against', () => {
    showTeam(team());
    const hero = document.querySelector('.ch-sgt__hero') as HTMLElement;
    expect(hero.querySelector('.ch-sgt__k')!.textContent).toBe('Team strokes gained per round');
    expect(hero.querySelector('.ch-sgt__n')!.textContent).toBe('−0.5');
    expect(hero.querySelector('.ch-sgt__n')!.className).toContain('ch-loss');
    // +0.4 against a standard error of 0.7 is no clear change (stats visuals Q4): the number stays, in neutral ink, and says so.
    expect(hero.querySelector('.ch-sgt__chg')!.textContent).toBe('+0.4No clear change vs previous 10');
    expect(hero.querySelector('.ch-sgt__chg')!.className).toContain('is-flat');
    expect(hero.querySelector('.ch-sgt__vs')!.textContent).toContain('dashed line is the Tour baseline');
    // The trend comes first and the other five figures follow as one tape: no card, one cell each.
    expect(document.querySelector('.ch-fg')).toBeNull();
    expect(document.querySelectorAll('.ch-tp > .ch-tp__c')).toHaveLength(5);
  });

  it('every tape figure carries its own weekly line from its series, and its tone follows how it moved', () => {
    showTeam(team());
    const cell = (label: string) => [...document.querySelectorAll('.ch-tp__c')].find((c) => c.querySelector('.ch-tp__l')!.textContent === label) as HTMLElement;
    // The preview has both: scoring and greens clear their standard errors, putts, scrambling and birdies do not.
    expect(PREVIEW_TEAM_STATS.figures.filter((x) => x.key !== 'sg').map((f) => deltaTone(f.delta, f.se, f.lowerIsBetter))).toEqual(['is-gain', 'is-gain', '', '', '']);
    for (const f of PREVIEW_TEAM_STATS.figures.filter((x) => x.key !== 'sg')) {
      const c = cell(f.label);
      expect(c.querySelector('.ch-tp__line'), f.label).not.toBeNull();
      // Green or amber only when the change clears its standard error, by the figure's own direction (lower scores and fewer
      // putts improved when they fell); otherwise neutral (stats visuals Q4).
      const t = deltaTone(f.delta, f.se, f.lowerIsBetter);
      expect(c.querySelector('.ch-tp__svg')!.getAttribute('class'), f.label).toContain(t === 'is-gain' || t === 'is-loss' ? t : 'is-flat');
      expect(c.querySelector('.ch-tp__svg')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('a figure with no value says so in the headline and draws no line there', () => {
    const [sg, ...rest] = PREVIEW_TEAM_STATS.figures;
    showTeam(team({ figures: [{ ...sg!, value: null, delta: null, context: 'Needs rounds with shots', state: 'empty' }, ...rest] }));
    expect(document.querySelector('.ch-sgt__hero')!.textContent).toContain('Needs rounds with shots');
  });

  it('CH-4311 no rounds with shots: a dash and what it needs, never a zero', () => {
    const [sg, ...rest] = PREVIEW_TEAM_STATS.figures;
    showTeam(team({ figures: [{ ...sg!, value: null, delta: null, context: 'Needs rounds with shots', note: 'vs Tour', state: 'empty' }, ...rest] }));
    expect(code('CH-4311')!.querySelector('.ch-sgt__n')!.textContent).toBe('—');
    expect(code('CH-4311')!.textContent).toContain('Needs rounds with shots');
  });

  it('CH-4312 no earlier rounds to compare: the headline says so instead of a change', () => {
    const [sg, ...rest] = PREVIEW_TEAM_STATS.figures;
    showTeam(team({ figures: [{ ...sg!, delta: null, context: 'No earlier rounds', state: 'no-comparison' }, ...rest] }));
    expect(code('CH-4312')!.textContent).toContain('No earlier rounds');
    expect(code('CH-4312')!.querySelector('svg')).toBeNull();
  });

  it('the leg cards say their one shared scale once, the same ends their lines are drawn on (row 102)', () => {
    showTeam(team());
    const words = legScaleWords(legScale(PREVIEW_TEAM_STATS.legWeeks));
    const note = [...document.querySelectorAll('.ch-sv-note')].find((n) => /One scale for the four legs/.test(n.textContent ?? ''));
    expect(note?.textContent).toBe(words);
    expect(document.querySelector('.ch-sgm-row')!.getAttribute('aria-label')).toContain(words);
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
    const ends = () => [...document.querySelectorAll('.ch-sgt__end')].filter((e) => !e.closest('.ch-swap__body[aria-hidden]')).map((e) => `${e.children[1]!.textContent}${e.querySelector('b')!.textContent}`);
    expect(ends()).toEqual(['A+0.5', 'B−0.2']);
    // Scoring: B's mean 72.6 is lower (better) than A's 73.4, though B's last week (75) is worse than A's (71).
    await user.click(screen.getByRole('radio', { name: 'Scoring' }));
    expect(ends()).toEqual(['B73', 'A73']);
  });

  it('the team’s figure at the head of the list is the window mean too', () => {
    showTeam(team());
    expect(document.querySelector('.ch-sgt__team b')!.textContent).toBe('−0.5');
  });

  it('A1: a change is the newer half of the weeks against the older half, said only past its standard error, never first vs last', async () => {
    const user = userEvent.setup();
    showTeam(team());
    const note = () => document.querySelector('.ch-sgt > .ch-note')!.textContent!;
    // The fixture's first and last weeks differ by 1.0 (−1.0 to 0.0), but its halves sit inside their standard error.
    expect(note()).toBe('No clear change in the team’s strokes gained across this window.');
    expect(note()).not.toMatch(/since|has gained|has lost/);
    // A player: Jonah went 0.8 to −0.9 from first week to last, which is noise across his halves.
    await user.click(screen.getByRole('button', { name: /Jonah/ }));
    expect(note()).toBe('No clear change in Jonah’s strokes gained across this window.');
    // The four leg cards say the same kind of thing and never "across the window" from two end points.
    for (const n of document.querySelectorAll('.ch-sgm__n')) expect(n.textContent).not.toMatch(/across the window|since/);
  });

  it('A1: a change past its standard error is worded as one, from the halves', () => {
    // The halves come from the loader (wp1-honest, `roundHalves`), so the override carries them with the weeks.
    showTeam(team({ team: { ...PREVIEW_TEAM_STATS.team, sg: [-3, -3, -3, 0, 3, 3, 3], sgHalves: { delta: 6, se: 0.5 } } }));
    expect(document.querySelector('.ch-sgt > .ch-note')!.textContent).toBe('The team’s strokes gained are up 6.0 a round, newer half vs older half.');
  });

  it('a flat line is no clear change, not a change', () => {
    showTeam(team({ team: { ...PREVIEW_TEAM_STATS.team, sg: [0.1, 0.1, 0.0, 0.1, 0.1, 0.0, 0.1] } }));
    expect(document.querySelector('.ch-sgt > .ch-note')!.textContent).toBe('No clear change in the team’s strokes gained across this window.');
  });

  it('A1: the grid paints a player\'s change, with an arrow, only past its standard error', () => {
    const grid = PREVIEW_TEAM_STATS.grid.map((g, i) => (i === 0 ? { ...g, change: 0.3, changeSe: 0.5 } : i === 1 ? { ...g, change: 1.2, changeSe: 0.4 } : g));
    showTeam(team({ grid }));
    const cellOf = (name: string) =>
      [...document.querySelectorAll('.ch-lg__ch')].find((c) => c.closest('[role="row"]')?.textContent?.includes(name.split(' ')[0]!)) as HTMLElement;
    const quiet = cellOf(PREVIEW_TEAM_STATS.grid[0]!.name);
    expect(quiet.className).not.toMatch(/ch-gain|ch-loss/);
    expect(quiet.querySelector('svg')).toBeNull();
    expect(quiet.getAttribute('title')).toBe('No clear change');
    const clear = cellOf(PREVIEW_TEAM_STATS.grid[1]!.name);
    expect(clear.className).toContain('ch-gain');
    expect(clear.querySelector('svg')).not.toBeNull();
  });

  it('the trend says what the dashed line is: the Tour baseline, or the women’s; the list is the window average', () => {
    showTeam(team());
    expect(document.querySelector('.ch-sgt__vs')!.textContent).toBe('Per round, weekly average · dashed line is the Tour baseline · names show the window average');
    document.body.innerHTML = '';
    showTeam(team({ tour: 'lpga' }));
    expect(document.querySelector('.ch-sgt__vs')!.textContent).toContain("dashed line is the women's Tour baseline");
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

  it('a player with fewer than three strokes gained rounds has no mean to sort by (an early read, as in the grid), and the team headline waits too (A4)', async () => {
    tables.current = teamTables('men', three.slice(0, 2));
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(data.players[0]!.sgMean).toBeNull();
    expect(data.figures[0]).toMatchObject({ value: null, state: 'empty', context: 'Needs 3 rounds with shots from one player' });
    expect(data.legTotals).toEqual([null, null, null, null]);
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
    expect(last10.figures[0]).toMatchObject({ delta: 1.5, context: 'vs previous 10' });
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
    // The change carries its standard error (none given: null, so it is never painted; stats visuals Q4).
    expect(sgChange(1, 0.4, 'last10', 12)).toEqual({ delta: 0.6, context: 'vs previous 10', se: null });
    expect(sgChange(1, 0.4, 'last10', 12, 1.2)).toEqual({ delta: 0.6, context: 'vs previous 10', se: 1.2 });
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
    expect(rows.every((r) => r.sg === true && r.bench === null && r.lowerIsBetter === false)).toBe(true);
    expect(rows[0]).toMatchObject({ you: 3, team: 1.5 });
    // Off the tee: p1 mean 1.5; the pool of eight, (7.5 − 1.5) / 8 = 0.75.
    expect(rows[1]).toMatchObject({ you: 1.5, team: 0.75 });
    // Around the green has no value on any round: a dash for both, never zero.
    expect(rows[3]).toMatchObject({ you: null, team: null });
    // After the five strokes gained rows come the standing rows, in groups; every row says which group it is in.
    expect(data.comparisons.slice(5).map((r) => r.label)).toEqual(expect.arrayContaining(['Scoring avg', 'Fairways hit', 'Greens in regulation', 'Putts per round', 'Scrambling']));
    expect(data.comparisons.every((r) => !!r.group)).toBe(true);
    expect(rows.every((r) => r.group === 'Strokes gained')).toBe(true);
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
    const change = (await load('coach'))!.sgChange;
    expect(change).toMatchObject({ delta: 1.5, context: 'vs previous 10' });
    // Its standard error, from both windows' rounds: identical values measure no spread, so each falls back on the pooled 3.8.
    expect(change.se).toBeCloseTo(Math.sqrt(3.8 ** 2 / 10 + 3.8 ** 2 / 5), 6);
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
  it('the hero’s SG figure carries its change chip against the previous 10, amber only when the fall clears its standard error', () => {
    // −1.3 against a standard error of 1.7: no clear change (stats visuals Q4), the number kept in neutral ink.
    showPlayer(player());
    let hero = [...document.querySelectorAll('.ch-pf-hero__figs > div')].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    let chip = hero.querySelector('.ch-delta')!;
    expect(chip.textContent).toBe('−1.3');
    expect(chip.className).toContain('is-flat');
    expect(hero.querySelector('.ch-sgchg')!.lastElementChild!.textContent).toBe('No clear change vs previous 10');
    // Against 0.9 the same fall is clear: amber, and it says so.
    cleanup();
    showPlayer(player({ sgChange: { ...PREVIEW_PLAYER.sgChange, se: 0.9 } }));
    hero = [...document.querySelectorAll('.ch-pf-hero__figs > div')].find((d) => d.querySelector('dt')!.textContent === 'SG / round')!;
    chip = hero.querySelector('.ch-delta')!;
    expect(chip.className).toContain('is-loss');
    expect(hero.querySelector('.ch-sgchg')!.lastElementChild!.textContent).toBe('Worse than previous 10');
  });

  it('CH-5310 no earlier rounds: the hero says so instead of a chip', () => {
    showPlayer(player({ sgChange: { delta: null, context: 'No earlier rounds' } }));
    expect(code('CH-5310')!.textContent).toBe('No earlier rounds');
    expect(document.querySelector('.ch-pf-hero__figs .ch-delta')).toBeNull();
  });

  it('no strokes gained means no change chip under the dash, whatever the previous window says', () => {
    showPlayer(player({ win: { ...PREVIEW_PLAYER.win, sgPerRound: null, sgRounds: 0 } }));
    expect(document.querySelector('.ch-pf-hero__figs .ch-delta')).toBeNull();
    expect(document.querySelector('.ch-pf-hero__figs')!.textContent).not.toMatch(/previous/);
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

  it('the first zone leads with strokes gained: signed, green for a gain and amber for a loss, the team’s mark beside each leg for a coach', () => {
    showPlayer(player());
    const rows = [...document.querySelectorAll('.ch-lb__r')];
    expect(rows.map((r) => r.querySelector('b')!.textContent)).toEqual(['Off the tee', 'Approach', 'Around green', 'Putting']);
    const read = document.querySelector('.ch-zn .ch-znbig')!;
    expect(read.textContent).toBe('−0.9');
    expect(read.className).toContain('is-loss');
    expect(document.querySelector('.ch-zn__read')!.textContent).toContain('Team −0.5');
    // Putting +0.2 is a gain even though the team is at −0.3, and a loss stays a loss when it beats the team.
    expect(rows[3]!.querySelector('.ch-lb__bar')!.className).toContain('is-gain');
    expect(rows[1]!.querySelector('.ch-lb__bar')!.className).toContain('is-loss');
    expect(document.querySelectorAll('.ch-lb__team')).toHaveLength(4);
  });

  it('a player’s own zone has strokes gained with no team mark, against the Tour', () => {
    showPlayer(
      player({
        viewer: 'player',
        comparisons: PREVIEW_PLAYER.comparisons.map((c) => ({ ...c, team: null })),
      }),
    );
    expect(document.querySelector('.ch-lb__team')).toBeNull();
    expect(document.querySelector('.ch-zn .ch-znbig')!.textContent).toBe('−0.9');
    expect(document.querySelector('.ch-zlegend')!.textContent).toContain('Tour 0.0');
    expect(document.querySelector('.ch-zlegend')!.textContent).not.toContain('Team');
  });
});

describe('the early-read banner keys on rounds with shots', () => {
  const win = (rounds: number, sgRounds: number) => ({ ...PREVIEW_PLAYER.win, rounds, sgRounds, effRounds: rounds, effSgRounds: sgRounds, sgPerRound: sgRounds >= 3 ? -0.9 : null });

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
    expect(code('CH-5309')!.textContent).toContain('No strokes gained in this window');
    expect(panel().querySelector('.ch-stm-leg')).toBeNull();
  });

  it('the exact SG change sits below the figures in the same overview card, and each round carries its strokes gained', () => {
    const [first, second] = PREVIEW_PLAYER.rounds;
    showPlayerPhone(player({ rounds: [first!, { ...second!, sg: 0.6 }] }));
    const overview = document.querySelector('.ch-stm-overview')!;
    const figures = overview.querySelector('.ch-stm-figs')!;
    const footer = overview.querySelector('.ch-stm-overview__meta')!;
    expect(figures.parentElement).toBe(overview);
    expect(footer.parentElement).toBe(overview);
    // The figures, their gauge row, then the footer: the change still sits directly under the figures' drawing.
    expect(figures.nextElementSibling!.className).toBe('ch-stm-gauges');
    expect(figures.nextElementSibling!.nextElementSibling).toBe(footer);
    const change = footer.querySelector('.ch-sgchg')!;
    expect(change.querySelector('.ch-delta')!.textContent).toBe('−1.3');
    // P005-D6: away from the SG figure, the chip names what it measures.
    expect(change.lastElementChild!.textContent).toBe('SG a round · No clear change vs previous 10');
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
  it('draws the six bands the Tour grades, from the window’s putts with exact counts, out to 25 feet and beyond', async () => {
    const user = userEvent.setup();
    showPlayer(player());
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const chart = document.querySelector('.ch-gm-p .ch-sv-pb')!;
    const label = chart.getAttribute('aria-label')!;
    expect(label.split('; ')).toHaveLength(6);
    expect(label).toContain('15–25 feet 11%, 5 of 46');
    expect(label).toContain('25+ feet 3%, 1 of 34');
    expect(label).toContain('0–3 feet 89%, 57 of 64');
    expect(chart.textContent).toContain('1/34');
    expect(chart.textContent).toContain('25+ ft');
    // The Putting section's own total counts every putt; the chart counts the ones logged with a distance, and says so.
    const note = chart.closest('.ch-gm-p')!.querySelector('.ch-gm-p__n')!.textContent!;
    expect(note).toContain('Counts are putts logged with a distance.');
    // The Tour publishes five averages, one per band past 3 feet, and the note says so.
    expect(note).toContain('The Tour publishes five averages, one for each band past 3 feet.');
  });

  it('CH-5211 without the window’s putts the chart stops where the shot stats do, at 20 feet, and says the putts did not load', async () => {
    const user = userEvent.setup();
    showPlayer(player({ puttBands: null, extra: { ...PREVIEW_PLAYER.extra, puttBandsNine: null, puttsError: true } }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const chart = document.querySelector('.ch-gm-p .ch-sv-pb')!;
    expect(chart.getAttribute('aria-label')).toContain('15–20 feet');
    expect(chart.getAttribute('aria-label')).not.toContain('25');
    expect(code('CH-5211')!.textContent).toContain('Putts past 20 feet didn’t load');
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

/* ─── The Tour is the only benchmark (Q-88) ─── */

const BENCHMARK_WORDS = /\bD[123]\b|\bdivision\b|\bcollege\b|\bNCAA\b/i;
/** Everything a person or a screen reader is given: the text and the names on labels, titles and images. */
function everythingSaid() {
  const names = [...document.querySelectorAll('[aria-label],[title],[alt]')].map((e) => ['aria-label', 'title', 'alt'].map((a) => e.getAttribute(a) ?? '').join(' '));
  // Each text node on its own, so two spans that touch in the DOM ("par" and "D1 3.00") are still two words.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n.nodeValue ?? '');
  return `${texts.join(' ')} ${names.join(' ')}`.replace(/\s+/g, ' ');
}

describe('the Tour is the only benchmark (Q-88)', () => {
  it('no Team stats screen says D1, a division or college', () => {
    showTeam(team());
    expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
    // The Tour's make rate is what the putting note grades against.
    expect(everythingSaid()).toMatch(/Tour make rate/);
  });

  it('no player profile tab says it, for a coach or a player, with benchmarks present', async () => {
    const user = userEvent.setup();
    showPlayer(player());
    for (const tab of [/Overview/, /Game detail/, /Rounds/, /Development/]) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
    }
    document.body.innerHTML = '';
    showPlayer(player({ viewer: 'player', comparisons: PREVIEW_PLAYER.comparisons.map((c) => ({ ...c, team: null })) }));
    expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
    // The player's own zones read against the Tour, with its mark where there is one.
    expect(document.querySelector('.ch-zns')!.textContent).toContain('Tour');
  });

  it('Game detail names the Tour wherever it marks a benchmark (figures, notes, ticks)', async () => {
    const user = userEvent.setup();
    showPlayer(player());
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const said = everythingSaid();
    expect(said).toMatch(/Tour 66%/);
    expect(said).toMatch(/Tour average for that range/);
    // The par tiles carry the Tour's scoring average for the par.
    expect(said).toContain('Tour 3.00');
    expect(said).not.toMatch(BENCHMARK_WORDS);
  });

  describe('on the phone', () => {
    phoneWidth();
    it('no profile section chip says it', async () => {
      const user = userEvent.setup();
      showPlayerPhone(player());
      for (const chip of ['Scoring', 'Off the tee', 'Approach', 'Short game', 'Putting']) {
        await user.click(screen.getByRole('button', { name: chip }));
        expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
      }
    });
    it('nor does Team stats', () => {
      showTeam(team());
      expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
    });
  });

  it('the putting note grades against the Tour in every case', () => {
    const band = (label: string, made: number, attempts: number, bench: number | null) => ({ label, made, attempts, bench });
    expect(puttingNote([band('3–5 ft', 5, 5, 90)])).toBe('Bands grade against the Tour once they have 10 or more putts.');
    expect(puttingNote([band('3–5 ft', 18, 20, 90), band('5–10 ft', 14, 20, 50)])).toBe('Every graded band is at or above the Tour make rate.');
    expect(puttingNote([band('3–5 ft', 10, 20, 90), band('5–10 ft', 14, 20, 50)])).toBe('3 to 5\u00a0feet is the only band below the Tour make rate.');
    expect(puttingNote([band('3–5 ft', 10, 20, 90), band('5–10 ft', 4, 20, 50)])).toBe('2 bands are below the Tour make rate: 3–5\u00a0ft, 5–10\u00a0ft.');
  });

  it('Home says Tour on the benchmark mark of a part of the game', () => {
    wrap(<PlayerHome data={PREVIEW_PLAYER_HOME} now={PREVIEW_HOME_NOW} />);
    expect(document.querySelector('.ch-ph-bench__k')!.textContent).toContain('Tour 66');
    expect(everythingSaid()).not.toMatch(BENCHMARK_WORDS);
  });

  it('a women’s team’s Home names the women’s Tour on that mark (row 110)', () => {
    wrap(<PlayerHome data={{ ...PREVIEW_PLAYER_HOME, tour: 'lpga' }} now={PREVIEW_HOME_NOW} />);
    expect(document.querySelector('.ch-ph-bench__k')!.textContent).toContain("Women's Tour 66");
  });

  describe('the benchmark read', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());
    const standards = (f: Array<[string, unknown[]]>) => {
      const tour = f.find(([k, a]) => k === 'eq' && a[0] === 'tour')?.[1][1];
      // numeric columns come back as strings; the men's Tour has a sand value the women's row has not.
      const rows: Record<string, unknown[]> = {
        pga: [{ metric_id: 'gir_pct', pga_tour_value: '66' }, { metric_id: 'scrambling_pct_sand', pga_tour_value: '50' }],
        lpga: [{ metric_id: 'gir_pct', pga_tour_value: '70' }, { metric_id: 'scrambling_pct_rough', pga_tour_value: null }],
      };
      // The fake ignores a select's columns, so it returns only the ones the loader asked for.
      const cols = String(f.find(([k]) => k === 'select')?.[1][0] ?? '');
      return { data: (rows[String(tour)] ?? []).map((r) => Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k]) => cols.includes(k)))) };
    };
    const tablesFor = (gender: string): import('./supabase-fake').ChFakeTables => ({
      golf_teams: { data: { name: 'Varsity', gender } },
      golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }] },
      // Two rounds with greens: the rate clears its floor (A7), so the context is the Tour's.
      golf_rounds: { data: [rnd('r1', 'p1', 1, 1, [0.5, 0.5, null, null]), rnd('r2', 'p1', 2, 1, [0.5, 0.5, null, null])] },
      golf_round_stats_cache: { data: ['r1', 'r2'].map((round_id) => ({ round_id, greens_hit: 12, greens_total: 18 })) },
      golf_pga_standards: standards,
      golf_shots: { data: [] },
    });

    it('is the Tour value (pga_tour_value) of the team’s own tour: a women’s team reads the LPGA rows and never falls back to the men’s', async () => {
      tables.current = tablesFor('men');
      const men = await loadTeamStats({ teamId: 't1', window: 'season' });
      expect(men.figures.find((f) => f.label === 'Greens in regulation')!.context).toBe('Tour averages 66%');
      tables.current = tablesFor('women');
      const women = await loadTeamStats({ teamId: 't1', window: 'season' });
      expect(women.figures.find((f) => f.label === 'Greens in regulation')!.context).toBe('Tour averages 70%');
    });

    it('the profile carries the Tour’s values for the team’s tour only: none for a metric the women’s tour has no value for', async () => {
      const base = (gender: string): import('./supabase-fake').ChFakeTables => ({
        golf_teams: { data: { gender } },
        golf_players: { data: { id: 'p1', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2029, hometown: null, state: null, handicap: null, handicap_index: 3.9 } },
        golf_team_members: (f) => (f.some(([k, a]) => k === 'select' && a[0] === 'status') ? { data: { status: 'active' } } : { data: [{ player_id: 'p1' }] }),
        golf_rounds: { data: [rnd('a1', 'p1', 1, 1)] },
        golf_round_stats_cache: { data: [] },
        golf_pga_standards: standards,
        golf_shots: { data: [] },
        golf_player_focus_areas: { data: [] },
        golf_goals: { data: [] },
      });
      tables.current = base('men');
      expect((await loadPlayerProfile({ viewer: 'player', teamId: 't1', playerId: 'p1', window: 'season' }))!.bench).toEqual({ gir_pct: 66, scrambling_pct_sand: 50 });
      tables.current = base('women');
      expect((await loadPlayerProfile({ viewer: 'player', teamId: 't1', playerId: 'p1', window: 'season' }))!.bench).toEqual({ gir_pct: 70 });
    });
  });
});
