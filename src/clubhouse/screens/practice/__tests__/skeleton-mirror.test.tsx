import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PracticeLoading } from '../PracticeLoading';
import { PlayerPracticeHomeSkeleton, PlayerPracticePlanSkeleton, PracticeHomeSkeleton, PracticeLibrarySkeleton, PracticePlanSkeleton } from '../PracticeSkeletons';
import { PLAN_STARTERS } from '../starters';

const shell = vi.hoisted(() => ({ inClubhouse: true, role: 'coach' as 'coach' | 'player' | null }));
vi.mock('../../../shell/context', () => ({ useInClubhouse: () => shell.inClubhouse, useClubhouseRole: () => shell.role }));

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const classes = (els: Iterable<Element>) => [...els].map((el) => el.className);

afterEach(() => {
  cleanup();
  shell.inClubhouse = true;
  shell.role = 'coach';
});

/**
 * Practice's loading states are the loaded pages' shapes (owner follow-up 2, 11 Nov 2026): the page's own boxes, in the page's
 * order, with the shared bars inside, so nothing moves when the page lands. The geometry is measured in WebKit (the commit's
 * numbers); this pins the shape that the measurement stands on.
 */
describe('Practice in waiting mirrors the loaded pages', () => {
  const ROOTS: ReadonlyArray<[string, () => ReactElement, number]> = [
    ['Practice (coach)', () => <PracticeHomeSkeleton />, 1],
    ['Practice (player)', () => <PlayerPracticeHomeSkeleton />, 1],
    ['Drills', () => <PracticeLibrarySkeleton tab="drills" />, 1],
    ['Groups', () => <PracticeLibrarySkeleton tab="groups" />, 1],
    ['Templates', () => <PracticeLibrarySkeleton tab="templates" />, 1],
    ['A plan (player)', () => <PlayerPracticePlanSkeleton />, 1],
    // G14: a coach's plan page opens on its large title on a phone too (the bar cut the name); the bar's title waits under it.
    ['A plan (coach)', () => <PracticePlanSkeleton />, 1],
  ];

  it.each(ROOTS)('%s is one busy page with the large title block in waiting, never a real heading', (_name, skeleton, titles) => {
    const { container } = render(skeleton());
    const mains = container.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0]!.getAttribute('aria-busy')).toBe('true');
    expect(mains[0]!.getAttribute('aria-label')).toMatch(/^Loading /);
    const title = container.querySelectorAll('[data-ch-large-title]');
    expect(title.length).toBe(titles);
    for (const t of title) {
      expect(t.classList.contains('ch-large-title')).toBe(true);
      expect(t.getAttribute('aria-hidden')).toBe('true');
    }
    expect(container.querySelector('h1, h2, h3, a, button, input')).toBeNull();
    // Every bar is the shared one.
    expect(container.querySelectorAll('.ch-skel').length).toBeGreaterThan(8);
  });

  it('the coach’s tab: the head and its two keys, the tabs, the week, Up next beside the plans, and Plan format last on a phone', () => {
    const { container } = render(<PracticeHomeSkeleton />);
    const main = container.querySelector('main.ch-page.ch-prc')!;
    // The tabs sit under the head at both widths, where Drills, Groups and Templates draw them, so they never move between tabs.
    expect(classes(main.children)).toEqual(['ch-prc-h', 'ch-prc-tabs ch-prc-sk-desk', 'ch-prc-tabs ch-prc-sk-phone', '', 'ch-prc-home has-plans', 'ch-prc-open ch-prc-sk-phone ch-prc-sk-still']);
    // Plan format and New plan, on a Mac only: a phone has them in its bar and at the page's foot.
    expect(classes(main.querySelectorAll('.ch-prc-h > *'))).toEqual(['', 'ch-prc-h__a ch-prc-sk-desk']);
    expect(main.querySelectorAll('.ch-prc-h__a > .ch-skel').length).toBe(2);
    expect(main.querySelectorAll('.ch-prc-week > .ch-prc-tile').length).toBe(7);
    // Up next, then the plans: nothing rides between them at either width.
    expect(classes(main.querySelector('.ch-prc-home')!.children)).toEqual(['ch-prc-card ch-prc-next', 'ch-prc-home__plans']);
    // Up next in the card's own order: the label and state, the name, when, the day strip, its key, four blocks, "and N more", the key.
    expect(classes(main.querySelector('.ch-prc-next')!.children)).toEqual(['ch-prc-next__k', 'ch-prc-sk-next', 'ch-prc-next__w ch-prc-sk-facts', 'ch-prc-day', 'ch-prc-sk-mix', 'ch-prc-next__rows', 'ch-prc-next__more', 'ch-prc-next__a']);
    expect(main.querySelectorAll('.ch-prc-next__rows > li').length).toBe(4);
    expect(main.querySelectorAll('.ch-prc-home__plans .ch-prc-rows > li').length).toBe(2);
  });

  it('the player’s tab: their card, three stops and Open plan, then the week under its heading and their plans', () => {
    const { container } = render(<PlayerPracticeHomeSkeleton />);
    const main = container.querySelector('main.ch-page.ch-prc')!;
    expect(classes(main.children)).toEqual(['ch-prc-h', 'ch-cpv ch-cpv-ply ch-prc-today', 'ch-prc-sec', 'ch-prc-sec']);
    // No keys in a player's head, and no tabs.
    expect(main.querySelector('.ch-prc-h__a, .ch-prc-tabs')).toBeNull();
    expect(classes(main.querySelector('.ch-prc-today')!.children)).toEqual(['art', 'art', 'ch-skel']);
    expect(classes(main.querySelector('.ch-prc-today > .art')!.children)).toEqual(['art-h', 'focus', 'grpl']);
    expect(main.querySelectorAll('.ch-prc-today .stop').length).toBe(3);
    expect(main.querySelectorAll('.ch-prc-sec .ch-prc-week > .ch-prc-tile').length).toBe(7);
  });

  it('the library: the head, the tabs for the width, then the tab’s own shelf', () => {
    const drills = render(<PracticeLibrarySkeleton tab="drills" />).container;
    expect(classes(drills.querySelector('main')!.children)).toEqual(['ch-prc-h', 'ch-prc-tabs ch-prc-sk-desk', 'ch-prc-tabs ch-prc-sk-phone', 'ch-prc-find', 'ch-prc-sec', 'ch-prc-sec']);
    // The search, then the nine areas, each at the height the width draws it.
    expect(classes(drills.querySelector('.ch-prc-find')!.children)).toEqual(['ch-skel', 'ch-pills ch-prc-areas']);
    expect(drills.querySelectorAll('.ch-prc-areas > .ch-prc-sk-desk').length).toBe(9);
    expect(drills.querySelectorAll('.ch-prc-areas > .ch-prc-sk-phone').length).toBe(9);
    expect(drills.querySelectorAll('.ch-prc-list.is-drills').length).toBe(2);
    expect(drills.querySelectorAll('.ch-prc-h__a > .ch-skel').length).toBe(1);
    cleanup();

    const groups = render(<PracticeLibrarySkeleton tab="groups" />).container;
    expect(classes(groups.querySelector('main')!.children)).toEqual(['ch-prc-h', 'ch-prc-tabs ch-prc-sk-desk', 'ch-prc-tabs ch-prc-sk-phone', 'ch-prc-cards']);
    expect(groups.querySelectorAll('.ch-prc-cards .ch-prc-gcard').length).toBe(2);
    cleanup();

    const templates = render(<PracticeLibrarySkeleton tab="templates" />).container;
    expect(classes(templates.querySelector('main')!.children)).toEqual(['ch-prc-h', 'ch-prc-tabs ch-prc-sk-desk', 'ch-prc-tabs ch-prc-sk-phone', 'ch-prc-sec', 'ch-prc-sec']);
    // Templates has no key in its head.
    expect(templates.querySelector('.ch-prc-h__a')).toBeNull();
    // From GolfHelm is the app's own six, so each card has its starter's own number of blocks, three at most.
    const starters = [...templates.querySelectorAll('.ch-prc-sec:first-of-type .ch-prc-tmpl')];
    expect(starters.length).toBe(PLAN_STARTERS.length);
    expect(starters.map((card) => card.querySelectorAll('.ch-prc-glance > *').length)).toEqual(PLAN_STARTERS.map((s) => Math.min(3, s.body.variants.main.blocks.length)));
    // Your templates: the heading and its switch (one for each width), then a card.
    expect(templates.querySelectorAll('.ch-prc-sec__h > *').length).toBe(3);
    expect(templates.querySelectorAll('.ch-prc-sec:last-of-type .ch-prc-tmpl').length).toBe(1);
  });

  it('a plan’s page, the coach’s: back on a Mac only, the head (the phone’s large title, or the Mac’s), the status line, the phone’s keys under it, then the sheet in the sheet’s own boxes', () => {
    const { container } = render(<PracticePlanSkeleton />);
    const main = container.querySelector('main.ch-page.ch-prc-planpage')!;
    expect(classes(main.children)).toEqual(['ch-backlink ch-prc-sk-desk ch-prc-sk-still', 'ch-prc-h ch-prc-planhead ch-prc-sk-phone', 'ch-prc-h ch-prc-planhead ch-prc-sk-desk', 'ch-prc-planbar', 'ch-prc-planbar__a ch-prc-sk-phone', 'ch-cp-sheet ch-cp-skel']);
    expect(classes(main.querySelector('.ch-prc-planbar')!.children)).toEqual(['ch-prc-planbar__s', 'ch-prc-planbar__a ch-prc-sk-desk']);
    expect(classes(main.querySelector('.ch-cp-sheet')!.children)).toEqual(['pp-top', 'pp-title', 'pp-focus', 'pp-meta', '', '']);
    expect(main.querySelectorAll('.pp-meta > div').length).toBe(3);
    expect(main.querySelectorAll('.pp-groups > .ch-skel').length).toBe(3);
    expect(main.querySelectorAll('.sched > .drow').length).toBeGreaterThan(2);
  });

  it('a plan’s page, the player’s: Practice and its day, their card, the switch for the width, then their stops', () => {
    const { container } = render(<PlayerPracticePlanSkeleton />);
    const main = container.querySelector('main.ch-page.ch-cpv.ch-cpv-ply')!;
    expect(classes(main.children)).toEqual(['ch-large-title ch-large-title--skel ch-prc-sk-title', 'ch-large-title ch-prc-sk-desk', 'ctx', 'art', 'ch-prc-sk-desk', 'ch-prc-sk-phone', 'art']);
    expect(main.querySelectorAll('.art:last-of-type > .stop').length).toBeGreaterThan(3);
  });
});

