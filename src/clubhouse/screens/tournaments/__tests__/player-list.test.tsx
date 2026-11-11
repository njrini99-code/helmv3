// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { PlayerEvent } from '../PlayerEvent';
import type { ChTourPlayerData } from '../types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/golf/actions/tournaments-player', () => ({ saveTournamentReflection: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: vi.fn() }));

const fx = tourFixture('ready').player;
const draw = (d: ChTourPlayerData, phone = false) => render(<PlayerEvent data={d} load="ready" phone={phone} />).container;

const css = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/tournaments-player.css'), 'utf8'));
const decls = (selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.selectors.includes(selector) && r.parent?.type === 'root') r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

afterEach(cleanup);

/**
 * The list said one thing three times: a line under the title ("Your team’s events, with the days, the tee times and
 * your own scores."), then each section's own caption ("2 events on the calendar", "Your own scores, round by round").
 * The captions say it where it applies, so the page line is gone at both widths.
 */
describe('the player’s Tournaments list · said once', () => {
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: the title stands alone, and the sections keep their captions', (_, phone) => {
    const c = draw(fx.list, phone);
    expect(c.querySelector('h1')?.textContent).toBe('Tournaments');
    expect(c.textContent).not.toContain('Your team’s events, with the days');
    const captions = [...c.querySelectorAll('.ch-sec__meta')].map((x) => x.textContent);
    expect(captions).toEqual(phone ? ['1 event', 'Your total, to par'] : ['2 events on the calendar', 'Your own scores, round by round']);
  });

  it('desktop: nothing sits between the title and the head’s rule', () => {
    const c = draw(fx.list);
    expect(c.querySelector('.ch-tour-head__t p')).toBeNull();
  });
});

/**
 * On a desktop "Played" lay on the bare canvas with its text 8px right of its own heading (the rows' 8px padding), beside
 * a column whose card starts on its heading's edge. It is a table, the object a section keeps a card for: it sits on the
 * reading sheet as Roster's list does, the sheet's edge on the heading's edge and its text 16 in, as the green card's is.
 */
describe('the player’s Tournaments list · Played is a table on the sheet', () => {
  it('the table is the shared sheet', () => {
    const table = draw(fx.list).querySelector('[role="table"]')!;
    expect(table.classList.contains('ch-sheet')).toBe(true);
    expect(table.classList.contains('ch-tour-pl-res')).toBe(true);
  });

  it('keeps the sheet’s face on the Ledger canopy, which flattens it elsewhere', () => {
    expect(decls('.ch-tour-pl:not(.is-phone) .ch-tour-pl-res.ch-sheet')).toEqual({
      'border-radius': 'var(--ch-radius-card)',
      background: 'var(--ch-sheet-bg)',
      'box-shadow': 'var(--ch-sheet-shadow)',
    });
  });

  it('rows run the sheet’s width with Roster’s row: 64 tall, text 16 in, one hairline from that inset', () => {
    const row = decls('.ch-tour-pl-res__row');
    expect(row).toMatchObject({ 'min-height': '64px', padding: '8px 16px' });
    expect(row['border-radius']).toBeUndefined();
    expect(decls('.ch-tour-pl-res__row + .ch-tour-pl-res__row::before')).toMatchObject({ inset: '0 0 auto 16px', height: 'var(--ch-hairline-w)', background: 'var(--ch-separator)' });
    expect(decls('.ch-tour-pl-res__row.is-head')).toMatchObject({ 'min-height': '0', 'padding-block': '12px' });
    // The sheet has no inline padding of its own, so its edge is the heading's edge.
    expect(decls('.ch-tour-pl-res').padding).toBeUndefined();
  });
});

/**
 * On a phone a section is a card: 16 over its heading and, from the shared card, 16 under its last block. The lists'
 * rows keep their own room under their last line, so the cards ended 24 (the list) or 28 (an event) under their content.
 * Each list hands its row's share back, so a card ends 16 under its content, as it begins.
 */
describe('the player’s Tournaments · a phone card ends as it begins', () => {
  const CARD = 16;
  const last = (list: string) => decls(`.ch-tour-pl.is-phone .ch-sec__head ~ ${list}:last-child`)['padding-bottom'];
  const px = (v: string | undefined) => Number(v?.replace('px', ''));

  it('the list’s cards: the row’s 8 and the list’s 8 make the card’s 16', () => {
    // .ch-tour-pl-row and the kit's ledger row (ui.css .ch-lgr__row) both pad 8 under their content.
    expect(decls('.ch-tour-pl-row').padding).toMatch(/^8px/);
    expect(px(last('.ch-tour-pl-list')) + 8).toBe(CARD);
    expect(px(last('.ch-tour-pl-later')) + 8).toBe(CARD);
  });

  it('an event’s cards: the row’s 12 and the list’s 4 make the card’s 16', () => {
    expect(decls('.ch-tour-pl-round').padding).toBe('12px 16px');
    expect(decls('.ch-tour-pl-note').padding).toBe('12px 16px');
    expect(px(last('.ch-tour-pl-rounds')) + 12).toBe(CARD);
    expect(px(last('.ch-tour-pl-notes')) + 12).toBe(CARD);
  });
});
