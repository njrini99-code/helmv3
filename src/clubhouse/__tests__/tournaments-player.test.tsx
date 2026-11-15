import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { PlayerEvent } from '../screens/tournaments/PlayerEvent';
import { formatToPar, inDays, teamToday } from '../screens/tournaments/format';
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
  const links = (c: HTMLElement) => [...c.querySelectorAll<HTMLAnchorElement>('a[href^="/golf/dashboard/tournaments/"]')];
  const coming = fx.list.list.filter((x) => x.status !== 'complete');
  const played = fx.list.list.filter((x) => x.status === 'complete');

  it('lists the season’s events, coming up first, each a link to its event', () => {
    const c = draw(fx.list);
    expect(c.querySelector('[data-ch-tour-view="player"] h1')?.textContent).toBe('Tournaments');
    expect(links(c).map((a) => a.getAttribute('href'))).toEqual(fx.list.list.map((x) => `/golf/dashboard/tournaments/${x.eventId}`));
    // Teammates and the team are not on the player’s list: no place, no counting.
    expect(c.textContent).not.toMatch(/counted|dropped/i);
  });

  it('draws the next event as the one green card: where, when, how far off, and each day with its first tee', () => {
    const c = draw(fx.list);
    const next = coming[0]!;
    const card = c.querySelector('.ch-tour-pl-next')!;
    expect(c.querySelectorAll('.ch-feat')).toHaveLength(1);
    expect(card).toHaveAttribute('href', `/golf/dashboard/tournaments/${next.eventId}`);
    // The link's name is what the card says (no label over it), so the days and tee times are read too.
    expect(card).not.toHaveAttribute('aria-label');
    expect(card.querySelector('.ch-feat__title')?.textContent).toBe(next.name);
    expect(card.querySelector('.ch-feat__kicker')?.textContent).toContain(next.courseName);
    expect(card.querySelector('.ch-feat__chip')?.textContent).toBe(inDays(teamToday(fx.list.now, fx.list.team.timezone), next.startDate));
    const days = card.querySelectorAll('.ch-tour-pl-next__day');
    expect(days).toHaveLength(next.days.length);
    expect(days[0]?.textContent).toMatch(/^Round 1.*First tee \d{1,2}:\d{2} [AP]M$/);
    // The rest of the calendar follows it, a row an event.
    expect(c.querySelectorAll('.ch-tour-pl-later .ch-lgr__row')).toHaveLength(coming.length - 1);
    cleanup();
    // A day with no tee time says so, and an event with no days yet says that instead of an empty card.
    const noTee = draw({ ...fx.list, list: fx.list.list.map((x) => (x === next ? { ...x, days: x.days.map((d) => ({ ...d, firstTeeAt: null })) } : x)) });
    expect(noTee.querySelector('.ch-tour-pl-next__day')?.textContent).toContain('Tee time not set');
    cleanup();
    const noDays = draw({ ...fx.list, list: fx.list.list.map((x) => (x === next ? { ...x, days: [] } : x)) });
    expect(noDays.querySelector('.ch-tour-pl-next')?.textContent).toContain('Your coach hasn’t added the days yet.');
  });

  it('desktop: the events played are a table of the player’s own numbers, a column a round, then the total and the to-par', () => {
    const c = draw(fx.list);
    expect(c.querySelector('.ch-tour-pl-body--list')?.classList.contains('is-two')).toBe(true);
    const table = within(c).getByRole('table', { name: 'Events played' });
    const rounds = Math.max(...played.map((x) => x.days.length));
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Event', ...Array.from({ length: rounds }, (_, i) => `R${i + 1}`), 'Total', 'To par', 'Open']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(played.length);
    const first = played[0]!;
    const cells = within(rows[0]!).getAllByRole('cell').map((x) => x.textContent);
    expect(cells[0]).toContain(first.name);
    expect(cells.slice(1, 1 + first.days.length)).toEqual(first.mine!.scores.map((r) => String(r.total)));
    expect(cells[1 + rounds]).toBe(String(first.mine!.total));
    expect(cells[2 + rounds]).toBe(formatToPar(first.mine!.toPar));
    // The total is the rounds added up, and the to-par theirs against par: nothing of the team's.
    expect(first.mine!.scores.reduce((sum, r) => sum + (r.total ?? 0), 0)).toBe(first.mine!.total);
  });

  it('desktop: a round the player has no score for is a dash, and an event with none of theirs shows no total', () => {
    const first = played[0]!;
    const gap = { ...first, mine: { ...first.mine!, scores: first.mine!.scores.map((r, i) => (i === 1 ? { ...r, total: null, toPar: null } : r)) } };
    const c = draw({ ...fx.list, list: fx.list.list.map((x) => (x === first ? gap : x === played[1] ? { ...x, mine: null } : x)) });
    const rows = within(within(c).getByRole('table', { name: 'Events played' })).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getAllByRole('cell')[2]?.textContent).toBe('—No score');
    expect(within(rows[1]!).getAllByRole('cell').slice(1, -1).every((x) => x.textContent === '—No score')).toBe(true);
  });

  it('phone: the card stands on the canvas, and a played row gives the total and the to-par over the rounds played', () => {
    const c = draw(fx.list, { phone: true });
    expect(c.querySelector('.ch-sec .ch-tour-pl-next')).toBeNull();
    expect(c.querySelector('.ch-tour-pl-next')).not.toBeNull();
    expect(c.querySelector('[role="table"]')).toBeNull();
    const rows = c.querySelectorAll('.ch-tour-pl-row');
    expect(rows).toHaveLength(played.length);
    const first = played[0]!;
    expect(rows[0]?.querySelector('.ch-tour-pl-row__r')?.textContent).toBe(`${first.mine!.total} · ${formatToPar(first.mine!.toPar)}${first.mine!.rounds} rounds`);
    // Where and when are separate facts, so the line wraps between them and never onto a lone dot.
    expect([...rows[0]!.querySelectorAll('.ch-tour-pl-bits > span > span')].map((x) => x.textContent)).toEqual([expect.stringMatching(/^[A-Z][a-z]{2} \d/), first.courseName]);
    expect(links(c)).toHaveLength(fx.list.list.length);
  });

  it('with only one of the two to show, the list keeps one column', () => {
    expect(draw({ ...fx.list, list: coming }).querySelector('.ch-tour-pl-body--list')?.classList.contains('is-two')).toBe(false);
    cleanup();
    const c = draw({ ...fx.list, list: played });
    expect(c.querySelector('.ch-tour-pl-body--list')?.classList.contains('is-two')).toBe(false);
    expect(c.querySelector('.ch-feat')).toBeNull();
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