describe('a Practice route in waiting picks the page that is coming', () => {
  it('the tab: the coach’s page, or the player’s', () => {
    expect(render(<PracticeLoading page="home" />).container.querySelector('.ch-prc-next')).not.toBeNull();
    cleanup();
    shell.role = 'player';
    const { container } = render(<PracticeLoading page="home" />);
    expect(container.querySelector('.ch-prc-today')).not.toBeNull();
    expect(container.querySelector('.ch-prc-next')).toBeNull();
  });

  it('a plan: the coach’s status line and sheet, or the player’s own practice', () => {
    expect(render(<PracticeLoading page="plan" />).container.querySelector('main.ch-prc-planpage .ch-prc-planbar')).not.toBeNull();
    cleanup();
    shell.role = 'player';
    expect(render(<PracticeLoading page="plan" />).container.querySelector('main.ch-cpv-ply')).not.toBeNull();
  });

  it.each(['drills', 'groups', 'templates'] as const)('the library’s %s', (tab) => {
    const { container } = render(<PracticeLoading page={tab} />);
    expect(container.querySelector('main')!.getAttribute('aria-label')).toBe(`Loading ${tab}`);
  });

  it('outside the Clubhouse shell the page is on its way to a redirect: the plain rows, and no Clubhouse page', () => {
    shell.inClubhouse = false;
    const { container } = render(<PracticeLoading page="home" />);
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelectorAll('.ch-skel-rows__r').length).toBe(8);
  });
});

