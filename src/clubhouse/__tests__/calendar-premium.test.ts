import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { focusHour, groupClasses, isClassGroup, type ChCalEvent } from '../screens/calendar/model';

/** P006 premium pass: the pure rules behind the Week and Day grids. */

describe('Calendar · open on now (P006-B1)', () => {
  const ev = (date: string, start: number | null, allDay = false) => ({ date, start, allDay });
  const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];

  it('opens on now when today is on show', () => {
    expect(focusHour(week, [ev('2026-10-08', 15.5)], { date: '2026-10-08', hour: 14.25 })).toBe(14.25);
  });

  it('opens on the next event, not the empty end of the grid, when now is outside the working hours', () => {
    const evs = [ev('2026-10-08', 9), ev('2026-10-09', 8.5), ev('2026-10-09', 13)];
    expect(focusHour(week, evs, { date: '2026-10-08', hour: 22.25 })).toBe(8.5);
    expect(focusHour(week, evs, { date: '2026-10-08', hour: 5 })).toBe(9);
    expect(focusHour(week, [ev('2026-10-05', 10)], { date: '2026-10-10', hour: 23 })).toBe(10);
  });

  it('opens on the first event still ahead when today is not on show', () => {
    const next = ['2026-10-11', '2026-10-12'];
    expect(focusHour(next, [ev('2026-10-12', 9), ev('2026-10-11', 16), ev('2026-10-11', 7, true)], { date: '2026-10-08', hour: 14 })).toBe(16);
  });

  it('falls back to the first timed event on a past week, and to null on an empty one', () => {
    const past = ['2026-09-27', '2026-09-28'];
    expect(focusHour(past, [ev('2026-09-28', 8), ev('2026-09-27', 15)], { date: '2026-10-08', hour: 14 })).toBe(15);
    expect(focusHour(past, [], { date: '2026-10-08', hour: 14 })).toBeNull();
  });
});

describe('Calendar · daylight on the grid (P006-A1)', () => {
  it('sunrise, golden hour and sunset on the team’s clock, from the global light’s sun', async () => {
    const { daylightOn } = await import('../screens/calendar/model');
    const oct = daylightOn('2026-10-14', { lat: 38.9, lng: -78.5 }, 'America/New_York');
    expect(oct.rise!).toBeGreaterThan(7);
    expect(oct.rise!).toBeLessThan(7.6);
    expect(oct.set!).toBeGreaterThan(18.3);
    expect(oct.set!).toBeLessThan(18.8);
    expect(oct.golden!).toBeLessThan(oct.set!);
    const june = daylightOn('2026-06-21', { lat: 38.9, lng: -78.5 }, 'America/New_York');
    expect(june.set!).toBeGreaterThan(20.3);
  });
});

describe('Calendar · peek actions (P006-C3)', () => {
  const people = new Map([
    ['p1', { id: 'p1', name: 'Ava Lin' }],
    ['p2', { id: 'p2', name: 'Ben Ortiz' }],
  ]) as never;
  const base = {
    id: 'e1',
    type: 'tournament',
    title: 'Fall Invitational',
    date: '2026-10-14',
    start: 9,
    end: 15,
    allDay: false,
    location: 'Pine Hollow GC',
    people: ['p1', 'p2'],
    rsvp: { p1: 'accepted' },
    rsvpRequired: true,
  } as never;

  it('the coach can nudge the one player who hasn’t replied, through a prefilled message, and get directions off site', async () => {
    const { eventPeekActions } = await import('../screens/calendar/peek');
    const acts = eventPeekActions(base, true, people, () => {});
    expect(acts.map((a) => a.label)).toEqual(['Open', 'Nudge Ben', 'Directions']);
    const nudge = new URL(acts[1]!.href!, 'https://x.test');
    expect(nudge.pathname).toBe('/golf/dashboard/messages');
    expect(nudge.search).not.toMatch(/Fall|p2|draft/);
    // The people and the draft travel in sessionStorage, not the URL (messages.test.tsx covers the store).
    expect(nudge.searchParams.get('prefill')).toMatch(/^[a-z0-9]+$/);
    expect(acts[2]!.href).toContain(encodeURIComponent('Pine Hollow GC'));
  });

  it('a player gets no nudge, and a practice on site gets no directions', async () => {
    const { eventPeekActions } = await import('../screens/calendar/peek');
    expect(eventPeekActions(base, false, people, () => {}).map((a) => a.label)).toEqual(['Open', 'Directions']);
    const practice = { ...(base as object), type: 'practice' } as never;
    expect(eventPeekActions(practice, true, people, () => {}).map((a) => a.label)).toEqual(['Open', 'Nudge Ben']);
  });

  it('an event that doesn’t require an RSVP offers no nudge, and its card says who is invited, never a reply count (owner, 2026-10-08)', async () => {
    const { eventPeekActions, EventPeekCard } = await import('../screens/calendar/peek');
    const off = { ...(base as object), rsvpRequired: false } as never;
    expect(eventPeekActions(off, true, people, () => {}).map((a) => a.label)).toEqual(['Open', 'Directions']);
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const html = renderToStaticMarkup(createElement(EventPeekCard, { e: off, coach: true, people }));
    expect(html).toMatch(/<b>2<\/b> invited/);
    expect(html).not.toMatch(/going|no reply/);
  });
});

