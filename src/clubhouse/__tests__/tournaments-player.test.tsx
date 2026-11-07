import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { PlayerEvent } from '../screens/tournaments/PlayerEvent';
import type { ChTourLoad, ChTourPlayerData } from '../screens/tournaments/types';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: nav.refresh, push: nav.push, replace: vi.fn() }) }));
const reflect = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments-player', () => ({ saveTournamentReflection: reflect }));
const hole = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: hole }));
import './dialog-polyfill';
const toast = vi.hoisted(() => vi.fn());
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast, useDelayedToast: () => () => () => {} }));

beforeEach(() => {
  for (const m of [nav.refresh, nav.push, reflect, toast, hole]) m.mockReset();
});
afterEach(cleanup);

/**
 * The player’s Tournaments (P016, 5.11). Catalog: CH-16201 and CH-16401 (page states), CH-16290 (the events didn’t load),
 * CH-16291 (the coach’s notes didn’t load), CH-16292 (the reflection didn’t load), CH-16390 (no tournaments yet), CH-16391
 * (no rounds set yet), CH-16392 (nothing shared yet), CH-16393 (the team’s result is not shown here), CH-16092 (the
 * reflection fails to save). The fixture is Jonah: the list, and Oakmont (played, a shared note, a saved reflection).
 */
