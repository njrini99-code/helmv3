/**
 * Native-feel phone navigation (docs/clubhouse/NATIVE_FEEL_PERF_AUDIT_2026-10-08.md): which way a navigation moves
 * (P1-1, P1-2), the push and pop keyframes, the tab prefetch (P0-2), the More sheet leaving before a drill-in (P0-3) and
 * the phone Roster's sorted column (P1-3).
 */
import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import { classifyNav } from '../lib/nav-motion';
import { chSpringCurve } from '../lib/motion';
import { prefetchAllowed } from '../shell/use-prefetch-tabs';
import { RosterPhoneRow } from '../screens/roster/RosterPhone';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';

const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const TABS = ['/golf/dashboard', '/golf/dashboard/coachhelm', '/golf/dashboard/calendar', '/golf/dashboard/stats'];

afterEach(() => vi.restoreAllMocks());

describe('which way a phone navigation moves', () => {
  it('a tab change crossfades, wherever it starts', () => {
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/calendar', tabRoots: TABS, tabBar: true })).toBe('fade');
    // From inside a drill-in, the tab bar's Home is a tab change, not a Back, though Home's path is above it.
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard', tabRoots: TABS, tabBar: true })).toBe('fade');
  });

  it('a drill-in pushes: a More row, a link into a detail, a sibling opened from More', () => {
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/roster', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/calendar', to: '/golf/dashboard/settings#set-help', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/messages', to: '/golf/dashboard/roster', tabRoots: TABS })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/qualifiers', to: '/golf/dashboard/qualifiers/abc', tabRoots: TABS })).toBe('push');
  });

  it('a link up to the page above pops; a link onto a tab root from a page crossfades', () => {
    expect(classifyNav({ from: '/golf/dashboard/qualifiers/abc', to: '/golf/dashboard/qualifiers', tabRoots: TABS })).toBe('pop');
    expect(classifyNav({ from: '/golf/dashboard/stats', to: '/golf/dashboard/calendar', tabRoots: TABS })).toBe('fade');
  });

  it('Back from a pushed page pops, Forward onto one pushes, and Back between tabs crossfades', () => {
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard', tabRoots: TABS, back: true })).toBe('pop');
    expect(classifyNav({ from: '/golf/dashboard', to: '/golf/dashboard/roster', tabRoots: TABS, back: true })).toBe('push');
    expect(classifyNav({ from: '/golf/dashboard/calendar', to: '/golf/dashboard', tabRoots: TABS, back: true })).toBe('fade');
  });

  it('the same page (a pushed screen inside it, a hash) never moves', () => {
    expect(classifyNav({ from: '/golf/dashboard/roster', to: '/golf/dashboard/roster/', tabRoots: TABS, back: true })).toBe('fade');
  });
});

describe('the push and the pop', () => {
  const shell = css('shell.css');
  const tokens = css('tokens.css');

  it('ride the smooth spring a pushed phone screen rides, sampled the same', () => {
    const curve = chSpringCurve('smooth');
    expect(tokens).toContain(`--ch-ease-vt-push: ${curve.linear};`);
    expect(tokens).toContain(`--ch-dur-vt-push: ${curve.ms}ms;`);
    expect(tokens).toContain('--ch-vt-parallax: -30%;');
  });

  it('push: the new page from the right edge over the old drawing back; pop: the reverse, the leaving page on top', () => {
    expect(shell).toMatch(/@keyframes ch-vt-push-in \{\s*from \{\s*transform: translateX\(100%\);/);
    expect(shell).toMatch(/@keyframes ch-vt-push-out \{\s*to \{\s*transform: translateX\(var\(--ch-vt-parallax\)\);/);
    expect(shell).toMatch(/@keyframes ch-vt-pop-in \{\s*from \{\s*transform: translateX\(var\(--ch-vt-parallax\)\);/);
    expect(shell).toMatch(/html\[data-ch-nav='pop'\]:has\(\[data-ui='clubhouse'\]\)::view-transition-old\(ch-page\) \{\s*z-index: 1;/);
  });

  it('only on a phone, with the iOS-animated Back and reduced motion still instant', () => {
    const start = shell.indexOf('@keyframes ch-vt-push-in');
    const block = shell.slice(start, shell.indexOf("@media (prefers-reduced-motion: reduce)", start));
    expect(block).toContain('@media (max-width: 820px)');
    expect(shell).toMatch(/html\[data-ch-ua-pop\]:has\(\[data-ui='clubhouse'\]\)::view-transition-old\(\*\)/);
  });
});

describe('the tab prefetch', () => {
  it('is skipped offline and with Data Saver', () => {
    expect(prefetchAllowed({ onLine: true } as Navigator)).toBe(true);
    expect(prefetchAllowed({ onLine: false } as Navigator)).toBe(false);
    expect(prefetchAllowed({ onLine: true, connection: { saveData: true } } as unknown as Navigator)).toBe(false);
    expect(prefetchAllowed(undefined)).toBe(false);
  });
});

describe('the phone Roster shows the figure it is sorted by (P1-3)', () => {
  const players = PREVIEW_ROSTER.players.filter((p) => p.sgPerRound != null);
  const gainer = players.find((p) => (p.sgPerRound ?? 0) > 0.05)!;
  const loser = players.find((p) => (p.sgPerRound ?? 0) < -0.05)!;
  const row = (p: typeof gainer, sort?: 'avg' | 'sg' | 'name') =>
    render(
      <LazyMotion features={domAnimation}>
        <RosterPhoneRow p={p} statsError={false} sort={sort} onOpen={() => {}} />
      </LazyMotion>,
    );

  it('SG: strokes gained a round in the trailing column, gains green and losses amber, and says so to VoiceOver', () => {
    const { container, unmount } = row(gainer, 'sg');
    const v = container.querySelector('.ch-rsm-row__v')!;
    expect(v.querySelector('b')!.textContent).toMatch(/^\+\d\.\d$/);
    expect(v.querySelector('b')!.className).toContain('is-gain');
    expect(v.textContent).toContain('SG / rd');
    expect(v.textContent).not.toContain('hcp');
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/strokes gained \+\d\.\d a round/);
    unmount();
    const lost = row(loser, 'sg');
    const b = lost.container.querySelector('.ch-rsm-row__v b')!;
    expect(b.textContent!.startsWith('−')).toBe(true);
    expect(b.className).toContain('is-loss');
    lost.unmount();
  });

  it('Avg (the default) and Name: the scoring average and handicap, as before', () => {
    for (const sort of [undefined, 'avg', 'name'] as const) {
      const { container, unmount } = row(gainer, sort);
      const v = container.querySelector('.ch-rsm-row__v')!;
      expect(v.querySelector('b')!.textContent).toBe(gainer.avg == null ? '—' : gainer.avg.toFixed(1));
      expect(v.textContent).toContain('hcp');
      unmount();
    }
  });

  it('losses are never red', () => {
    expect(css('roster.css')).toMatch(/\.ch-rsm-row__v b\.is-loss \{\s*color: var\(--ch-chart-loss\);/);
  });
});
