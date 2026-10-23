import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChAgendaRow } from '../data/home';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { clockLabel as classClock, eventWhen, timeLabel, timeRange, type ChTeamEvent } from '../data/classes-shape';
import { ChClockProvider } from '../lib/use-clock';
import { PREVIEW_HOME, PREVIEW_HOME_NOW } from '../preview/fixtures';
import { clock as messageClock, railTime } from '../screens/messages/model';
import { clockLabel as feedClock } from '../screens/qualifiers/QualifierSections';
import { agendaDetail, agendaTime } from '../screens/home/agenda-clock';
import { competitionExtra, DayCard, dayPhase, LaterToday, sunsetExtra } from '../screens/home/DayCard';
import { whenLabel } from '../screens/home/event-links';
import { restyleClock } from '../lib/clock-format';

/** QUEUE doc-07: every time Clubhouse draws follows the device's clock (Settings › Time format, CH-8980). */

const todayRow: ChAgendaRow = { id: 'a', timeLabel: '3:30', hm: '15:30', title: 'Range', detail: null, isNext: true, isCompetition: false, when: 'today' };
const laterRow: ChAgendaRow = { id: 'b', timeLabel: 'Thu', hm: '08:42', title: 'Qualifier', detail: 'First tee 8:42 · Pines', isNext: false, isCompetition: true, when: 'later' };

describe('Home · agenda rows', () => {
  it('reads the row’s own text in 12 hours and its 24-hour start in 24', () => {
    expect(agendaTime(todayRow, '12')).toBe('3:30');
    expect(agendaTime(todayRow, '24')).toBe('15:30');
    expect(agendaTime(laterRow, '24')).toBe('Thu');
    expect(agendaDetail(laterRow, '12')).toBe('First tee 8:42 · Pines');
    expect(agendaDetail(laterRow, '24')).toBe('First tee 08:42 · Pines');
    expect(agendaDetail({ ...laterRow, hm: undefined }, '24')).toBe('First tee 8:42 · Pines');
    expect(agendaDetail({ ...laterRow, detail: null }, '24')).toBeNull();
  });

  it('puts the same 24-hour time on the rail’s competition row', () => {
    expect(competitionExtra(laterRow, '24')[0]!.sub).toBe('First tee 08:42 · Pines');
    expect(competitionExtra(laterRow)[0]!.sub).toBe('First tee 8:42 · Pines');
  });

  it('gives the sunset row 24-hour times, with a leading zero', () => {
    const place = { place: { lat: 38.9, lng: -78.5 }, timeZone: 'America/New_York' };
    const [row] = sunsetExtra('2026-10-14', new Date('2026-10-14T18:40:00Z'), place, '24');
    expect(row!.time).toMatch(/^18:[2-4]\d$/);
    expect(row!.sub).toMatch(/^Golden hour from \d{2}:\d{2}$/);
  });
});

describe('Home · the day card and the rail on a 24-hour device', () => {
  const next = PREVIEW_HOME.phone.next!;
  const todays = PREVIEW_HOME.phone.today;
  const now = new Date(PREVIEW_HOME_NOW);

  it('writes the card’s kicker and range in 24 hours', () => {
    const phase = dayPhase(next, todays, [], now, '2026-10-14');
    expect(phase?.kind).toBe('event');
    const view = render(
      <ChClockProvider clock="24">
        <DayCard phase={phase!} now={now} today="2026-10-14" onOpenRound={vi.fn()} />
      </ChClockProvider>,
    );
    const card = view.container;
    expect(card.textContent).not.toMatch(/\b[AP]M\b/);
    expect(card.textContent).toMatch(/\b\d{2}:\d{2}\b/);
  });

  it('writes the rail’s times in 24 hours', () => {
    const view = render(
      <ChClockProvider clock="24">
        <LaterToday todays={todays} cardId={null} now={null} extras={[]} />
      </ChClockProvider>,
    );
    expect(view.container.textContent).not.toMatch(/\b[AP]M\b/);
    for (const t of Array.from(view.container.querySelectorAll('.ch-hm-tl__t')).map((n) => n.textContent ?? '')) {
      expect(t === 'All day' || /^\d{2}:\d{2}$/.test(t)).toBe(true);
    }
    expect(screen.queryAllByRole('link').length).toBeGreaterThan(0);
    expect(within(view.container).queryAllByText(/AM|PM/)).toHaveLength(0);
  });

  it('restyles the when-label the day card draws (whenLabel keeps its 12-hour words)', () => {
    const label = whenLabel({ ...next, date: '2026-10-15', startLabel: '3:30 PM' }, now);
    expect(restyleClock(label.text, '24')).toMatch(/15:30$/);
    expect(restyleClock(label.text, '12')).toBe(label.text);
  });
});

describe('Classes · the clock', () => {
  it('writes class times in 12 hours as before and in 24 on request', () => {
    expect(timeRange('09:00', '10:15')).toBe('9:00–10:15 AM');
    expect(timeRange('09:00', '10:15', '24')).toBe('09:00–10:15');
    expect(timeRange('11:30', '12:45', '24')).toBe('11:30–12:45');
    expect(timeRange('15:00', null, '24')).toBe('15:00');
    expect(timeRange(null, null, '24')).toBeNull();
    expect(timeLabel('15:30')).toBe('3:30 PM');
    expect(timeLabel('15:30', '24')).toBe('15:30');
    expect(classClock('09:00')).toBe('9:00');
    expect(classClock('09:00', '24')).toBe('09:00');
  });

  it('writes an event’s window on a day in either clock', () => {
    const e = { startDate: '2026-10-14', endDate: '2026-10-14', startMin: 15 * 60 + 30, endMin: 17 * 60 + 30 } as unknown as ChTeamEvent;
    expect(eventWhen(e, '2026-10-14')).toBe('3:30–5:30 PM');
    expect(eventWhen(e, '2026-10-14', '24')).toBe('15:30–17:30');
  });
});

describe('Messages and the standings chip · the clock', () => {
  const iso = '2026-10-14T19:05:00Z';
  it('writes a message time in 12 or 24 hours in the team’s zone', () => {
    expect(messageClock(iso, 'America/New_York')).toBe('3:05 PM');
    expect(messageClock(iso, 'America/New_York', '24')).toBe('15:05');
    expect(messageClock('2026-10-14T04:05:00Z', 'America/New_York', '24')).toBe('00:05');
    expect(railTime(iso, '2026-10-14T20:00:00Z', 'America/New_York', '24')).toBe('15:05');
    expect(railTime(iso, '2026-10-14T20:00:00Z', 'America/New_York')).toBe('3:05 PM');
    expect(railTime(iso, '2026-10-15T20:00:00Z', 'America/New_York', '24')).toBe('Yesterday');
  });

  it('writes the standings’ read time in the reader’s zone', () => {
    const at = Date.parse(iso);
    expect(feedClock(at)).toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/);
    expect(feedClock(at, '24')).toMatch(/^\d{2}:\d{2}$/);
  });
});
