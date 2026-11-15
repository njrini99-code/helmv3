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
const draw = (d: ChTourPlayerData, phone = false, load: 'ready' | 'loading' = 'ready') => render(<PlayerEvent data={d} load={load} phone={phone} />).container;

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
    // On the phone the one event that follows is the green card's foot, so only Played is a titled card.
    expect(captions).toEqual(phone ? ['Your total, to par'] : ['2 events on the calendar', 'Your own scores, round by round']);
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
    expect(decls('.ch-tour-pl-row').padding).toBe('8px 12px');
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

/**
 * In one phone page two cards of rows washed to two widths: the kit's ledger row (Coming up) reaches 12 past its text, and
 * the played row reached 8. The played row takes the kit's 12, so a press tints the same band in both cards.
 */
describe('the player’s Tournaments · one press band on a phone', () => {
  it('a played row bleeds 12 past its text, as the kit’s ledger row does', () => {
    const ui = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/ui.css'), 'utf8'));
    const kit: Record<string, string> = {};
    ui.walkRules((r) => {
      if (r.selector === '.ch-lgr__row.is-link' && r.parent?.type === 'root') r.walkDecls((d) => void (kit[d.prop] = d.value));
    });
    const row = decls('.ch-tour-pl-row');
    expect(row['margin-inline']).toBe(kit['margin-inline']);
    expect(row.padding).toBe(`8px ${kit['padding-inline']}`);
    expect(row['border-radius']).toBe(kit['border-radius']);
  });
});

/** The page drew its "opens" chevron at three sizes: 18 on the green card, 16 on the kit's rows, 15 in the table. It is the kit's 16 everywhere. */
describe('the player’s Tournaments · one chevron', () => {
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: every chevron is the kit’s 16', (_, phone) => {
    const sizes = [...draw(fx.list, phone).querySelectorAll('svg.lucide-chevron-right')].map((x) => x.getAttribute('width'));
    expect(sizes.length).toBeGreaterThanOrEqual(fx.list.list.length);
    expect(new Set(sizes)).toEqual(new Set(['16']));
  });
});

/**
 * Loading, the desktop list drew its card and rows straight under the page head, where the loaded page has each column's
 * heading: the card landed 78px lower when the read came back. Each column now waits under its section's head.
 */
