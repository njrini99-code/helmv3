import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * Qualifiers, the premium pass (P009, owner 2026-10-08): an honest Live state (B2, D1, D3), the standings on plates
 * with their movement (A1), rows that move only when the ranks change (B1) and pace beside the total (C2).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const prefs = vi.hoisted(() => ({ showAnimations: true }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: prefs.showAnimations, updatePreferences: vi.fn() }) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/qualifiers' }));
const realtime = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: realtime.channel, removeChannel: realtime.removeChannel }) }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ createGolfQualifier: vi.fn(), setQualifierRoundCourses: vi.fn(), updateGolfQualifierDetails: vi.fn(), updateQualifierStatus: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));

import { chReport } from '../lib/track';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { FEED_START, HIDDEN_LONG_MS, feedOf, feedReduce, useLiveStandings, type ChFeedEvent } from '../screens/qualifiers/live';
import { useRankSlide } from '../screens/qualifiers/rank-slide';
import { bubbleMinRounds, bubbleNote, buildBoard, endDayFor, endedLabel, endedLive, rankOrderChanged, sampleNote, type ChQRound } from '../screens/qualifiers/model';
import { DETAIL_INDEX, PLAYER_ID, previewDetail, previewList } from '../preview/fixtures-qualifiers';
import { ToastProvider } from '../ui/Toast';
import type { ChQDetailSecondary } from '../data/qualifiers';

