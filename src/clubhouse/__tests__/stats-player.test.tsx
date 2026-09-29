import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Stats (player): every numbered state in docs/clubhouse/catalog/stats-player.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const createFocusArea = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
vi.mock('../data/stats-team', () => ({ loadTeamStats: vi.fn() }));
vi.mock('../data/stats-player', () => ({ loadPlayerProfile: vi.fn() }));

import type { ChPlayerProfile } from '../data/stats-player';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { NotOnTeam, StatsNoTeam } from '../routes/stats';
import { ToastProvider } from '../ui/Toast';
import { CrumbProvider, useCrumbTrail } from '../shell/crumbs';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY } from '../preview/fixtures-stats';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function Trail() {
  return <p data-testid="trail">{useCrumbTrail()?.join(' › ') ?? 'nav'}</p>;
}
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Trail />
            {node}
          </div>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...over });
const show = (data: ChPlayerProfile, coachId: string | null = 'c1') => wrap(<StatsPlayer data={data} coachId={coachId} />);
const openTab = (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(screen.getByRole('tab', { name }));

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  createFocusArea.mockReset();
});

describe('Stats player · saves', () => {
  it('CH-5101 CH-5001 a focus area needs a name; a failed save keeps the text', async () => {
    const user = userEvent.setup();
    createFocusArea.mockResolvedValue({ success: false, error: 'nope' });
    show(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5101', /at least three characters/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(createFocusArea).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting');
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5001', /Couldn't add the focus area for/);
    expect((screen.getByRole('textbox', { name: 'What to work on' }) as HTMLInputElement).value).toBe('Lag putting');
  });

  it('CH-5401 adding shows its progress and cannot be pressed twice', async () => {
    const user = userEvent.setup();
    createFocusArea.mockImplementation(() => new Promise(() => {}));
    show(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting');
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5401', /Adding/);
    expect((code('CH-5401')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Stats player · reads that fail', () => {
  it('CH-5201 rounds do not load', async () => {
    const user = userEvent.setup();
    show(player({ roundsError: true }));
    await expectCode('CH-5201', /Rounds didn't load/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-5202 shot-level detail does not load: Game detail says so instead of zeros', async () => {
    const user = userEvent.setup();
    show(player({ statsError: true }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5202', /Shot-level detail didn't load/);
  });

  it('CH-5203 development items do not load', async () => {
    const user = userEvent.setup();
    show(player({ devError: true }));
    await openTab(user, /Development/);
    await expectCode('CH-5203', /Some development items didn't load/);
  });

  it('CH-5204 CH-5206 CH-5207 a crash stays inside its tab', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    show(player({ comparisons: null as never, focusAreas: null as never, rounds: [{ ...PREVIEW_PLAYER.rounds[0]!, course: {} as never }] }));
    await expectCode('CH-5204', /The overview couldn’t be shown/);
    expect(screen.getByRole('tablist')).toBeTruthy();
    await openTab(user, /Rounds/);
    await expectCode('CH-5206', /The rounds table couldn’t be shown/);
    await openTab(user, /Development/);
    await expectCode('CH-5207', /Development couldn’t be shown/);
    quiet.mockRestore();
  });

  it('CH-5205 game detail that crashes is contained', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    show(player({ stats: { ...PREVIEW_PLAYER.stats!, roundsPlayed: 3, approachByDistance: null } as never, d1: null as never }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5205', /Game detail couldn’t be shown/);
    quiet.mockRestore();
  });
});

describe('Stats player · empty', () => {
  it('CH-5301 no shot-by-shot rounds', async () => {
    const user = userEvent.setup();
    show(player({ stats: null }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5301', /No shot-by-shot rounds in this window/);
  });

  it('CH-5302 no rounds in the window', async () => {
    const user = userEvent.setup();
    show(player({ rounds: [] }));
    await openTab(user, /Rounds/);
    await expectCode('CH-5302', /No rounds in this window/);
  });

  it('CH-5303 CH-5304 no focus areas, no goals', async () => {
    const user = userEvent.setup();
    show(player({ focusAreas: [], goals: [] }));
    await openTab(user, /Development/);
    await expectCode('CH-5303', /No focus areas yet/);
    await expectCode('CH-5304', /No goals set/);
  });

  it('CH-5305 an early read says what will move', () => {
    show(PREVIEW_PLAYER_EARLY);
    expect(code('CH-5305')!.textContent).toMatch(/Early read\. .+ Strokes gained shows once there are three/);
  });

  it('CH-5306 CH-5307 a player not on the team, for a coach and for a player', () => {
    wrap(<NotOnTeam coach />);
    expect(code('CH-5306')!.textContent).toMatch(/That player isn’t on your team/);
    expect(screen.getByRole('link', { name: 'Back to team stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    wrap(<NotOnTeam coach={false} />);
    expect(code('CH-5307')!.textContent).toMatch(/Your stats aren’t available/);
  });

  it('CH-4309 no team yet', () => {
    wrap(<StatsNoTeam coach />);
    expect(code('CH-4309')!.textContent).toMatch(/You aren't on a team yet/);
  });
});

describe('Stats player · haptics and accessibility', () => {
  it('CH-5701 changing tabs ticks; the current tab does not', async () => {
    const user = userEvent.setup();
    show(player());
    await openTab(user, /Overview/);
    expect(hapticSpy).not.toHaveBeenCalled();
    await openTab(user, /Rounds/);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-5801 tabs are real tabs: selected state, controlled panel', async () => {
    const user = userEvent.setup();
    show(player());
    await openTab(user, /Rounds/);
    const tab = screen.getByRole('tab', { name: /Rounds/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('CH-5802 a coach reads "Stats › name" in the top bar; a player keeps the navigation trail', () => {
    show(player());
    expect(screen.getByTestId('trail').textContent).toBe(`Stats › ${PREVIEW_PLAYER.name}`);
  });

  it('CH-5803 the strokes gained route and hero figures read as text', () => {
    show(player());
    const route = screen.getAllByRole('img').find((i) => /Strokes gained per round by leg/.test(i.getAttribute('aria-label') ?? ''))!;
    expect(route.getAttribute('aria-label')).toMatch(/Off the tee .+, Approach .+, Around green .+, Putting .+/);
    const figs = document.querySelector('.ch-pf-hero__figs')!;
    for (const child of figs.children) for (const el of child.children) expect(['DT', 'DD']).toContain(el.tagName);
  });
});