describe('the sheets a Practice skeleton stands on', () => {
  const practice = read('src/clubhouse/styles/practice.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const PHONE = '@media (max-width: 820px), (max-height: 500px) and (pointer: coarse)';
  const DESK = '@media (min-width: 821px) and ((min-height: 501px) or (pointer: fine))';
  /** The rule's body, inside a block that starts with this media query. */
  const inMedia = (media: string, selector: string) => {
    for (let at = practice.indexOf(media); at !== -1; at = practice.indexOf(media, at + 1)) {
      const next = practice.indexOf('@media', at + 1);
      const block = practice.slice(at, next === -1 ? undefined : next);
      const hit = block.indexOf(selector + ' {');
      if (hit !== -1) return block.slice(hit, block.indexOf('}', hit));
    }
    return null;
  };

  it('a part only a Mac has is not drawn on a phone, and a phone’s is not drawn on a Mac', () => {
    expect(inMedia(PHONE, "main[aria-busy='true'] .ch-prc-sk-desk")).toContain('display: none');
    expect(inMedia(DESK, "main[aria-busy='true'] .ch-prc-sk-phone")).toContain('display: none');
    // Neither is hidden at the other width.
    expect(inMedia(DESK, "main[aria-busy='true'] .ch-prc-sk-desk")).toBeNull();
    expect(inMedia(PHONE, "main[aria-busy='true'] .ch-prc-sk-phone")).toBeNull();
  });

  it('the large title’s bar stands in the title’s one line', () => {
    expect(inMedia(PHONE, '.ch-prc-sk-title')).toContain('min-height: 1lh');
  });

  /**
   * A sheet imported from a module a client component draws lands ahead of the shared sheets in the page's styles, where
   * `.ch-pills` (controls.css) then beat `.ch-prc-areas`, and a phone's areas wrapped into two rows on the loaded Drills page
   * (seen in WebKit, 11 Nov 2026). So the skeletons import none, and each route's loading file imports the two on the
   * server, in the order the pages do (routes/practice.tsx).
   */
  it('the skeletons import no stylesheet; each loading file imports the plan sheet, then Practice', () => {
    for (const file of ['PracticeSkeletons.tsx', 'PracticeLoading.tsx']) {
      expect(read(`src/clubhouse/screens/practice/${file}`)).not.toMatch(/import\s+['"][^'"]+\.css['"]/);
    }
    const dir = 'src/app/golf/(dashboard)/dashboard/practice';
    for (const file of ['loading.tsx', 'drills/loading.tsx', 'groups/loading.tsx', 'templates/loading.tsx', 'plan/[planId]/loading.tsx']) {
      const src = read(`${dir}/${file}`);
      expect(src).not.toContain("'use client'");
      const sheets = [...src.matchAll(/import\s+'@\/clubhouse\/styles\/([a-z-]+)\.css'/g)].map((m) => m[1]);
      expect(sheets).toEqual(['coachhelm-plan', 'practice']);
      expect(src).toMatch(/<PracticeLoading page="(home|drills|groups|templates|plan)" \/>/);
    }
  });

  it('the sheet’s bars are the paper’s own rules, so they stay light on the paper in dark', () => {
    const plan = read('src/clubhouse/styles/coachhelm-plan.css');
    expect(plan).toMatch(/\.ch-cp-sheet\.ch-cp-skel\s*\{\s*--ch-skel-base:\s*var\(--ch-pl-rule-2\);\s*--ch-skel-sheen:\s*var\(--ch-pl-rule\);\s*\}/);
  });
});
