import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 on the tournaments page (P016): the desk's tournament menu (Cancel or Restore tournament, Stop tracking), the
 * season home's first run, Set up from calendar, the next-season fold, "Set up today" and the arrival wash. Catalog:
 * CH-16050 to CH-16053, CH-16253, CH-16352, CH-16550, CH-16551, CH-16650, CH-16850.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const t = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), cancel: vi.fn(), untrack: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-calendar', () => ({ createTournamentFromCalendar: t.create, updateTournamentRound: t.update, setTournamentCancelled: t.cancel, untrackTournament: t.untrack }));
const rt = vi.hoisted(() => ({ handler: null as null | ((p: unknown) => void), removeChannel: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const ch = {
        on: (_e: string, _f: unknown, h: (p: unknown) => void) => ((rt.handler = h), ch),
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: rt.removeChannel,
  }),
}));

import { tourFixture } from '../preview/fixtures-tournaments';
import { TournamentsHome } from '../screens/tournaments/TournamentsHome';
import { DeskTrackMenu, deskTrackToast, stopTrackingBlock } from '../screens/tournaments/track-actions';
import { setupGroups, titleStem } from '../screens/tournaments/setup-groups';
import { isTournamentChange } from '../screens/tournaments/live';
import { refusalNotice } from '../screens/tournaments/fields/refusals';
import { ToastProvider } from '../ui/Toast';
import type { ChTourEvent, ChTourHomeData, ChTourTrack } from '../screens/tournaments/types';
import './dialog-polyfill';

const TID = '00000000-0000-4000-8000-0000000000f1';
const track = (over: Partial<ChTourTrack> = {}): ChTourTrack => ({ version: 7, cancelled: false, official: false, scoredRound: null, entries: 3, ...over });
const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
const desk = (tr: ChTourTrack | null = track()) =>
  render(
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <DeskTrackMenu tournamentId={TID} name="Pinehurst Invitational" track={tr} />
      </div>
    </ToastProvider>,
  );
const openMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Tournament actions' }));
  return screen.findByRole('menu');
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('P-5 desk: the tournament menu', () => {
  it('CH-16050, CH-16051, CH-16052: what each write says', () => {
    expect(deskTrackToast('untracked', 'Pinehurst Invitational')).toEqual({ code: 'CH-16050', title: 'Pinehurst Invitational is no longer tracked. Its calendar entries stay.' });
    expect(deskTrackToast('cancelled', 'Pinehurst Invitational')).toEqual({ code: 'CH-16051', title: 'Pinehurst Invitational is cancelled' });
    expect(deskTrackToast('restored', 'Pinehurst Invitational')).toEqual({ code: 'CH-16052', title: 'Pinehurst Invitational is back on the calendar' });
  });

  it('CH-16053: stopping tracking of an official tournament is refused in its own words', () => {
    expect(refusalNotice('tournament_official', { save: 'untrack' })).toEqual({ code: 'CH-16053', text: 'This tournament’s results are official, so it can’t stop being tracked.' });
  });

  it('CH-16551: Cancel tournament asks, shows at once, and writes only when the toast goes; Undo sends nothing', async () => {
    t.cancel.mockResolvedValue({ success: true, data: { version: 8, changedEventIds: [] } });
    desk();
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Cancel tournament' }));
    const dlg = await screen.findByRole('dialog', { name: 'Cancel Pinehurst Invitational?' });
    expect(code('CH-16551')).not.toBeNull();
    expect(dlg.textContent).toMatch(/All 3 rounds are struck through for players\. Nothing is deleted, so you can restore it\./);
    fireEvent.change(within(dlg).getByLabelText('Reason · optional'), { target: { value: 'Frost' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel tournament' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    const toast = await waitFor(() => code('CH-16051') as HTMLElement);
    expect(t.cancel).not.toHaveBeenCalled();
    // Held: the menu already offers Restore.
    expect(within(await openMenu()).getByRole('menuitem', { name: 'Restore tournament' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(t.cancel).toHaveBeenCalledWith(TID, null, true, 'Frost', 7));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('Undo on CH-16051 sends nothing', async () => {
    desk();
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Cancel tournament' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Cancel Pinehurst Invitational?' })).getByRole('button', { name: 'Cancel tournament' }));
    const toast = await waitFor(() => code('CH-16051') as HTMLElement);
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(within(await openMenu()).getByRole('menuitem', { name: 'Cancel tournament' })).toBeTruthy();
    expect(t.cancel).not.toHaveBeenCalled();
  });

  it('Restore tournament writes at once (CH-16052)', async () => {
    t.cancel.mockResolvedValue({ success: true, data: { version: 8, changedEventIds: [] } });
    desk(track({ cancelled: true }));
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Restore tournament' }));
    await waitFor(() => expect(t.cancel).toHaveBeenCalledWith(TID, null, false, null, 7));
    expect((await waitFor(() => code('CH-16052') as HTMLElement)).textContent).toMatch(/Pinehurst Invitational is back on the calendar/);
  });

  it('CH-16550: Stop tracking asks, writes, says so (CH-16050) and goes to the season home', async () => {
    t.untrack.mockResolvedValue({ success: true, data: null });
    desk();
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Stop tracking' }));
    const dlg = await screen.findByRole('dialog', { name: 'Stop tracking Pinehurst Invitational?' });
    expect(code('CH-16550')).not.toBeNull();
    expect(dlg.textContent).toMatch(/Its 3 calendar entries stay, so players still see the days\. The lineup, tee times and notes for it are removed\./);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Stop tracking' }));
    await waitFor(() => expect(t.untrack).toHaveBeenCalledWith(TID, 7));
    await waitFor(() => expect(code('CH-16050')).not.toBeNull());
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/tournaments');
  });

  it('a scored or official tournament stays tracked: the dialog says why, with only Close', async () => {
    expect(stopTrackingBlock(track({ scoredRound: 1 }))).toBe('Scores are entered for R1, so this tournament stays tracked.');
    expect(stopTrackingBlock(track({ official: true }))).toBe('The results are official, so this tournament stays tracked.');
    expect(stopTrackingBlock(track())).toBeNull();
    desk(track({ scoredRound: 1 }));
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Stop tracking' }));
    const dlg = await screen.findByRole('dialog', { name: 'Pinehurst Invitational stays tracked' });
    expect(within(dlg).queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    expect(within(dlg).getAllByRole('button', { name: 'Close' }).some((b) => b.textContent === 'Close')).toBe(true);
  });

  it('a refusal keeps the tournament and says why (round has scores, CH-6051)', async () => {
    t.untrack.mockResolvedValue({ success: false, code: 'round_has_scores', error: 'round_has_scores' });
    desk();
    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Stop tracking' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Stop tracking Pinehurst Invitational?' })).getByRole('button', { name: 'Stop tracking' }));
    await waitFor(() => expect(code('CH-6051')?.textContent).toMatch(/Scores are entered for this tournament, so it stays tracked\./));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('no track data, no menu', () => {
    desk(null);
    expect(screen.queryByRole('button', { name: 'Tournament actions' })).toBeNull();
  });
});

describe('P-5 season home', () => {
  const ready = tourFixture('ready').home;
  const empty = tourFixture('empty').home;
  const draw = (data: ChTourHomeData, live = false) => render(<TournamentsHome data={data} load="ready" phone={false} live={live} />).container;

  it('groups untracked calendar tournaments by name over consecutive days', () => {
    expect(titleStem('Fall Classic · R2')).toBe('Fall Classic');
    expect(titleStem('Fall Classic Round 3')).toBe('Fall Classic');
    expect(titleStem('Fall Classic Day 1')).toBe('Fall Classic');
    const g = setupGroups([
      { id: 'a', title: 'Fall Classic · R1', date: '2026-10-02' },
      { id: 'b', title: 'Fall Classic · R2', date: '2026-10-03' },
      { id: 'c', title: 'Fall Classic · R3', date: '2026-10-04' },
      { id: 'd', title: 'Wolfpack Classic', date: '2026-11-01' },
      { id: 'e', title: 'Fall Classic · R1', date: '2026-12-10' },
    ]);
    expect(g.map((x) => [x.title, x.eventIds])).toEqual([
      ['Fall Classic · R1', ['e']],
      ['Wolfpack Classic', ['d']],
      ['Fall Classic', ['a', 'b', 'c']],
    ]);
  });

  it('CH-16352: the first run starts on the calendar, and points at untracked tournaments when there are some', () => {
    let c = draw(empty);
    const first = c.querySelector('[data-ch-code="CH-16352"]') as HTMLElement;
    expect(first.textContent).toMatch(/Your season starts on the calendar/);
    expect(within(first).getByRole('link', { name: 'Add a tournament' })).toHaveAttribute('href', '/golf/dashboard/calendar?new=1&type=tournament');
    expect(within(first).getByRole('link', { name: 'Plan from here instead' })).toBeTruthy();
    cleanup();
    c = draw({ ...empty, untracked: [{ eventIds: ['x1', 'x2'], title: 'Fall Classic', first: '2026-10-02', last: '2026-10-03' }] });
    expect(within(c.querySelector('[data-ch-code="CH-16352"]') as HTMLElement).getByRole('link', { name: 'Set up from calendar (1)' })).toHaveAttribute('href', '#ch-tour-home-setup-t');
    const row = within(c.querySelector('#ch-tour-home-setup-t')!.closest('section') as HTMLElement).getByRole('link', { name: /^Set up Fall Classic, / });
    expect(row).toHaveAttribute('href', '/golf/dashboard/calendar?event=x1&setup=1');
    expect(row.textContent).toMatch(/2 calendar entries/);
  });

  it('CH-16253: a failed untracked read says so in place; the rest of the home stands', () => {
    const c = draw({ ...ready, untracked: [], errors: { ...ready.errors, untracked: true } });
    expect(c.querySelector('[data-ch-code="CH-16253"]')?.textContent).toMatch(/Couldn’t load your tournaments(?!\.)/);
    expect(c.querySelector('.ch-tour-home-feat')).not.toBeNull();
  });

  it('next season folds at the end of the ledger, and opens in place', () => {
    const up = ready.events.filter((e) => e.status !== 'complete').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const later: ChTourEvent = { ...up[up.length - 1]!, id: 'next-1', name: 'Spring Opener', seasonId: '2027-28', startDate: '2027-09-10', endDate: '2027-09-11' };
    const c = draw({ ...ready, events: [...ready.events, later] });
    const fold = within(c).getByRole('button', { name: /^Next season · 2027–28 \(1\)$/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(c).queryByText('Spring Opener')).toBeNull();
    fireEvent.click(fold);
    expect(within(c).getByText('Spring Opener')).toBeTruthy();
  });

  it('CH-16650, CH-16850: a tournament made today says so on load; one that arrives while open is washed and said once', async () => {
    const up = ready.events.filter((e) => e.status !== 'complete').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const base = up[up.length - 1]!;
    const made: ChTourEvent = { ...base, id: 'made-1', name: 'Pinehurst Invitational', startDate: base.startDate, createdAt: ready.now };
    const { container, rerender } = render(<TournamentsHome data={{ ...ready, events: [...ready.events, made] }} load="ready" phone={false} />);
    expect(container.textContent).toMatch(/Set up today/);
    expect(container.querySelector('.ch-tour-changed')).toBeNull();
    const arrived: ChTourEvent = { ...base, id: 'arrived-1', name: 'Wolfpack Classic', startDate: base.startDate };
    rerender(<TournamentsHome data={{ ...ready, events: [...ready.events, made, arrived] }} load="ready" phone={false} />);
    await waitFor(() => expect(container.querySelector('[data-ch-code="CH-16850"]')?.textContent).toBe('Wolfpack Classic added to your season.'));
    expect(container.querySelectorAll('.ch-tour-changed').length).toBe(1);
  });

  it('follows the calendar: a tournament change re-reads after 800 ms; other events don’t', () => {
    expect(isTournamentChange({ new: { event_type: 'tournament' } })).toBe(true);
    expect(isTournamentChange({ new: { event_type: 'practice' }, old: { event_type: 'tournament' } })).toBe(true);
    expect(isTournamentChange({ new: { event_type: 'practice' }, old: { event_type: 'practice' } })).toBe(false);
    vi.useFakeTimers();
    try {
      draw(ready, true);
      act(() => rt.handler?.({ new: { event_type: 'practice' } }));
      act(() => vi.advanceTimersByTime(900));
      expect(router.refresh).not.toHaveBeenCalled();
      act(() => rt.handler?.({ new: { event_type: 'tournament' } }));
      act(() => vi.advanceTimersByTime(900));
      expect(router.refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
