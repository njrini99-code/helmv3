import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { PREVIEW_PLAYER_HOME, PREVIEW_PLAYER_HOME_NO_ROUNDS } from '../../../preview/fixtures-player-home';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { previewShsHome } from '../../../preview/fixtures-stats-redesign';
import type { ChPlayerHome } from '../../../data/player-home';
import { PlayerGame } from '../PlayerGame';

afterEach(cleanup);

const show = (data: ChPlayerHome, shs = true) => render(<PlayerGame data={data} phone shs={shs} part="legs" />);
const legs = () => [...document.querySelectorAll<HTMLElement>('a[data-ch="home-leg"]')];
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const noneLegs = (d: ChPlayerHome): ChPlayerHome => ({ ...d, legs: { ...d.legs!, cacheError: false, rows: d.legs!.rows.map((r) => ({ ...r, value: null, needs: undefined, sg: null, trend: [], note: null })) } });

/** Stats-home criteria 63 to 66, 75, 92, 101 to 104. */
describe('Your game', () => {
  it('default: four legs, each opening its part, with the drawn footnote', () => {
    show(PREVIEW_PLAYER_HOME);
    expect(legs().map((a) => a.getAttribute('href'))).toEqual(['tee', 'approach', 'short', 'putting'].map((k) => `/golf/dashboard/stats#gm-${k}`));
    expect(screen.getByText(/^Figures are your last 10 rounds/)).toBeTruthy();
  });

  it('a new season: the words say strokes gained waits for its third round', () => {
    show(previewShsHome('newseason')!);
    expect(screen.getByText(/shows from this season’s third round/)).toBeTruthy();
    expect(screen.queryByText(/ SG$/)).toBeNull();
  });

  it('two rounds: every counts line opens "Early read", no pill; scrambling shows what it needs and no figure', () => {
    show(previewShsHome('early')!);
    expect(screen.queryByText(/ SG$/)).toBeNull();
    const notes = legs().map((a) => a.textContent ?? '');
    expect(notes.filter((t) => t.includes('Early read · ')).length).toBeGreaterThan(0);
    const short = legs().find((a) => a.getAttribute('href')!.endsWith('gm-short'))!;
    expect(short.textContent).toContain('Needs 10 chances to get up and down');
    expect(short.querySelector('.ch-shs-leg__v.ch-shs-none')).not.toBeNull();
  });

  it('no rounds: the card keeps its header, the empty body, no footnote and no legs (CH-2311)', () => {
    show(noneLegs(PREVIEW_PLAYER_HOME));
    expect(screen.getByRole('heading', { name: 'Your game' })).toBeTruthy();
    expect(code('CH-2311')!.textContent).toContain('Nothing to break down yet.');
    expect(legs()).toHaveLength(0);
    expect(document.querySelector('.ch-shs-yg__foot')).toBeNull();
  });

  it('partial failure: the notice in the card, and only the missing leg changes (CH-2216)', () => {
    show(previewShsHome('partial')!);
    expect(code('CH-2216')!.textContent).toContain('Some of your figures didn’t load');
    expect(legs()).toHaveLength(4);
    const short = legs().find((a) => a.getAttribute('href')!.endsWith('gm-short'))!;
    expect(short.querySelector('.ch-shs-leg__v.ch-shs-none')).not.toBeNull();
    for (const a of legs().filter((x) => x !== short)) expect(a.querySelector('.ch-shs-leg__v.ch-shs-none')).toBeNull();
  });

  it('no rounds and failed never both show: the notice is the whole answer, with no empty body', () => {
    const d = noneLegs(PREVIEW_PLAYER_HOME);
    show({ ...d, legs: { ...d.legs!, cacheError: true } });
    expect(code('CH-2216')).not.toBeNull();
    expect(code('CH-2311')).toBeNull();
  });

  it('a player’s Home names no teammate (SHARED-11)', () => {
    show(PREVIEW_PLAYER_HOME);
    const html = document.body.innerHTML;
    for (const p of PREVIEW_TEAM_STATS.players) expect(html).not.toContain(p.name);
  });

  it('a player’s no-rounds fixture still renders under the flag', () => {
    expect(() => show(PREVIEW_PLAYER_HOME_NO_ROUNDS)).not.toThrow();
  });

  it('flag off: main’s legs, none of the card', () => {
    show(PREVIEW_PLAYER_HOME, false);
    expect(document.querySelector('.ch-shs-yg')).toBeNull();
    expect(legs()).toHaveLength(0);
  });
});
