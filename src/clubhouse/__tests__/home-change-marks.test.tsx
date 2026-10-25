import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-14 change marks on Home: "Since you last looked" tells a coach or player what someone else changed in the last 72 hours
 * (a moved start, a new day, a cancellation, a series edited together), Up next and the agenda wear the old value struck, and a
 * change someone made themselves is never news to them. The rows come from the same marks the Calendar reads.
 *
 * CH-6023 (a stored mark this version cannot read) is catalogued in docs/clubhouse/catalog/calendar.md; Home logs it through
 * the same builder and is covered with the Calendar in calendar-change-marks.test.tsx and calendar.test.tsx.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const logged = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logged }));

import type { ChPlayerHome } from '../data/player-home';
import { loadHomeChanges, withChange, withWas } from '../data/home-changes';
import { homeChangeRows } from '../screens/home/change-rows';
import { SinceYouLooked, sinceChips } from '../screens/home/DayCard';
import { PlayerHome } from '../screens/home/PlayerHome';
import { ChangeMarksProvider } from '../lib/use-change-marks';
import type { MarkEntries } from '../lib/marks-cookie';
import { buildChangeMarks, type ChangeRow } from '../screens/calendar/change-view';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME, PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';

const TZ = 'America/New_York';
// Wednesday 14 October 2026, 2:40 PM Eastern.
const NOW = Date.parse('2026-10-14T18:40:00Z');
const AT = '2026-10-14T18:14:00.000Z';
const S1 = '6f1c2a90-aaaa-4bbb-8ccc-000000000001';
const S2 = '6f1c2a90-aaaa-4bbb-8ccc-000000000002';
const S3 = '6f1c2a90-aaaa-4bbb-8ccc-000000000003';
const S4 = '6f1c2a90-aaaa-4bbb-8ccc-000000000004';
const S5 = '6f1c2a90-aaaa-4bbb-8ccc-000000000005';