describe('the player’s Tournaments · the list waits where it lands', () => {
  it('desktop: each of the two columns opens with a section head in waiting, announced as nothing', () => {
    const c = draw(fx.list, false, 'loading');
    const cols = c.querySelectorAll('.ch-tour-pl-body--list.is-two > .ch-sec');
    expect(cols).toHaveLength(2);
    for (const col of cols) {
      const head = col.querySelector(':scope > .ch-sec__head')!;
      expect(head.getAttribute('aria-hidden')).toBe('true');
      expect(head.querySelectorAll('.ch-sec__titles > .ch-skel-ln')).toHaveLength(2);
      expect(head.nextElementSibling).not.toBeNull();
    }
    expect(c.querySelectorAll('h2')).toHaveLength(0);
    expect(c.querySelector('[data-ch-tour-view="player"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('the loaded columns are the same two sections', () => {
    expect(draw(fx.list).querySelectorAll('.ch-tour-pl-body--list.is-two > .ch-sec')).toHaveLength(2);
  });
});

/**
 * On a phone a section's body starts on its heading's rule. "Team results" and the reflection began there with no room:
 * their first line touched the rule, against 16 under their last. They take the 12 an event's rows keep over their text.
 */
describe('the player’s Tournaments · a phone card’s text clears its heading’s rule', () => {
  it.each(['.ch-tour-pl-quiet', '.ch-tour-pl-reflect', '.ch-tour-pl-card'])('%s starts 12 under the rule, as an event row’s text does', (block) => {
    expect(decls(`.ch-tour-pl.is-phone .ch-sec__head ~ ${block}`)['padding-top']).toBe('12px');
    expect(decls('.ch-tour-pl-round').padding).toBe('12px 16px');
  });
});

/**
 * On a phone "Coming up · 1 event" was a whole titled card for one row. A single following event is now the green card's
 * foot. A link cannot sit inside a link, so on the phone the card is the coach's card (TournamentsHome): a named group
 * whose title opens the next event and whose foot opens the one after. Two or more following events keep their card.
 */
describe('the player’s Tournaments · one following event is the card’s foot (phone)', () => {
  const coming = fx.list.list.filter((x) => x.status !== 'complete');
  const played = fx.list.list.filter((x) => x.status === 'complete');
  const [next, then] = coming as [(typeof coming)[number], (typeof coming)[number]];
  const hrefOf = (id: string) => `/golf/dashboard/tournaments/${id}`;

  it('the fixture has exactly one event after the next', () => {
    expect(coming).toHaveLength(2);
  });

  it('the card is a named group, and its title is the link to the next event', () => {
    const card = draw(fx.list, true).querySelector('.ch-tour-pl-next')!;
    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('role')).toBe('group');
    expect(card.getAttribute('aria-label')).toBe(`Up next: ${next.name}`);
    expect(card.classList.contains('is-link')).toBe(false);
    const title = card.querySelector('.ch-feat__title a')!;
    expect(title.getAttribute('href')).toBe(hrefOf(next.eventId));
    expect(title.textContent).toBe(next.name);
    expect(title.querySelector('svg.lucide-chevron-right')).not.toBeNull();
  });

  it('the one following event is the foot: a second link, named, with when, where and how far off', () => {
    const c = draw(fx.list, true);
    const foot = c.querySelector('.ch-tour-pl-next .ch-feat__foot')!;
    const links = foot.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe(hrefOf(then.eventId));
    expect(links[0]!.querySelector('b')!.textContent).toBe(then.name);
    expect(links[0]!.textContent).toMatch(/^Also coming up: /);
    expect(links[0]!.querySelector('.ch-sr-only')!.textContent).toBe('Also coming up: ');
    expect([...links[0]!.querySelectorAll('.ch-tour-pl-bits > span > span')].map((x) => x.textContent)).toEqual([expect.stringMatching(/^[A-Z][a-z]{2} \d/), then.courseName, expect.stringMatching(/^In \d+ days$/)]);
    // No titled card for one row, and no link inside a link.
    expect(c.querySelector('#ch-tour-pl-up-t')).toBeNull();
    expect(c.querySelector('.ch-tour-pl-later')).toBeNull();
    expect(c.querySelector('a a')).toBeNull();
    // Every event is still one tap away: the next, the one after, and each played.
    const hrefs = [...c.querySelectorAll<HTMLAnchorElement>('a[href^="/golf/dashboard/tournaments/"]')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([next, then, ...played].map((x) => hrefOf(x.eventId)));
  });

  it('with two or more following events the Coming up card stays, and the green card has no foot', () => {
    const third = { ...then, eventId: 'e-third', name: 'Third Event' };
    const c = draw({ ...fx.list, list: [...coming, third, ...played] }, true);
    expect(c.querySelector('.ch-tour-pl-next .ch-feat__foot')).toBeNull();
    expect(c.querySelector('#ch-tour-pl-up-t')!.textContent).toBe('Coming up');
    expect([...c.querySelectorAll('.ch-tour-pl-later .ch-lgr__row')].map((a) => a.getAttribute('href'))).toEqual([hrefOf(then.eventId), hrefOf('e-third')]);
    expect(c.querySelector('.ch-sec__meta')!.textContent).toBe('2 events');
  });

  it('with nothing after it the green card has no foot', () => {
    const c = draw({ ...fx.list, list: [next, ...played] }, true);
    expect(c.querySelector('.ch-tour-pl-next .ch-feat__foot')).toBeNull();
    expect(c.querySelector('.ch-tour-pl-next .ch-feat__title a')!.getAttribute('href')).toBe(hrefOf(next.eventId));
  });

  it('desktop is unchanged: the whole card is the one link, and the following event is a row under it', () => {
    const c = draw(fx.list);
    const card = c.querySelector('.ch-tour-pl-next')!;
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe(hrefOf(next.eventId));
    expect(card.querySelector('a')).toBeNull();
    expect(card.querySelector('.ch-feat__foot')).toBeNull();
    expect(c.querySelectorAll('.ch-tour-pl-later .ch-lgr__row')).toHaveLength(1);
  });

  it('both links reach 44 to the finger, dim while pressed and take the on-dark ring', () => {
    expect(decls('.ch-tour-pl-next__open::after')).toMatchObject({ position: 'absolute', inset: 'min(0px, calc(50% - 22px)) 0' });
    expect(decls('.ch-tour-pl-next__then')).toMatchObject({ 'min-height': '44px' });
    for (const link of ['.ch-tour-pl-next__open', '.ch-tour-pl-next__then']) {
      expect(decls(`${link}[data-ch-pressed]`)).toMatchObject({ opacity: '0.55' });
      expect(decls(`.ch-tour-pl ${link}:focus-visible`)).toMatchObject({ outline: '2px solid var(--ch-border-focus-on-dark)' });
    }
  });
});

/**
 * The shell rings every focused control in green (base.css, `.ch-root :focus-visible`, two classes). This page's own focus
 * rules were one class and a pseudo-class, a tie the shell won by source order: the green card's links showed a green
 * ring on green (about 1.3:1), and a Played row drew a second ring round its name. Each rule is now written from the
 * page's root, so it outranks the shell's wherever the sheets load.
 */
describe('the player’s Tournaments · the page’s focus rings outrank the shell’s', () => {
  const src = readFileSync(join(import.meta.dirname, '../../../styles/tournaments-player.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('every :focus-visible rule starts at the page root', () => {
    const focus: string[] = [];
    css.walkRules((r) => {
      for (const sel of r.selectors) if (sel.includes(':focus-visible')) focus.push(sel);
    });
    expect(focus.length).toBeGreaterThanOrEqual(6);
    expect(focus.filter((sel) => !sel.startsWith('.ch-tour-pl '))).toEqual([]);
    expect(src).not.toMatch(/\n\.ch-tour-pl-[\w-]+:focus-visible/);
  });

  it('on the green card the ring is the on-dark one, for the card and for its two phone links', () => {
    for (const sel of ['.ch-tour-pl .ch-tour-pl-next:focus-visible', '.ch-tour-pl .ch-tour-pl-next__open:focus-visible', '.ch-tour-pl .ch-tour-pl-next__then:focus-visible']) {
      expect(decls(sel)).toMatchObject({ outline: '2px solid var(--ch-border-focus-on-dark)', 'outline-offset': '2px' });
    }
  });

  it('a Played row has one ring, the row’s, and none round its name', () => {
    expect(decls('.ch-tour-pl .ch-tour-pl-res__open:focus-visible')).toEqual({ outline: 'none' });
    expect(decls('.ch-tour-pl .ch-tour-pl-res__open:focus-visible::after')).toMatchObject({ outline: '2px solid var(--ch-border-focus)', 'outline-offset': '-2px' });
  });
});