function wrap(node: ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const fakeWrites = () => ({
  create: vi.fn(),
  saveEdit: vi.fn(),
  setStatus: vi.fn(async () => ({ success: true })),
  courses: vi.fn(async () => []),
  tees: vi.fn(async () => []),
});
const live = () => previewDetail(DETAIL_INDEX.live!, 'coach');
const at = (playerKey: keyof typeof PLAYER_ID) => live().board!.rows.find((r) => r.playerId === PLAYER_ID[playerKey])!;

/** A Realtime channel that hands the test the callbacks the page gave it. */
function openChannel() {
  const handle = { change: () => {}, status: (_s: string) => {} };
  const chan = {
    on: vi.fn((_k: string, _f: unknown, cb: () => void) => {
      handle.change = cb;
      return chan;
    }),
    subscribe: vi.fn((cb?: (s: string) => void) => {
      if (cb) handle.status = cb;
      return chan;
    }),
  };
  realtime.channel.mockReturnValue(chan);
  return { chan, handle };
}

beforeEach(() => {
  realtime.channel.mockReset();
  realtime.removeChannel.mockReset();
  router.refresh.mockClear();
  vi.mocked(chReport).mockClear();
  prefs.showAnimations = true;
});
afterEach(() => cleanup());

describe('P009-B2 an honest Live state', () => {
  const walk = (events: ChFeedEvent[]) => events.reduce(feedReduce, FEED_START);

  it('Live only while the feed is subscribed; an error, a timeout or a close pauses it, and a rejoin is live again', () => {
    expect(feedOf(FEED_START)).toBe('connecting');
    expect(feedOf(walk([{ type: 'channel', status: 'SUBSCRIBED' }]))).toBe('live');
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
      expect(feedOf(walk([{ type: 'channel', status: 'SUBSCRIBED' }, { type: 'channel', status }]))).toBe('paused');
    }
    expect(feedOf(walk([{ type: 'channel', status: 'CHANNEL_ERROR' }, { type: 'channel', status: 'SUBSCRIBED' }]))).toBe('live');
  });

  it('a tab hidden long comes back paused until a fresh read lands; a short look away stays live', () => {
    const on = { type: 'channel', status: 'SUBSCRIBED' } as const;
    expect(feedOf(walk([on, { type: 'hidden', at: 0 }, { type: 'visible', at: 60_000 }]))).toBe('live');
    const slept = walk([on, { type: 'hidden', at: 0 }, { type: 'visible', at: HIDDEN_LONG_MS }]);
    expect(feedOf(slept)).toBe('paused');
    expect(feedOf(feedReduce(slept, { type: 'loaded' }))).toBe('live');
  });

  it('a repeated event keeps the same state, so it never draws the page again', () => {
    const s = walk([{ type: 'channel', status: 'SUBSCRIBED' }]);
    expect(feedReduce(s, { type: 'channel', status: 'SUBSCRIBED' })).toBe(s);
    expect(feedReduce(FEED_START, { type: 'reset' })).toBe(FEED_START);
    expect(feedReduce(s, { type: 'loaded' })).toBe(s);
  });

  it('the hook reports and shows a dropped feed, survives a re-render, ignores the CLOSED its own teardown sends, and Refresh reopens it', () => {
    const first = openChannel();
    const { result, rerender, unmount } = renderHook(({ on }: { on: boolean }) => useLiveStandings('q1', on, 'v1'), { initialProps: { on: true } });
    expect(result.current.feed).toBe('connecting');
    act(() => first.handle.status('SUBSCRIBED'));
    expect(result.current.feed).toBe('live');
    rerender({ on: true });
    expect(result.current.feed).toBe('live');
    expect(realtime.channel).toHaveBeenCalledTimes(1);
    act(() => first.handle.status('CHANNEL_ERROR'));
    expect(result.current.feed).toBe('paused');
    expect(chReport).toHaveBeenCalledWith(expect.objectContaining({ message: 'qualifier realtime channel error' }), { surface: 'qualifiers.live', severity: 'low' });
    // Refresh re-reads the page and, the feed being down, opens it again.
    const second = openChannel();
    act(() => result.current.refresh());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(first.chan);
    expect(realtime.channel).toHaveBeenCalledTimes(2);
    expect(result.current.feed).toBe('connecting');
    // The old channel's CLOSED, sent by its own teardown, says nothing about the new one.
    act(() => first.handle.status('CLOSED'));
    expect(result.current.feed).toBe('connecting');
    act(() => second.handle.status('SUBSCRIBED'));
    expect(result.current.feed).toBe('live');
    rerender({ on: false });
    expect(result.current.feed).toBe('off');
    unmount();
  });

  it('the chip: Live with the time it was read; Paused with the time and Refresh; after the last day the pill says Ended, never Live', () => {
    const readAt = new Date('2026-09-28T16:12:00').getTime();
    const { unmount } = wrap(<QualifierDetail data={live()} writes={fakeWrites()} live={false} feed={{ feed: 'live', updatedAt: readAt }} />);
    expect(document.querySelector('[data-feed="live"]')!.textContent).toBe('Live · updated 4:12 PM');
    unmount();
    const paused = wrap(<QualifierDetail data={live()} writes={fakeWrites()} live={false} feed={{ feed: 'paused', updatedAt: readAt }} />);
    const chip = document.querySelector('[data-feed="paused"]') as HTMLElement;
    expect(chip.textContent).toMatch(/^Paused · standings from 4:12 PM/);
    expect(within(chip).getByRole('button', { name: 'Refresh' })).toBeTruthy();
    // The dot is static and there is no dot at all once it isn't live.
    expect(chip.querySelector('.ch-badge__dot')).toBeNull();
    paused.unmount();
    // Oct 8, a week after its Oct 1 end: 8 entrants × 3 rounds, 13 in.
    wrap(<QualifierDetail data={{ ...live(), today: '2026-10-08' }} writes={fakeWrites()} live={false} feed={{ feed: 'live', updatedAt: readAt }} />);
    expect(document.querySelector('.ch-qf-status')!.textContent).toBe('Ended · 11 rounds outstanding');
    // Said once, by the status pill: the board claims no feed.
    expect(document.querySelector('.ch-qf-feed')).toBeNull();
    expect(screen.queryByText(/^Live/)).toBeNull();
  });

  it('the feed going live while the courses and cards still stream does not strand them: they land when they arrive', async () => {
    const user = userEvent.setup();
    const { handle } = openChannel();
    const { holes, holesError, roundCourses, par, coursesError, ...core } = live();
    let resolve!: (v: ChQDetailSecondary) => void;
    const later = new Promise<ChQDetailSecondary>((r) => (resolve = r));
    await act(async () => {
      wrap(<QualifierDetail data={core} secondary={later} writes={fakeWrites()} />);
    });
    await user.click(screen.getByRole('button', { name: 'Show Jonah Okafor’s scorecards' }));
    act(() => handle.status('SUBSCRIBED'));
    expect(document.querySelector('[data-feed="live"]')).not.toBeNull();
    await act(async () => resolve({ holes, holesError, roundCourses, par, coursesError }));
    expect(await screen.findAllByRole('table', { name: /Round \d scorecard/ })).toHaveLength(2);
  });

  it('D3 ended is a pure rule held against the day where it starts last; left without a day, nothing is reconciled', () => {
    const base = { status: 'in_progress' as const, endDate: '2026-10-01', entrants: 8, numRounds: 3, submitted: 13 };
    expect(endedLive({ ...base, today: '2026-10-01' })).toBeNull();
    expect(endedLive({ ...base, today: '2026-10-02' })).toEqual({ outstanding: 11 });
    expect(endedLive({ ...base, today: undefined })).toBeNull();
    expect(endedLive({ ...base, status: 'completed', today: '2026-10-08' })).toBeNull();
    expect(endedLive({ ...base, submitted: null, today: '2026-10-08' })).toEqual({ outstanding: null });
    expect(endedLabel({ outstanding: null })).toBe('Ended');
    expect(endedLabel({ outstanding: 0 })).toBe('Ended');
    expect(endedLabel({ outstanding: 1 })).toBe('Ended · 1 round outstanding');
    // 11:00 UTC on Oct 2 is still Oct 1 at UTC−12; noon UTC is Oct 2 everywhere.
    expect(endDayFor(new Date('2026-10-02T11:00:00Z'))).toBe('2026-10-01');
    expect(endDayFor(new Date('2026-10-02T12:00:00Z'))).toBe('2026-10-02');
  });

  it('D3 on the list: a live qualifier past its end says Ended on its card; with no day it stays Live', () => {
    const { unmount } = wrap(<QualifiersList data={{ ...previewList('coach', 'all'), today: '2026-10-08' }} />);
    expect(within(document.querySelector('.ch-qf-hero') as HTMLElement).getByText('Ended · 11 rounds outstanding')).toBeTruthy();
    // The year is dropped inside the current season (D11).
    expect(document.querySelector('.ch-qf-hero .ch-qf-meta')!.textContent).toMatch(/Sep 22 – Oct 1(?!,)/);
    unmount();
    wrap(<QualifiersList data={previewList('coach', 'all')} />);
    expect(document.querySelector('.ch-qf-hero .ch-qf-status')!.textContent).toBe('Live');
    expect(document.querySelector('.ch-qf-hero .ch-qf-meta')!.textContent).toMatch(/Sep 22, 2026 – Oct 1, 2026/);
  });
});

