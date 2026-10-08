import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChHomeEvent, ChLatestRound } from '../data/home';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { DayCard, dayPhase, directionsHref, LaterToday, nudgeDraft, sinceChips, SinceYouLooked } from '../screens/home/DayCard';
import { takePrefill } from '../screens/messages/prefill';
import { PREVIEW_HOME, PREVIEW_HOME_NOW } from '../preview/fixtures';

/** P002 premium pass: the phone Home's day card (owner-approved concept, board 1). */

const next = PREVIEW_HOME.phone.next!;
const todays = PREVIEW_HOME.phone.today;
const at = (iso: string) => new Date(iso);
const round = (id: string, date: string, over: Partial<ChLatestRound> = {}): ChLatestRound => ({ ...PREVIEW_HOME.latestRounds.rounds[0]!, id, date, ...over });

describe('Home · the day card', () => {
  it('holds the next event, then the event under way, then the day’s recap once today is over', () => {
    expect(dayPhase(next, todays, [], at(PREVIEW_HOME_NOW), '2026-10-14')).toMatchObject({ kind: 'event', live: false, e: { id: 'a1' } });
    expect(dayPhase(next, todays, [], at('2026-10-14T19:45:00Z'), '2026-10-14')).toMatchObject({ kind: 'event', live: true, e: { id: 'a1' } });
    const posted = [round('r9', '2026-10-14'), round('r8', '2026-10-12')];
    const tomorrow: ChHomeEvent = { ...next, id: 'z', date: '2026-10-15', startIso: '2026-10-15T19:30:00Z', endIso: '2026-10-15T21:00:00Z' };
    expect(dayPhase(tomorrow, todays, posted, at('2026-10-14T23:00:00Z'), '2026-10-14')).toEqual({ kind: 'recap', rounds: [posted[0]] });
    // No round today: the next event, whenever it is.
    expect(dayPhase(tomorrow, todays, [round('r8', '2026-10-12')], at('2026-10-14T23:00:00Z'), '2026-10-14')).toMatchObject({ kind: 'event', e: { id: 'z' } });
    expect(dayPhase(null, [], [], at(PREVIEW_HOME_NOW), '2026-10-14')).toBeNull();
  });

  it('Nudge prefills Messages for the people who haven’t replied; nothing is sent from Home (D2-7)', () => {
    render(<DayCard phase={{ kind: 'event', e: next, live: false }} now={at(PREVIEW_HOME_NOW)} today="2026-10-14" onOpenRound={() => {}} />);
    const href = screen.getByRole('link', { name: 'Nudge Eli' }).getAttribute('href')!;
    const q = new URL(href, 'https://x').searchParams;
    expect(href.startsWith('/golf/dashboard/messages?prefill=')).toBe(true);
    // The draft and the people stay out of the URL; Messages takes them from this tab's storage.
    expect(href).not.toMatch(/Short|eli|draft|players/);
    const pre = takePrefill(q)!;
    expect(pre.players).toEqual(['eli']);
    expect(pre.draft).toBe(nudgeDraft(next, '2026-10-14'));
    expect(pre.draft).toMatch(/Short-game block \(today at 3:30 PM\)/);
    // Everyone replied: Message the invitees instead, with no draft.
    render(<DayCard phase={{ kind: 'event', e: { ...next, awaiting: [] }, live: false }} now={at(PREVIEW_HOME_NOW)} today="2026-10-14" onOpenRound={() => {}} />);
    const msg = takePrefill(new URL(screen.getByRole('link', { name: 'Message' }).getAttribute('href')!, 'https://x').searchParams)!;
    expect(msg.players).toEqual(['theo', 'sofia', 'ava', 'jonah', 'eli', 'priya']);
    expect(msg.draft).toBe('');
  });

  it('no Nudge or Message without reply data (a player’s card, or replies that didn’t load)', () => {
    render(<DayCard phase={{ kind: 'event', e: { ...next, awaiting: undefined, inviteeIds: undefined }, live: false }} now={at(PREVIEW_HOME_NOW)} today="2026-10-14" onOpenRound={() => {}} />);
    expect(screen.queryByRole('link', { name: /Nudge|Message/ })).toBeNull();
  });

  it('Directions only for an off-site event with a place, as a plain maps link', () => {
    expect(directionsHref(next)).toBeNull();
    expect(directionsHref({ ...next, type: 'qualifier', location: 'Pinehurst No. 2' })).toBe('https://maps.apple.com/?q=Pinehurst%20No.%202');
    expect(directionsHref({ ...next, type: 'travel', location: null })).toBeNull();
  });

  it('the recap lists the day’s rounds, each opening its card', () => {
    const open = vi.fn();
    const r = round('r9', '2026-10-14', { playerName: 'Theo Marchetti', score: 70, toPar: -2 });
    render(<DayCard phase={{ kind: 'recap', rounds: [r] }} now={at(PREVIEW_HOME_NOW)} today="2026-10-14" onOpenRound={open} />);
    expect(screen.getByRole('heading', { name: 'Theo posted a round' })).toBeTruthy();
    screen.getByRole('button', { name: /Theo Marchetti/ }).click();
    expect(open).toHaveBeenCalledWith(r);
  });
});