const fx = tourFixture('ready').player;
const oakmont = fx.events.e33!;
const draw = (d: ChTourPlayerData, opts: { phone?: boolean; load?: ChTourLoad } = {}) => render(<PlayerEvent data={d} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
const unwritten = (d: ChTourPlayerData): ChTourPlayerData => ({ ...d, event: { ...d.event!, reflection: { state: 'unwritten', body: '', updatedAt: null } } });

describe('PlayerEvent, the list', () => {
  it('lists the season’s events, coming up first, each a link to the event with the player’s own line', () => {
    const c = draw(fx.list);
    expect(c.querySelector('[data-ch-tour-view="player"] h1')?.textContent).toBe('Tournaments');
    const rows = c.querySelectorAll('.ch-tour-pl-row');
    expect(rows).toHaveLength(fx.list.list.length);
    const first = fx.list.list[0]!;
    expect(rows[0]).toHaveAttribute('href', `/golf/dashboard/tournaments/${first.eventId}`);
    const played = fx.list.list.find((x) => x.mine);
    if (played) expect(c.textContent).toMatch(new RegExp(`${played.mine!.total} in ${played.mine!.rounds} round`));
    // Teammates and the team are not on the player’s list: no place, no counting.
    expect(c.textContent).not.toMatch(/counted|dropped/i);
  });

  it('says there are no tournaments yet (CH-16390), never a failure', () => {
    const c = draw({ ...fx.list, list: [] });
    expect(c.querySelector('[data-ch-code="CH-16390"]')?.textContent).toContain('No tournaments yet');
    expect(c.querySelector('[data-ch-code="CH-16290"]')).toBeNull();
  });

  it('says the events did not load (CH-16290), never an empty list', () => {
    const c = draw({ ...fx.list, list: [], errors: { events: true } });
    expect(c.querySelector('[data-ch-code="CH-16290"]')?.textContent).toContain('The events didn’t load');
    expect(c.querySelector('[data-ch-code="CH-16390"]')).toBeNull();
  });
});

describe('PlayerEvent, an event', () => {
  it('shows the days, the player’s own score for each round, and what their coach shared', () => {
    const c = draw(oakmont);
    expect(c.querySelector('h1')?.textContent).toBe(oakmont.event!.event.name);
    const rounds = c.querySelectorAll('.ch-tour-pl-round');
    expect(rounds).toHaveLength(oakmont.event!.event.rounds.length);
    const scored = oakmont.event!.event.playerRounds.find((p) => p.total != null);
    if (scored) expect(c.querySelector(`[data-ch-round="${scored.roundNumber}"]`)?.textContent).toContain(String(scored.total));
    expect(c.querySelector('.ch-tour-pl-note')?.textContent).toContain('Par 3 club selection');
    expect(c.querySelector('[data-ch-code="CH-16393"]')).not.toBeNull();
  });

  it('draws the reveal when it is open to the player, and a plain line when it is not', () => {
    expect(draw(oakmont).querySelector('[data-ch-reveal]')?.getAttribute('data-ch-reveal')).not.toBe('closed');
    cleanup();
    const closed = draw({ ...oakmont, event: { ...oakmont.event!, reveal: null } });
    expect(closed.querySelector('[data-ch-reveal="closed"]')?.textContent).toMatch(/lineup/);
    expect(closed.querySelector('[data-ch-reveal="closed"]')?.textContent).toContain('Your spot isn’t shown here yet');
  });

  it('says, round by round, whether the player’s score counted (decided only when the round is final)', () => {
    const e = oakmont.event!;
    const reveal = { ...e.reveal!, status: 'lineup' as const, counting: [{ roundNumber: 1, state: 'counted' as const }, { roundNumber: 2, state: 'dropped' as const }, { roundNumber: 3, state: 'pending' as const }] };
    const c = draw({ ...oakmont, event: { ...e, reveal } });
    expect(c.querySelector('[data-ch-count-round="1"]')?.textContent).toContain('Your score counted');
    expect(c.querySelector('[data-ch-count-round="2"]')?.textContent).toContain('Your score did not count');
    expect(c.querySelector('[data-ch-count-round="3"]')?.textContent).toContain('Decided when the round is final');
    cleanup();
    const alt = draw({ ...oakmont, event: { ...e, reveal: { ...reveal, status: 'alternate', counting: [{ roundNumber: 1, state: 'not_playing' }] } } });
    expect(alt.querySelector('[data-ch-count-round]')).toBeNull();
    expect(alt.querySelector('[data-ch-reveal="alternate"]')?.textContent).toContain('You’re the alternate');
  });

  it('says the spot did not load (CH-16293) instead of "not published"', () => {
    const c = draw({ ...oakmont, event: { ...oakmont.event!, reveal: null }, errors: { reveal: true } });
    expect(c.querySelector('[data-ch-code="CH-16293"]')?.textContent).toContain('Your spot didn’t load');
    expect(c.querySelector('[data-ch-reveal]')).toBeNull();
  });

  it('shows nothing about teammates or the team’s counting on a player’s page', () => {
    const c = draw({ ...oakmont, event: { ...oakmont.event!, reveal: null } });
    expect(c.textContent).not.toMatch(/Sofia|Ava Okafor|counted|dropped/);
  });

  it('says nothing was shared (CH-16392), and that the notes did not load (CH-16291) when that is why', () => {
    const none = draw({ ...oakmont, event: { ...oakmont.event!, sharedNotes: [] } });
    expect(none.querySelector('[data-ch-code="CH-16392"]')?.textContent).toContain('Nothing shared yet');
    cleanup();
    const failed = draw({ ...oakmont, event: { ...oakmont.event!, sharedNotes: [] }, errors: { notes: true } });
    expect(failed.querySelector('[data-ch-code="CH-16291"]')).not.toBeNull();
    expect(failed.querySelector('[data-ch-code="CH-16392"]')).toBeNull();
  });

  it('says no rounds are set (CH-16391)', () => {
    const c = draw({ ...oakmont, event: { ...oakmont.event!, event: { ...oakmont.event!.event, rounds: [] } } });
    expect(c.querySelector('[data-ch-code="CH-16391"]')).not.toBeNull();
  });
});

describe('PlayerEvent, their own card (hole by hole)', () => {
  const card = { roundEventId: 're-1', roundNumber: 1, date: '2026-11-12', holes: [1, 2, 3, 4].map((n) => ({ n, par: 4, strokes: n === 1 ? 4 : null })) };
  const withCard = (c: typeof card | null): ChTourPlayerData => ({ ...oakmont, event: { ...oakmont.event!, card: c } });

  it('offers the card for the round in play, with where they are, and nothing otherwise', () => {
    const c = draw(withCard(card));
    expect(c.querySelector('[data-ch-card]')?.textContent).toContain('Through 1 of 4');
    expect(screen.getByRole('button', { name: 'Continue your card' })).toBeInTheDocument();
    cleanup();
    expect(draw(withCard(null)).querySelector('[data-ch-card]')).toBeNull();
  });

  it('opens the hole sheet and saves their own hole for themselves (CH-16072 when it fails)', async () => {
    hole.mockResolvedValue({ success: true, data: { roundId: 'g1', thru: 2 } });
    draw(withCard(card));
    fireEvent.click(screen.getByRole('button', { name: 'Continue your card' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^4\s*Par$/ }));
    await waitFor(() => expect(hole).toHaveBeenCalledWith({ roundEventId: 're-1', playerId: oakmont.me.id, date: '2026-11-12', hole: 2, par: 4, strokes: 4 }));
    hole.mockResolvedValue({ success: false, error: 'Your coach has this round open. Ask them to score it or to clear it.', code: 'invalid' });
    fireEvent.click(within(dialog).getByRole('button', { name: /^5\s*Bogey$/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16072', title: 'Couldn’t save hole 3' })));
  });
});

describe('PlayerEvent, the reflection', () => {
  it('starts on what was saved, and Save reflection stays off until it changes', () => {
    draw(oakmont);
    expect(screen.getByLabelText(/What went well/)).toHaveValue(oakmont.event!.reflection!.body);
    expect(screen.getByRole('button', { name: 'Save reflection' })).toBeDisabled();
  });

  it('saves the typed text for this event through saveTournamentReflection, then re-reads', async () => {
    reflect.mockResolvedValue({ success: true, data: { savedAt: '2026-11-07T12:00:00Z' } });
    draw(unwritten(oakmont));
    fireEvent.change(screen.getByLabelText(/What went well/), { target: { value: '  Putting held up.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(reflect).toHaveBeenCalledWith(oakmont.event!.event.id, '  Putting held up.  '));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(screen.getByLabelText(/What went well/)).toHaveValue('Putting held up.');
    expect(screen.getByRole('button', { name: 'Save reflection' })).toBeDisabled();
  });

  it('keeps what was typed and says why when the save is refused (CH-16092)', async () => {
    reflect.mockResolvedValue({ success: false, error: 'It didn’t save. Try again.', code: 'failed' });
    draw(unwritten(oakmont));
    fireEvent.change(screen.getByLabelText(/What went well/), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16092', title: 'Couldn’t save your reflection' })));
    expect(screen.getByLabelText(/What went well/)).toHaveValue('Mine');
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('opens once a round has started, and not before', () => {
    const e = oakmont.event!;
    const before = draw({ ...oakmont, event: { ...e, event: { ...e.event, rounds: e.event.rounds.map((r) => ({ ...r, status: 'upcoming' as const })) } } });
    expect(before.textContent).toContain('once the first round has started');
    expect(screen.queryByLabelText(/What went well/)).toBeNull();
  });

  it('says the reflection did not load (CH-16292) instead of an empty box', () => {
    const c = draw({ ...oakmont, errors: { reflection: true } });
    expect(c.querySelector('[data-ch-code="CH-16292"]')).not.toBeNull();
    expect(screen.queryByLabelText(/What went well/)).toBeNull();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('PlayerEvent states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401) and the page failure (CH-16201), for the list and an event', () => {
    for (const d of [fx.list, oakmont]) {
      const loading = draw(d, { load: 'loading', phone }).querySelector('[data-ch-tour-view="player"]');
      expect(loading).toHaveAttribute('data-ch-code', 'CH-16401');
      expect(loading).toHaveAttribute('aria-busy', 'true');
      cleanup();
      expect(draw(d, { load: 'failed', phone }).querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
      cleanup();
    }
  });

  it('draws the event in one column with a back to the list', () => {
    const c = draw(oakmont, { phone });
    expect(c.querySelector('.ch-tour')?.classList.contains('is-phone')).toBe(phone);
    expect(within(c).queryAllByRole('link', { name: /Tournaments/ }).length + c.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});