/** Practice on Thu 15 October, 1:00 to 1:45 PM, until it moved 30 minutes later. */
const base = { start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', all_day: false, location: 'Team room', title: 'Travel briefing', event_type: 'meeting', cancelled: false };
const stored = (over: Record<string, unknown> = {}) => ({ v: 1, id: S1, first_at: AT, at: AT, by: 'c2', by_names: ['Sam Okafor'], from: base, fields: ['end_time', 'start_time'], ...over });
const row = (over: Partial<ChangeRow> = {}): ChangeRow => ({
  id: 'e9',
  start_time: '2026-10-15T17:30:00Z',
  end_time: '2026-10-15T18:15:00Z',
  all_day: false,
  location: 'Team room',
  title: 'Travel briefing',
  event_type: 'meeting',
  status: 'confirmed',
  change: stored(),
  ...over,
});
const rows = (list: ChangeRow[], coachId: string | null = 'c1', visible?: (r: ChangeRow) => boolean) => homeChangeRows(list, { timeZone: TZ, nowMs: NOW, coachId, visible });

/** Four more events, each its own edit session. */
const cancelled = row({ id: 'e1', title: 'Putting lab', event_type: 'practice', status: 'cancelled', change: stored({ id: S2, from: { ...base, title: 'Putting lab', event_type: 'practice' }, fields: ['cancelled'], reason: 'Frost delay' }) });
const dayMoved = row({
  id: 'e2',
  title: 'Range session',
  event_type: 'practice',
  start_time: '2026-10-17T17:00:00Z',
  end_time: '2026-10-17T17:45:00Z',
  change: stored({ id: S3, from: { ...base, title: 'Range session', event_type: 'practice' }, fields: ['end_time', 'start_time'] }),
});
const placeMoved = row({ id: 'e3', title: 'Short game', event_type: 'practice', location: 'Finley range', start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', change: stored({ id: S4, from: { ...base, title: 'Short game', event_type: 'practice', location: 'Lonnie Poole' }, fields: ['location'] }) });
const mine = row({ id: 'e4', title: 'Fitting', change: stored({ id: S5, by: 'c1', by_names: ['Maya Reyes'], from: { ...base, title: 'Fitting' } }) });

describe('Home · the schedule rows', () => {
  it('turns a moved start into a row: the new start as the lead, what it was, the day and who', () => {
    const { rows: out } = rows([row()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ eventId: 'e9', changeId: S1, date: '2026-10-15', lead: { text: '1:30', hm: '13:30' } });
    expect(out[0]!.title).toMatch(/Travel briefing$/);
    expect(out[0]!.meta).toMatch(/^Was 1:00 PM · /);
    expect(out[0]!.meta).toContain('Coach Okafor');
  });

  it('leads with a new day for a move to another day, and with the old start, struck, for a cancellation', () => {
    const day = rows([dayMoved]).rows[0]!;
    expect(day.lead).toEqual({ text: 'Sat' });
    expect(day.meta).toMatch(/^Was .*Thu/);
    const gone = rows([cancelled]).rows[0]!;
    expect(gone.lead).toMatchObject({ text: '1:00', hm: '13:00', struck: true });
    expect(gone.title).toMatch(/^Cancelled · Putting lab/);
  });

  it('never tells someone about the change they made themselves', () => {
    expect(rows([mine]).rows).toEqual([]);
    expect(rows([mine, row()]).rows.map((r) => r.eventId)).toEqual(['e9']);
    // The mark still sits on the event for the author: the Calendar shows it; Home just does not call it news.
    expect(rows([mine]).byEvent.has('e4')).toBe(true);
  });

  it('is one row with a count when a series was edited together', () => {
    const series = ['a', 'b', 'c'].map((s, i) =>
      row({ id: `s${s}`, title: 'Range', event_type: 'practice', start_time: `2026-10-${15 + i}T17:30:00Z`, end_time: `2026-10-${15 + i}T18:15:00Z`, change: stored({ from: { ...base, title: 'Range', event_type: 'practice', start_time: `2026-10-${15 + i}T17:00:00Z`, end_time: `2026-10-${15 + i}T17:45:00Z` } }) }),
    );
    const out = rows(series).rows;
    expect(out).toHaveLength(1);
    expect(out[0]!.lead).toEqual({ text: '3' });
    expect(out[0]!.eventId).toBe('sa');
  });

  it('lists the newest edit first and drops what the viewer is not shown', () => {
    const older = row({ id: 'e5', title: 'Fitting', change: stored({ id: S5, at: '2026-10-14T16:00:00.000Z', first_at: '2026-10-14T16:00:00.000Z' }) });
    expect(rows([older, row()]).rows.map((r) => r.eventId)).toEqual(['e9', 'e5']);
    expect(rows([older, row()], 'c1', (r) => r.id !== 'e9').rows.map((r) => r.eventId)).toEqual(['e5']);
  });

  it('puts the mark on the event and the old value at the head of its agenda line', () => {
    const { byEvent } = rows([row()]);
    const ev = withChange({ ...PREVIEW_HOME.phone.next!, id: 'e9' }, byEvent);
    expect(ev.change?.kind).toBe('time');
    expect(withChange(null, byEvent)).toBeNull();
    const agenda = withWas([{ id: 'e9', title: 'Travel briefing' } as never, { id: 'zz', title: 'Other' } as never], byEvent) as Array<{ was?: { text: string; changeId: string } }>;
    expect(agenda[0]!.was).toEqual({ text: '1:00 PM', changeId: S1 });
    expect(agenda[1]!.was).toBeUndefined();
  });
});

describe('Home · the read', () => {
  beforeEach(() => logged.mockClear());

  it('asks for the events that carry a mark, a day back to three weeks ahead, and keeps a player to the meetings they are shown', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const answer = (data: unknown[] | null, error: unknown = null) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) {
        chain[m] = (...args: unknown[]) => {
          calls.push([m, args]);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(res);
      return chain;
    };
    const client = (data: unknown[] | null, error: unknown = null) => ({ from: (t: string) => (calls.push(['from', [t]]), answer(data, error)) }) as never;
    const now = new Date(NOW);
    const raw = [row(), row({ id: 'm2', title: 'Staff', change: stored({ id: S5 }) })].map(({ change, ...r }) => ({ ...r, change }));
    const got = await loadHomeChanges(client(raw), { teamId: 't1', tz: TZ, now, coachId: 'c1' });
    expect(got.error).toBe(false);
    expect(got.rows.map((r) => r.eventId).sort()).toEqual(['e9', 'm2']);
    expect(calls).toContainEqual(['from', ['golf_events']]);
    expect(calls).toContainEqual(['neq', ['event_type', 'class']]);
    expect(calls).toContainEqual(['not', ['metadata->change', 'is', null]]);
    expect(calls).toContainEqual(['limit', [50]]);
    const gte = calls.find(([m]) => m === 'gte')![1][1] as string;
    const lte = calls.find(([m]) => m === 'lte')![1][1] as string;
    expect(Date.parse(gte)).toBe(NOW - 86_400_000);
    expect(Date.parse(lte)).toBe(NOW + 21 * 86_400_000);
    // A player's week shows them one of the two meetings.
    const player = await loadHomeChanges(client(raw), { teamId: 't1', tz: TZ, now, visibleMeetings: new Set(['e9']) });
    expect(player.rows.map((r) => r.eventId)).toEqual(['e9']);
  });

  it('logs a failed read and shows nothing rather than guessing', async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) chain[m] = () => chain;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(res);
    const got = await loadHomeChanges({ from: () => chain } as never, { teamId: 't1', tz: TZ, now: new Date(NOW) });
    expect(got).toMatchObject({ rows: [], error: true });
    expect(logged).toHaveBeenCalledWith('home', 'changes', { message: 'boom' });
  });
});