describe('P009-A1 standings on hand-hung plates', () => {
  it('movement is against the board before the latest round: Jonah up 2, Ava down 1, Priya down 3, Sofia unmoved', () => {
    expect(at('jonah').move).toBe(2);
    expect(at('ava').move).toBe(-1);
    expect(at('priya').move).toBe(-3);
    expect(at('sofia').move).toBe(0);
    // One round in: nothing to compare with.
    const e = (id: string) => ({ playerId: id, name: id, classYear: null });
    const rd = (playerId: string, number: number, toPar: number): ChQRound => ({ id: `${playerId}${number}`, playerId, number, total: 72 + toPar, toPar, date: '2026-09-22', course: null, holesPlayed: 18 });
    const one = buildBoard({ entrants: [e('a'), e('b')], rounds: [rd('a', 1, 0), rd('b', 1, 1)], squad: 1, picks: 0, status: 'in_progress', selectionState: 'scoring', selections: null, numRounds: 3 });
    expect(one.rows.map((r) => r.move)).toEqual([null, null]);
    // A player first ranked in the latest round has no movement.
    const late = buildBoard({ entrants: [e('a'), e('b')], rounds: [rd('a', 1, 0), rd('a', 2, 0), rd('b', 2, -2)], squad: 1, picks: 0, status: 'in_progress', selectionState: 'scoring', selections: null, numRounds: 3 });
    expect(late.rows.map((r) => [r.playerId, r.move])).toEqual([
      ['b', null],
      ['a', -1],
    ]);
  });

  it('desktop: Pos, Player, Thru, Avg, Total, To par, Status in one table; to par on a plate, red only under par; the glyph is read as words', () => {
    wrap(<QualifierDetail data={live()} writes={fakeWrites()} live={false} />);
    const table = screen.getByRole('table', { name: 'Leaderboard' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Pos', 'Player', 'Thru', 'Avg', 'Total', 'To par', 'Status', 'Scorecards']);
    const row = (name: string) => within(table).getByRole('rowheader', { name: new RegExp(name) }).closest('[role="row"]') as HTMLElement;
    expect(row('Sofia').querySelector('.ch-qf-plate.is-under')!.textContent).toBe('−3');
    expect(row('Jonah').querySelector('.ch-qf-plate')!.className).not.toMatch(/is-under/);
    expect(row('Jonah').querySelector('.ch-qf-move.is-gain')!.textContent).toBe('▲2, up 2 since the last round');
    expect(row('Priya').querySelector('.ch-qf-move.is-loss')!.textContent).toBe('▼3, down 3 since the last round');
    expect(row('Jonah').textContent).toMatch(/2\/3.*74\.0.*148/);
  });

  it('a tie is "T3" with its T set small and raised', () => {
    const e = (id: string) => ({ playerId: id, name: id.toUpperCase(), classYear: null });
    const rd = (playerId: string, toPar: number): ChQRound => ({ id: playerId, playerId, number: 1, total: 72 + toPar, toPar, date: '2026-09-22', course: null, holesPlayed: 18 });
    const board = buildBoard({ entrants: ['a', 'b', 'c'].map(e), rounds: [rd('a', -1), rd('b', 0), rd('c', 0)], squad: 3, picks: 0, status: 'in_progress', selectionState: 'scoring', selections: null, numRounds: 1 });
    wrap(<QualifierDetail data={{ ...live(), board, entrants: 3 }} writes={fakeWrites()} live={false} />);
    const t = [...document.querySelectorAll('.ch-qf-pos__t')];
    expect(t).toHaveLength(2);
    expect(t[0]!.parentElement!.textContent).toBe('T2');
  });

  it('phone: one header for the board, then a row a player with Pos, Player, the plate and Thru; no labels repeated in the rows', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      wrap(<QualifierDetail data={live()} writes={fakeWrites()} live={false} />);
      const heads = document.querySelectorAll('.ch-qfm-lbhead');
      expect(heads).toHaveLength(1);
      expect([...heads[0]!.children].map((c) => c.textContent)).toEqual(['Pos', 'Player', 'To par', 'Thru']);
      expect(heads[0]!.getAttribute('aria-hidden')).toBe('true');
      const rows = [...document.querySelectorAll('.ch-qfm-lb__row')];
      expect(rows.length).toBe(8);
      for (const r of rows) expect(r.textContent).not.toMatch(/Rounds|Avg|Total/);
      const luca = screen.getByRole('button', { name: /^Luca Ferraro, 6, \+8, 1 of 3 rounds\. Show their rounds$/ });
      expect(luca.querySelector('.ch-qf-plate')!.textContent).toBe('+8');
      expect(luca.querySelector('.ch-qf-thin')!.textContent).toBe('1 of 3 rounds');
    } finally {
      window.matchMedia = real;
    }
  });

  it('the list’s live card: the leaders on plates with their movement', () => {
    wrap(<QualifiersList data={previewList('coach', 'all')} />);
    const lead = document.querySelector('.ch-qf-lead') as HTMLElement;
    expect(lead.querySelectorAll('.ch-qf-plate.is-card').length).toBe(5);
    expect(lead.querySelector('.ch-qf-move.is-gain')).not.toBeNull();
  });
});