describe('Calendar · a new event opens on free time (P006 D3)', () => {
  const ev = (id: string, start: number, end: number, people: string[]) =>
    ({ id, type: 'practice', title: id, date: '2026-10-14', start, end, allDay: false, people, rsvp: {} }) as never;
  const day = [ev('lift', 10, 11.5, ['p1']), ev('practice', 15.5, 17.5, ['p1', 'p2'])];

  it('today: the first two free hours after now, on the quarter hour', async () => {
    const { seedWindow } = await import('../screens/calendar/model');
    expect(seedWindow(day, ['p1', 'p2'], '2026-10-14', { date: '2026-10-14', hour: 9.1 })).toEqual([11.5, 13.5]);
    expect(seedWindow(day, ['p1', 'p2'], '2026-10-14', { date: '2026-10-14', hour: 12.6 })).toEqual([12.75, 14.75]);
  });

  it('another day opens from 9 AM; a day with nothing left falls back to its first free window', async () => {
    const { seedWindow } = await import('../screens/calendar/model');
    expect(seedWindow(day, ['p2'], '2026-10-14', { date: '2026-10-13', hour: 16 })).toEqual([9, 11]);
    expect(seedWindow(day, ['p1', 'p2'], '2026-10-14', { date: '2026-10-14', hour: 19 })).toEqual([7, 9]);
  });
});

describe('Calendar · players\u2019 classes fold into one block (P006)', () => {
  const cls = (id: string, owner: string, start: number, end: number) =>
    ({ id, type: 'class', title: id, date: '2026-10-05', start, end, allDay: false, owner, people: [], rsvp: {} }) as unknown as ChCalEvent;

  it('groups classes that start in the same half hour, and a lone class joins the group it overlaps most', () => {
    const out = groupClasses([cls('a', 'p1', 10, 11.25), cls('b', 'p2', 10, 11.25), cls('c', 'p3', 11.5, 12.75), cls('d', 'p4', 11.5, 12.75), cls('e', 'p5', 11, 12.25)]);
    const groups = out.filter(isClassGroup);
    expect(groups).toHaveLength(2);
    expect(groups[1]!.items.map((e) => e.id).sort()).toEqual(['c', 'd', 'e']);
    expect(out.some((x) => !isClassGroup(x))).toBe(false);
  });

  it('stacks groups that only brush at full width, keeping the true end', () => {
    const [first] = groupClasses([cls('a', 'p1', 10, 11.25), cls('b', 'p2', 10, 11.25), cls('c', 'p3', 11, 12.25), cls('d', 'p4', 11, 12.25)]).filter(isClassGroup);
    expect(first!.end).toBe(11);
    expect(first!.until).toBe(11.25);
  });

  it('leaves a lone class and team events as they are', () => {
    const practice = { ...cls('p', 'x', 9, 10), type: 'practice' } as ChCalEvent;
    expect(groupClasses([cls('a', 'p1', 8, 9), practice])).toEqual(expect.arrayContaining([cls('a', 'p1', 8, 9), practice]));
    expect(groupClasses([cls('a', 'p1', 8, 9), practice])).toHaveLength(2);
  });
});

describe('the change note in the desktop panel (F-0028)', () => {
  const cal = readFileSync(join(process.cwd(), 'src/clubhouse/styles/calendar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('the panel is a size container, so the note reads its width, not the window’s', () => {
    expect(cal).toMatch(/\.ch-in-wrap \{[^}]*container-type: inline-size;/);
  });
  it('in a narrow panel the actions drop under the text, which keeps the full width', () => {
    expect(cal).toMatch(/@container \(max-width: 420px\) \{\s*\.ch-change-note \{\s*grid-template-columns: 20px minmax\(0, 1fr\);\s*\}\s*\.ch-change-note__a \{\s*grid-column: 2;/);
  });
});