describe('Home · Since you last looked, with schedule changes', () => {
  const all = rows([row(), cancelled, dayMoved, placeMoved].map((r, i) => ({ ...r, change: { ...(r.change as object), at: `2026-10-14T18:${10 + i}:00.000Z`, first_at: `2026-10-14T18:${10 + i}:00.000Z` } }))).rows;
  const seen = { rounds: [] as string[], event: null, changes: [] as string[] };

  it('shows nothing on the first visit', () => {
    expect(sinceChips(null, [], null, all)).toEqual([]);
  });

  it('leads with the changes, newest first, three at most and then one row for the rest', () => {
    const chips = sinceChips(seen, [], null, all);
    expect(chips).toHaveLength(4);
    expect(chips.slice(0, 3).every((c) => c.key.startsWith('c-') && c.changeId)).toBe(true);
    expect(chips[0]!.changeId).toBe(all[0]!.changeId);
    expect(chips[3]).toMatchObject({ key: 'c-more', big: '+1', label: '1 more change · Calendar' });
    expect(chips[3]!.href).toBe('/golf/dashboard/calendar');
    expect(chips[0]!.href).toBe(`/golf/dashboard/calendar?date=${all[0]!.date}&event=${all[0]!.eventId}`);
  });

  it('skips a change this device has shown, and one the player cleared with Got it', () => {
    const shown = sinceChips({ ...seen, changes: [all[0]!.changeId] }, [], null, all);
    expect(shown.map((c) => c.changeId)).not.toContain(all[0]!.changeId);
    const cleared = sinceChips(seen, [], null, all, (id) => id === all[1]!.changeId);
    expect(cleared.map((c) => c.changeId)).not.toContain(all[1]!.changeId);
    // A device whose stored value predates the changes list has none seen.
    expect(sinceChips({ rounds: [], event: null }, [], null, all.slice(0, 1))).toHaveLength(1);
  });

  it('puts a cancelled event’s old start struck, with the 24-hour figure kept for that clock', () => {
    const chips = sinceChips(seen, [], null, rows([cancelled]).rows);
    expect(chips[0]).toMatchObject({ big: '1:00', hm: '13:00', struck: true });
  });

  function show(changes: typeof all, marks: MarkEntries = []) {
    return render(
      <ChangeMarksProvider marks={marks}>
        <SinceYouLooked rounds={[]} event={null} changes={changes} onOpenRound={() => {}} />
      </ChangeMarksProvider>,
    );
  }

  afterEach(() => {
    cleanup();
    try {
      localStorage.clear();
    } catch {
      // jsdom always has storage; nothing to clear without it.
    }
  });

  it('renders the rows on the second visit and records them as shown', () => {
    localStorage.setItem('ch.home.seen.v1', JSON.stringify({ rounds: [], event: null, changes: [] }));
    show(all.slice(0, 2));
    const sec = screen.getByRole('region', { name: 'Since you last looked' });
    const items = within(sec).getAllByRole('link');
    expect(items).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('ch.home.seen.v1')!).changes).toEqual(all.slice(0, 2).map((c) => c.changeId));
    cleanup();
    // Shown once, so the next visit lists nothing.
    show(all.slice(0, 2));
    expect(screen.queryByRole('region', { name: 'Since you last looked' })).toBeNull();
  });

  it('renders nothing on the first visit, but still records what it would have shown', () => {
    show(all.slice(0, 1));
    expect(screen.queryByRole('region', { name: 'Since you last looked' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('ch.home.seen.v1')!).changes).toEqual([all[0]!.changeId]);
  });

  it('strikes a cancelled event’s start and leaves the others plain', () => {
    localStorage.setItem('ch.home.seen.v1', JSON.stringify({ rounds: [], event: null, changes: [] }));
    show(rows([cancelled, row()]).rows);
    const sec = screen.getByRole('region', { name: 'Since you last looked' });
    expect(sec.querySelectorAll('s.ch-was')).toHaveLength(1);
  });
});