describe('Home · Later today', () => {
  it('leaves out the card’s event and what is over, and puts a later competition last', () => {
    render(
      <LaterToday
        todays={todays}
        cardId="a1"
        now={at('2026-10-14T20:50:00Z')}
        extras={[{ key: 'c', at: 24 * 60 + 1, time: 'Thu', title: 'Qualifier · Pinehurst No. 2', mark: 'competition' }]}
      />,
    );
    const list = screen.getByRole('list');
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(/1:1 with Jonah/);
    expect(rows.at(-1)).toMatch(/Qualifier/);
    expect(screen.getByRole('heading', { name: 'Later today' })).toBeTruthy();
  });
});

describe('Home · Since you last looked', () => {
  beforeEach(() => localStorage.clear());
  const rounds = PREVIEW_HOME.latestRounds.rounds;

  it('nothing on a first visit; new rounds and new replies after that', () => {
    expect(sinceChips(null, rounds, next)).toEqual([]);
    const chips = sinceChips({ rounds: ['r2', 'r3'], event: { id: 'a1', going: 3 } }, rounds, next);
    expect(chips.map((c) => c.label)).toEqual(['Theo posted', 'Replies · Short-game block']);
    expect(chips[0]!.toPar).toEqual({ text: '−2', under: true });
    expect(chips[1]!.big).toBe('+2');
  });

  it('remembers what this device saw: the second visit shows what changed', () => {
    const first = render(<SinceYouLooked rounds={rounds.slice(1)} event={null} onOpenRound={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Since you last looked' })).toBeNull();
    first.unmount();
    render(<SinceYouLooked rounds={rounds} event={null} onOpenRound={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Since you last looked' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Theo posted/ })).toBeTruthy();
  });
});

describe('Home · the sunset row', () => {
  it('shows today’s sunset at the team’s place while it is ahead, and nothing after', async () => {
    const { sunsetExtra } = await import('../screens/home/DayCard');
    const place = { place: { lat: 38.9, lng: -78.5 }, timeZone: 'America/New_York' };
    const [row] = sunsetExtra('2026-10-14', new Date('2026-10-14T18:40:00Z'), place);
    expect(row).toMatchObject({ key: 'sunset', title: 'Sunset', mark: 'sun' });
    expect(row!.time).toMatch(/^6:[2-4]\d$/);
    expect(row!.sub).toMatch(/^Golden hour from \d:\d\d$/);
    expect(sunsetExtra('2026-10-14', new Date('2026-10-15T00:30:00Z'), place)).toEqual([]);
  });
});
