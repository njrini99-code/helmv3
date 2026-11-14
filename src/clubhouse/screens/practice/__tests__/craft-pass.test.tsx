import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChPlayerPracticeHome, ChPracticeHome, ChPracticeTile } from '../../../data/practice-home-shape';
import { PlayerPracticeHome } from '../PlayerPracticeHome';
import { PracticeHome } from '../PracticeHome';

const phone = vi.hoisted(() => ({ on: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => phone.on }));
vi.mock('../../../shell/phone-chrome', () => ({ PhoneTop: () => null }));

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/practice.css'), 'utf8');
/** The body of the first rule whose selector is exactly `sel`, from `from` on (a media block's copy is found past its start). */
const rule = (sel: string, from = 0) => {
  const at = css.indexOf(`${sel} {`, from);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const PHONE = css.indexOf('/* Phone. */');

const tile = (day: string, date: number, today = false): ChPracticeTile => ({ key: `${day}${date}`, day, date: String(date), today, items: [] });
const HOME: ChPracticeHome = {
  teamName: 'Demo',
  week: [tile('Mon', 9), tile('Tue', 10), tile('Wed', 11), tile('Thu', 12), tile('Fri', 13, true), tile('Sat', 14), tile('Sun', 15)],
  weekLine: '30 min of practice this week',
  upNext: null,
  drafts: [],
  published: [],
  past: [{ id: 'p', day: 'Mon, Nov 9', title: 'Ask check plan', time: '3:00 to 3:30 PM', line: '', state: 'Done', href: '/p' }],
  open: [],
  copies: [],
  roster: [],
  firstRun: false,
  zone: 'America/New_York',
};

afterEach(() => {
  cleanup();
  phone.on = false;
});

describe('Practice craft pass (13 Nov 2026)', () => {
  it.each([false, true])('the tabs sit under the head and over the week, at either width (phone: %s), as on Drills, Groups and Templates', (on) => {
    phone.on = on;
    const { container } = render(<PracticeHome data={HOME} />);
    const main = container.querySelector('main.ch-prc')!;
    const kids = [...main.children];
    const head = kids.findIndex((el) => el.classList.contains('ch-prc-h'));
    const tabs = kids.findIndex((el) => el.classList.contains('ch-prc-tabs'));
    const week = kids.findIndex((el) => el.querySelector('.ch-prc-week'));
    expect(tabs).toBe(head + 1);
    expect(week).toBe(tabs + 1);
    expect(main.querySelectorAll('.ch-prc-tabs')).toHaveLength(1);
    expect(main.querySelector('.ch-prc-home .ch-prc-tabs')).toBeNull();
  });

  it('a week tile is a card, on the card’s corner (CR-05)', () => {
    expect(rule('.ch-prc-tile')).toContain('border-radius: var(--ch-radius-card)');
  });

  it('today is the date on the accent disc, as Calendar marks it, not a ring in the focus colour', () => {
    const today = rule('.ch-prc-tile.is-today');
    expect(today).toContain('background: var(--ch-selected-bg)');
    expect(today).not.toMatch(/box-shadow|--ch-border-focus/);
    const disc = rule('.ch-prc-tile.is-today .ch-prc-tile__d b');
    expect(disc).toContain('background: var(--ch-green-fill-600)');
    expect(disc).toContain('color: var(--ch-text-on-accent)');
    // The disc overhangs its 22px line by 4 each way and takes it back, so today's practice sits on every tile's line.
    expect(disc).toContain('height: calc(30 * var(--ch-type-k))');
    expect(disc).toContain('margin: calc(-4 * var(--ch-type-k)) -4px');
  });

  it('a phone’s week is three tiles to the page’s width, snapped whole, so it rests on the page’s edges (CR-01)', () => {
    expect(PHONE).toBeGreaterThan(0);
    expect(rule('  .ch-prc-week', PHONE)).toContain('scroll-snap-type: x mandatory');
    expect(rule('  .ch-prc-tile', PHONE)).toContain('flex: 0 0 calc((100% - 2 * 8px) / 3)');
    // A phone on its side shares its width among all seven, after the portrait rule so it wins there.
    const side = css.indexOf('@media (max-height: 500px) and (pointer: coarse) {', PHONE);
    expect(side).toBeGreaterThan(PHONE);
    expect(rule('  .ch-prc-tile', side)).toContain('flex: 0 0 calc((100% - 6 * 8px) / 7)');
  });

  it('a player’s plans read at a reading measure on a desk (CR-14); the week keeps the page’s width', () => {
    const data: ChPlayerPracticeHome = { next: null, week: HOME.week, upcoming: [], past: HOME.past };
    const { container } = render(<PlayerPracticeHome data={data} />);
    expect(container.querySelector('main')!.classList.contains('ch-prc--ply')).toBe(true);
    expect(rule('  .ch-prc--ply .ch-prc-rows')).toContain('max-width: var(--ch-measure-reading)');
    expect(css).not.toMatch(/\.ch-prc--ply \.ch-prc-week/);
  });
});