describe('Home · Up next and the agenda', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
    cleanup();
  });

  function player(over: Partial<ChPlayerHome> = {}) {
    return render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <PlayerHome data={{ ...PREVIEW_PLAYER_HOME, ...over }} now={PREVIEW_HOME_NOW} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );
  }

  it('shows Since you last looked on a player’s phone only when a schedule change is there', () => {
    localStorage.setItem('ch.home.seen.v1', JSON.stringify({ rounds: [], event: null, changes: [] }));
    const none = player({ changes: [] });
    expect(screen.queryByRole('region', { name: 'Since you last looked' })).toBeNull();
    none.unmount();
    player({ changes: rows([row()], null).rows });
    expect(screen.getByRole('region', { name: 'Since you last looked' })).toBeTruthy();
    localStorage.clear();
  });

  it('wears the badge and the struck old value on Up next', () => {
    const { byEvent } = rows([row({ id: PREVIEW_PLAYER_HOME.next!.id })], null);
    const change = byEvent.get(PREVIEW_PLAYER_HOME.next!.id)!;
    expect(change).toBeTruthy();
    const { container } = player({ next: { ...PREVIEW_PLAYER_HOME.next!, change } as never, changes: [], marks: [] });
    expect(container.querySelector('.ch-ph-next s.ch-was, .ch-hm-next s.ch-was')).not.toBeNull();
  });
});

describe('the marks Home hands the page', () => {
  it('builds the same marks as the Calendar for the same rows', () => {
    const fromHome = rows([row()]).byEvent.get('e9')!;
    const fromCalendar = buildChangeMarks([row()], { timeZone: TZ, nowMs: NOW, coachId: 'c1' }).marks.get('e9')!;
    expect(fromHome).toEqual(fromCalendar);
  });
});