describe('P009-C2 pace beside the total', () => {
  it('the Bubble needs at least half the scheduled rounds in: Luca on one of three is not framed as contending; Eli on two is', () => {
    expect([1, 2, 3, 4, 5].map(bubbleMinRounds)).toEqual([1, 1, 2, 2, 3]);
    expect(at('luca').state).toBeNull();
    expect(at('eli').state).toBe('bubble');
    // The ranking itself is unchanged: Luca still stands 6th, above Priya.
    expect([at('luca').position, at('priya').position]).toEqual([6, 7]);
    expect(bubbleNote(3, 'in_progress')).toBe(' The bubble needs 2 of 3 rounds in.');
    expect(bubbleNote(1, 'in_progress')).toBe('');
    expect(bubbleNote(3, 'completed')).toBe('');
  });

  it('a row with fewer rounds in than the most anyone has carries "1 of 3 rounds"; a row that kept pace carries nothing', () => {
    const b = live().board!;
    expect(sampleNote(at('luca'), b, 3)).toBe('1 of 3 rounds');
    expect(sampleNote(at('priya'), b, 3)).toBeNull();
  });
});

describe('P009-B1 rows move only when the standings change', () => {
  it('the decision: only a changed ranked order, never a first draw or a refresh that moved scores alone', () => {
    expect(rankOrderChanged(null, ['a', 'b'])).toBe(false);
    expect(rankOrderChanged(['a', 'b'], ['a', 'b'])).toBe(false);
    expect(rankOrderChanged(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(rankOrderChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(rankOrderChanged(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
  });

  it('the hook slides on a changed order only, and not with Animations off, a tray or sheet open, a dialog up, or mid-scroll', () => {
    const { result, rerender } = renderHook(({ order, held }: { order: string[]; held: boolean }) => useRankSlide(order, held), { initialProps: { order: ['a', 'b'], held: false } });
    expect(result.current).toBe(false);
    rerender({ order: ['a', 'b'], held: false });
    expect(result.current).toBe(false);
    rerender({ order: ['b', 'a'], held: false });
    expect(result.current).toBe(true);
    // Drawn now: the same order again is not a change.
    rerender({ order: ['b', 'a'], held: false });
    expect(result.current).toBe(false);
    rerender({ order: ['a', 'b'], held: true });
    expect(result.current).toBe(false);
    const dialog = document.body.appendChild(Object.assign(document.createElement('div'), { role: 'dialog' }));
    dialog.setAttribute('role', 'dialog');
    rerender({ order: ['b', 'a'], held: false });
    expect(result.current).toBe(false);
    dialog.remove();
    window.dispatchEvent(new Event('scroll'));
    rerender({ order: ['a', 'b'], held: false });
    expect(result.current).toBe(false);
  });

  it('with Animations off the rows never slide', () => {
    prefs.showAnimations = false;
    const { result, rerender } = renderHook(({ order }: { order: string[] }) => useRankSlide(order, false), { initialProps: { order: ['a', 'b'] } });
    rerender({ order: ['b', 'a'] });
    expect(result.current).toBe(false);
  });
});
