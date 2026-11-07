import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { LIVE_REFRESH_MS, LiveRound } from '../screens/tournaments/LiveRound';
import type { ChTourLiveSnapshot, ChTourLoad, ChTourRoundStatus } from '../screens/tournaments/types';
import './dialog-polyfill';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: nav.refresh, push: nav.push, replace: vi.fn() }) }));
const enter = vi.hoisted(() => vi.fn());
const setStatus = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments', () => ({ enterTournamentScore: enter, setTournamentRoundStatus: setStatus }));
const hole = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: hole }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast, useDelayedToast: () => () => () => {} }));

beforeEach(() => {
  for (const m of [nav.refresh, nav.push, enter, setStatus, toast, hole]) m.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The live round (P016, 5L). Catalog: CH-16201 and CH-16401 (page states), CH-16271 (some live scores didn’t load),
 * CH-16370 (nobody is in this round yet), CH-16570 (finish the round?), CH-16070 (a score fails to save), CH-16071 (the
 * round’s state fails to change), CH-16601 (a changed value is washed).
 */
const fx = tourFixture('ready').live;
const withStatus = (status: ChTourRoundStatus): ChTourLiveSnapshot => ({ ...fx, round: { ...fx.round, status } });
const draw = (d: ChTourLiveSnapshot = fx, opts: { phone?: boolean; load?: ChTourLoad } = {}) => render(<LiveRound data={d} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
const lane = (id: string) => document.querySelector(`[data-ch-lane="${id}"]`) as HTMLElement;

describe('LiveRound', () => {
  it('opens on the round with the counting line and a lane per player', () => {
    const c = draw();
    expect(c.querySelector('[data-ch-tour-view="live"] h1')?.textContent).toBe(`Round ${fx.round.number}`);
    expect(c.querySelector('[data-ch-live-team]')).toHaveAttribute('data-ch-live-team', fx.team.kind);
    expect(c.querySelectorAll('[data-ch-lane]')).toHaveLength(fx.lanes.length);
    expect(c.querySelector('[data-ch-live-asof]')?.textContent).toMatch(/As of/);
    // The status is a word, not only a colour.
    expect(c.querySelector('[data-ch-trust="live"]')).not.toBeNull();
  });

  it('says who counts and who does not, in words, and keeps individuals apart', () => {
    const c = draw();
    const counted = fx.lanes.find((l) => l.count === 'counted')!;
    expect(within(lane(counted.playerId)).getByText('Counting')).toBeInTheDocument();
    const dropped = fx.lanes.find((l) => l.count === 'dropped');
    if (dropped) expect(within(lane(dropped.playerId)).getByText('Not counting')).toBeInTheDocument();
    const ind = fx.lanes.find((l) => l.role === 'individual');
    if (ind) expect(c.querySelector('#ch-tour-live-ind-t')?.textContent).toBe('Individuals');
  });

  it('Enter score writes the round total for that player and that round, then re-reads', async () => {
    enter.mockResolvedValue({ success: true, data: null });
    draw();
    const l = fx.lanes[0]!;
    fireEvent.click(within(lane(l.playerId)).getByRole('button', { name: /score for/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Round total'), { target: { value: '71' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save score' }));
    await waitFor(() => expect(enter).toHaveBeenCalledWith(fx.round.roundEventId, l.playerId, expect.objectContaining({ total: 71, status: 'ok' })));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it('says what is wrong with a score before sending it', async () => {
    draw();
    fireEvent.click(within(lane(fx.lanes[0]!.playerId)).getByRole('button', { name: /score for/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Round total'), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save score' }));
    await waitFor(() => expect(within(dialog).getByText('Enter the round total, from 20 to 200.')).toBeInTheDocument());
    expect(enter).not.toHaveBeenCalled();
  });

  it('a refused score keeps the sheet open and says why under its own code (CH-16070)', async () => {
    enter.mockResolvedValue({ success: false, error: 'That player isn’t in this round’s lineup.', code: 'not_in_lineup' });
    draw();
    fireEvent.click(within(lane(fx.lanes[0]!.playerId)).getByRole('button', { name: /score for/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Round total'), { target: { value: '71' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save score' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16070', body: 'That player isn’t in this round’s lineup.' })));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Score by hole opens the card, and a tap on the strokes saves that hole for that player and moves on (CH-16072 when it fails)', async () => {
    hole.mockResolvedValue({ success: true, data: { roundId: 'g1', thru: 1 } });
    draw();
    const l = fx.lanes.find((x) => x.holes.every((h) => h.strokes == null)) ?? fx.lanes[0]!;
    fireEvent.click(within(lane(l.playerId)).getByRole('button', { name: /by hole/ }));
    const dialog = await screen.findByRole('dialog');
    const firstOpen = l.holes.find((h) => h.strokes == null)!;
    const par = fx.course.holes.find((h) => h.n === firstOpen.n)!.par;
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${par}\\s*Par$`) }));
    await waitFor(() => expect(hole).toHaveBeenCalledWith({ roundEventId: fx.round.roundEventId, playerId: l.playerId, date: fx.round.date, hole: firstOpen.n, par, strokes: par }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: new RegExp(`Hole ${firstOpen.n}, par ${par}, ${par}$`) })).toBeInTheDocument());
    hole.mockResolvedValue({ success: false, error: 'That player isn’t in this round’s lineup.', code: 'not_in_lineup' });
    // The sheet moved on to the next unscored hole, whose par is its own.
    const next = l.holes.find((h) => h.n > firstOpen.n && h.strokes == null)!;
    const nextPar = fx.course.holes.find((h) => h.n === next.n)!.par;
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${nextPar + 1}\\s*Bogey$`) }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16072', body: 'That player isn’t in this round’s lineup.' })));
  });

  it('offers no hole-by-hole scoring without the course’s holes (totals still work)', () => {
    draw({ ...fx, course: { ...fx.course, holes: [] } });
    expect(screen.queryAllByRole('button', { name: /by hole/ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /score for/ }).length).toBeGreaterThan(0);
  });

  it('a withdrawal needs no total', async () => {
    enter.mockResolvedValue({ success: true, data: null });
    draw();
    fireEvent.click(within(lane(fx.lanes[0]!.playerId)).getByRole('button', { name: /score for/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('How the round ended'), { target: { value: 'wd' } });
    fireEvent.change(within(dialog).getByLabelText(/Withdrew after hole/), { target: { value: '11' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save score' }));
    await waitFor(() => expect(enter).toHaveBeenCalledWith(fx.round.roundEventId, fx.lanes[0]!.playerId, expect.objectContaining({ total: null, status: 'wd', wdAfterHole: 11 })));
  });

  it('a live round offers Finish round (asking first, CH-16570) and Suspend play', async () => {
    setStatus.mockResolvedValue({ success: true, data: null });
    draw(withStatus('live'));
    fireEvent.click(screen.getByRole('button', { name: 'Finish round' }));
    const dialog = await screen.findByRole('dialog');
    expect(setStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish round' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(fx.round.roundEventId, 'final', null));
    expect(screen.getByRole('button', { name: 'Suspend play' })).toBeInTheDocument();
  });

  it('suspends for weather from the menu, and resumes', async () => {
    setStatus.mockResolvedValue({ success: true, data: null });
    draw(withStatus('live'));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend play' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend for weather' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(fx.round.roundEventId, 'suspended_weather', null));
    cleanup();
    setStatus.mockClear();
    draw(withStatus('suspended'));
    fireEvent.click(screen.getByRole('button', { name: 'Resume play' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(fx.round.roundEventId, 'live', null));
  });

  it('starts an upcoming round, and a refused change says why (CH-16071)', async () => {
    setStatus.mockResolvedValue({ success: false, error: 'Start or finish the rounds in order.', code: 'round_order' });
    draw(withStatus('upcoming'));
    fireEvent.click(screen.getByRole('button', { name: 'Go live' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16071', title: 'Couldn’t start the round', body: 'Start or finish the rounds in order.' })));
  });

  it('a final round has no round keys, only a way back to the event; an official one cannot be edited', () => {
    draw(withStatus('final'));
    expect(screen.queryByRole('button', { name: 'Finish round' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the event' })).toBeInTheDocument();
    cleanup();
    draw(withStatus('official'));
    expect(screen.queryAllByRole('button', { name: /score for/ })).toHaveLength(0);
  });

  it('re-reads on a timer while the round is in play, and not when it is final', () => {
    vi.useFakeTimers();
    draw(withStatus('live'));
    act(() => {
      vi.advanceTimersByTime(LIVE_REFRESH_MS + 1);
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    nav.refresh.mockClear();
    draw(withStatus('final'));
    act(() => {
      vi.advanceTimersByTime(LIVE_REFRESH_MS * 3);
    });
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('changes a value in place with the wash when the team line moves (CH-16601), never on first paint', () => {
    const { rerender } = render(<LiveRound data={fx} load="ready" phone={false} />);
    expect(document.querySelector('.ch-tour-changed')).toBeNull();
    rerender(<LiveRound data={{ ...fx, team: { ...fx.team, toPar: (fx.team.toPar ?? 0) - 1 } }} load="ready" phone={false} />);
    expect(document.querySelector('.ch-tour-live-team__v')).toHaveClass('ch-tour-changed');
  });

  it('names the other rounds of the event and goes to one (R2)', () => {
    draw({ ...fx, event: { ...fx.event, rounds: [fx.round, { ...fx.round, number: 2, roundEventId: 're-2', status: 'upcoming' }] } });
    fireEvent.click(screen.getByRole('radio', { name: 'R2' }));
    expect(nav.push).toHaveBeenCalledWith(expect.stringContaining('round=2'));
  });

  it('says nobody is in the round when there are no lanes (CH-16370), pointing to the lineup', () => {
    const c = draw({ ...fx, lanes: [], team: { kind: 'none', total: null, toPar: null, counting: [], dropped: [], tiedAtBoundary: [] } });
    expect(c.querySelector('[data-ch-code="CH-16370"]')?.textContent).toContain('Nobody is in this round yet');
    expect(within(c).getByRole('link', { name: 'Open the lineup' })).toHaveAttribute('href', expect.stringContaining('/lineup'));
  });

  it('says some live scores did not load (CH-16271) and keeps the lanes', () => {
    const c = draw({ ...fx, errors: { holes: true } });
    expect(c.querySelector('[data-ch-code="CH-16271"]')?.textContent).toContain('Some live scores didn’t load');
    expect(c.querySelectorAll('[data-ch-lane]')).toHaveLength(fx.lanes.length);
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('LiveRound states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401) and the page failure (CH-16201)', () => {
    const loading = draw(fx, { load: 'loading', phone }).querySelector('[data-ch-tour-view="live"]');
    expect(loading).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    cleanup();
    expect(draw(fx, { load: 'failed', phone }).querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
  });

  it('draws the lanes with 44px keys on the phone and portraits on desktop', () => {
    const c = draw(fx, { phone });
    expect(c.querySelector('.ch-tour')?.classList.contains('is-phone')).toBe(phone);
    expect(c.querySelectorAll('.ch-avatar').length > 0).toBe(!phone);
  });
});
