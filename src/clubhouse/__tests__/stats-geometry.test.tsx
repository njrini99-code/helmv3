import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'framer-motion';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Rule 5 (docs/clubhouse/PAGE_PERFORMANCE.md): a window change does not move what is on screen, and a skeleton is the page's geometry.
 * The pixel heights themselves are measured in a browser (`npm run clubhouse:perf`, "geometry" and the switches' layout shift); these pin the
 * structure that holds them: the reserved lines exist in every window, and the skeletons draw them.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { StatsTeam } from '../screens/stats/StatsTeam';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { StatsProfileSkeleton, StatsSkeleton } from '../screens/stats/StatsSkeleton';
import { StatsPlayerPhoneSkeleton, StatsTeamPhoneSkeleton } from '../screens/stats/StatsPhoneSkeleton';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_PLAYER, PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';
import { filterFor } from '../data/stats-filter';
import type { ChTeamStats } from '../data/stats-team';
import type { ChPlayerProfile } from '../data/stats-player';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
const shell = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const team = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...over });

describe('Team stats hold their geometry across windows', () => {
  it('the figure cards are the held kind on Team stats only (a profile\'s five cards are the same height in every window already)', () => {
    const { container, unmount } = render(shell(<StatsTeam data={team()} />));
    expect(container.querySelector('.ch-fg')!.classList.contains('ch-fg--hold')).toBe(true);
    unmount();
    const profile = render(shell(<StatsPlayer data={player()} coachId="c1" />));
    for (const g of profile.container.querySelectorAll('.ch-fg')) expect(g.classList.contains('ch-fg--hold')).toBe(false);
  });

  it('the hole-coverage line is in every window: the note when there is one, an empty line when there is none', () => {
    const noted = render(shell(<StatsTeam data={team({ figures: PREVIEW_TEAM_STATS.figures.map((f) => ({ ...f, note: 'Hole stats from 8 of 10 rounds' })) })} />));
    const lines = noted.container.querySelectorAll('.ch-st-cover');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe('Hole stats from 8 of 10 rounds');
    noted.unmount();
    const none = render(shell(<StatsTeam data={team({ figures: PREVIEW_TEAM_STATS.figures.map((f) => ({ ...f, note: undefined })) })} />));
    const empty = none.container.querySelectorAll('.ch-st-cover');
    expect(empty).toHaveLength(1);
    expect(empty[0]!.textContent).toBe('');
    expect(empty[0]!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the trend plot is as tall as the team (its players set --ch-ends), with rounds or without, so a window with fewer players keeps the card', () => {
    const full = render(shell(<StatsTeam data={team()} />));
    const plot = full.container.querySelector('.ch-sgt__plot') as HTMLElement;
    expect(plot.style.getPropertyValue('--ch-ends')).toBe(String(PREVIEW_TEAM_STATS.players.length));
    full.unmount();
    // A window with no weeks at all: the empty state sits in a box of the same height.
    const none = render(shell(<StatsTeam data={team({ weeks: [], team: { sg: [], score: [], sgMean: null, scoreMean: null } })} />));
    expect(none.container.querySelector('.ch-sgt__plot')).toBeNull();
    const hold = none.container.querySelector('.ch-sgt__hold') as HTMLElement;
    expect(hold.style.getPropertyValue('--ch-ends')).toBe(String(PREVIEW_TEAM_STATS.players.length));
    expect(hold.textContent).toMatch(/No strokes gained in this window/);
  });

  it('the stylesheet holds them: the held cards, the plot, the caption line, and the skeleton card in each of its three layouts', () => {
    expect(css).toMatch(/\.ch-fg--hold \.ch-fg__d\s*{\s*min-height: calc\(22px \+ 8px \+ 1\.3 \* 12\.5px\)/);
    expect(css).toMatch(/\.ch-fg--hold \.ch-fg__n\s*{\s*min-height: calc\(2 \* 1\.3 \* 12\.5px\)/);
    expect(css).toMatch(/\.ch-sgt__plot\s*{[^}]*min-height: calc\(30px \+ var\(--ch-ends, 0\) \* 34px\)/);
    expect(css).toMatch(/\.ch-st-cover\s*{[^}]*min-height: 18px/);
    // 196 six across with one-line labels, 213 where they wrap (a canvas of 901 to 1116px), 155 two across.
    expect(css).toMatch(/\.ch-fg__c--skel\s*{\s*min-height: 196px/);
    expect(css).toMatch(/min-width: 901px\) and \(max-width: 1116px\) {\s*\.ch-fg__c--skel\s*{\s*min-height: 213px/);
    expect(css).toMatch(/\(max-width: 900px\) {\s*\.ch-fg__c--skel\s*{\s*min-height: 155px/);
  });
});

describe('A profile holds its hero across windows', () => {
  it('the strokes gained figure keeps its change line when the window has no change to show', () => {
    const noChange = player({ sgChange: { delta: null, context: '' } });
    const { container } = render(shell(<StatsPlayer data={noChange} coachId="c1" />));
    const figs = [...container.querySelectorAll('.ch-pf-hero__figs > div')];
    const sg = figs.find((f) => f.querySelector('dt')?.textContent === 'SG / round')!;
    const line = sg.querySelector('.ch-pf-hero__chg');
    expect(line).not.toBeNull();
    expect(line!.textContent).toBe('');
    expect(css).toMatch(/\.ch-pf-hero__figs \.ch-pf-hero__chg\s*{[^}]*min-height: 22px/);
  });
});

describe('Skeletons draw the loaded page\'s lines', () => {
  it('Team stats: the caption line under the cards, and a trend card with the head, a plot as tall as a team of eight and the note line', () => {
    const { container } = render(<StatsSkeleton />);
    expect(container.querySelector('.ch-fg + .ch-st-cover')).not.toBeNull();
    expect(container.querySelector('.ch-sgt .ch-sgt__head')).not.toBeNull();
    expect((container.querySelector('.ch-sgt__hold') as HTMLElement).style.getPropertyValue('--ch-ends')).toBe('8');
  });

  it('a profile: the strokes gained figure has its change line', () => {
    const { container } = render(<StatsProfileSkeleton />);
    expect(container.querySelectorAll('.ch-pf-hero__figs > div')).toHaveLength(4);
    expect(container.querySelectorAll('.ch-pf-hero__figs .ch-pf-hero__chg')).toHaveLength(1);
  });

  it('the phone skeletons keep the loaded order (a profile: head, the window and filter row, then the figures) and give each figure its second line', () => {
    const profile = render(<StatsPlayerPhoneSkeleton />);
    const order = [...profile.container.querySelector('main')!.children].map((c) => c.className.split(' ')[0]);
    expect(order.slice(0, 3)).toEqual(['ch-spm-head', 'ch-stm-controls', 'ch-stm-figs']);
    profile.unmount();
    const teamPhone = render(<StatsTeamPhoneSkeleton />);
    for (const fig of teamPhone.container.querySelectorAll('.ch-stm-figs > div')) expect(fig.querySelectorAll('dd')).toHaveLength(2);
  });

  it('Home: the head has its sentence and its two actions, as loaded', () => {
    const { container } = render(<HomeSkeleton />);
    const head = container.querySelector('.ch-h-head')!;
    expect(head.querySelector('.ch-h-head__actions')!.children).toHaveLength(2);
  });
});
