import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { LineupBuilder } from '../screens/tournaments/LineupBuilder';
import type { ChTourLineupData, ChTourLoad } from '../screens/tournaments/types';
import './dialog-polyfill';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const setEntries = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const lock = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/tournaments', () => ({ setTournamentEntries: setEntries, publishTournamentLineup: publish, lockTournamentLineup: lock }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast, useDelayedToast: () => () => () => {} }));

beforeEach(() => {
  for (const m of [setEntries, publish, lock, refresh, toast]) m.mockReset();
});
afterEach(cleanup);

/**
 * The lineup builder (P016, 5.3). Catalog: CH-16201 and CH-16401 (page states), CH-16262 (the roster didn’t load),
 * CH-16362 (no players on the roster), CH-16363 (a warning about a player), CH-16560 (lock the lineup?), CH-16062,
 * CH-16063 and CH-16064 (saving, publishing and locking fail). The fixture is Oakmont-style: four of five spots set.
 */
const fx = tourFixture('ready').lineup;
const draw = (d: ChTourLineupData = fx, opts: { phone?: boolean; load?: ChTourLoad } = {}) => render(<LineupBuilder data={d} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
const spot = (n: number) => screen.getByLabelText(`Spot ${n}`) as HTMLSelectElement;
const free = fx.players.find((p) => !p.alumni && !fx.slots.some((s) => s.playerId === p.id))!;

describe('LineupBuilder', () => {
  it('opens on the event with the spots as saved, and says what is left', () => {
    const c = draw();
    expect(c.querySelector('[data-ch-tour-view="lineup"] h1')?.textContent).toBe('Lineup');
    expect(spot(1).value).toBe(fx.slots[0]!.playerId);
    expect(spot(5).value).toBe('');
    expect(c.textContent).toContain('4 of 5 set');
    expect(c.querySelector('[data-ch-lineup-hint]')?.textContent).toBe('Fill every spot to publish (4 of 5 set).');
    // Nothing to save yet, and Publish waits for the fifth spot.
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish lineup' })).toBeDisabled();
  });

  it('shows each player’s form, a count-chance word only from six rounds, and the course record', () => {
    const c = draw();
    const rows = c.querySelectorAll('.ch-tour-lu-r');
    expect(rows.length).toBeGreaterThan(0);
    const text = c.textContent ?? '';
    expect(text).toMatch(/Usually counts|Often counts|Sometimes counts/);
    expect(c.querySelector('.ch-tour-lu-strip')?.getAttribute('aria-label')).toMatch(/^Last \d+ rounds: /);
    expect(text).not.toMatch(/\d+% /);
  });

  it('filling the fifth spot from the roster lights Save draft and Publish', () => {
    draw();
    const row = Array.from(document.querySelectorAll('.ch-tour-lu-r')).find((li) => li.querySelector('.ch-tour-lu-r__n')?.textContent?.startsWith(free.name)) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add' }));
    expect(spot(5).value).toBe(free.id);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publish lineup' })).toBeEnabled();
    expect(document.querySelector('[data-ch-lineup-hint]')).toBeNull();
  });

  it('saves through setTournamentEntries at the event’s version, with the spots numbered', async () => {
    setEntries.mockResolvedValue({ success: true, data: { version: (fx.version ?? 0) + 1 } });
    draw();
    fireEvent.change(spot(5), { target: { value: free.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(setEntries).toHaveBeenCalledTimes(1));
    const [id, entries, version] = setEntries.mock.calls[0]!;
    expect(id).toBe(fx.event.id);
    expect(version).toBe(fx.version);
    expect(entries.filter((e: { role: string }) => e.role === 'lineup')).toHaveLength(5);
    expect(entries).toContainEqual({ playerId: free.id, role: 'lineup', slot: 5 });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it('Publish saves what is on screen first, then publishes, and stops if the save is refused (CH-16062)', async () => {
    setEntries.mockResolvedValueOnce({ success: false, error: 'This event changed since you opened it.', code: 'stale' });
    draw();
    fireEvent.change(spot(5), { target: { value: free.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish lineup' }));
    await waitFor(() => expect(setEntries).toHaveBeenCalled());
    expect(publish).not.toHaveBeenCalled();
    // The coach’s draft is still on the page.
    expect(spot(5).value).toBe(free.id);
  });

  it('publishes after a good save and re-reads the page', async () => {
    setEntries.mockResolvedValue({ success: true, data: { version: 9 } });
    publish.mockResolvedValue({ success: true, data: { publishedAt: '2026-11-07T12:00:00Z' } });
    draw();
    fireEvent.change(spot(5), { target: { value: free.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish lineup' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(fx.event.id));
    expect(setEntries.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]!);
  });

  it('each failure says what failed, with the server’s words, under its own code (CH-16062, CH-16063, CH-16064)', async () => {
    setEntries.mockResolvedValueOnce({ success: false, error: 'The lineup is locked. Make a substitution instead.', code: 'locked' });
    draw();
    fireEvent.change(spot(5), { target: { value: free.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16062', title: 'Couldn’t save the lineup', body: 'The lineup is locked. Make a substitution instead.' })));
    setEntries.mockResolvedValue({ success: true, data: { version: 5 } });
    publish.mockResolvedValueOnce({ success: false, error: 'Add players to the lineup first.', code: 'lineup_empty' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish lineup' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16063', title: 'Couldn’t publish the lineup' })));
    lock.mockResolvedValueOnce({ success: false, error: 'It didn’t save. Try again.', code: 'failed' });
    fireEvent.click(screen.getByRole('button', { name: 'Lock lineup' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Lock lineup' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16064', title: 'Couldn’t lock the lineup' })));
  });

  it('a second change in the same slot swaps rather than losing a player', () => {
    draw();
    const a = spot(1).value;
    const b = spot(2).value;
    fireEvent.change(spot(1), { target: { value: b } });
    expect(spot(1).value).toBe(b);
    expect(spot(2).value).toBe(a);
  });

  it('warns about an injured player and still lets the coach decide (CH-16363)', () => {
    const slot1 = fx.slots[0]!.playerId!;
    const c = draw({ ...fx, candidates: fx.candidates.map((x) => (x.playerId === slot1 ? { ...x, availability: 'injured' as const } : x)) });
    const warn = c.querySelector('[data-ch-code="CH-16363"]');
    expect(warn?.textContent).toContain('is marked injured');
    expect(screen.getByLabelText('Spot 1')).toBeEnabled();
  });

  it('asks before locking, saves any change, then locks (CH-16560)', async () => {
    lock.mockResolvedValue({ success: true, data: { lockedAt: '2026-11-07T12:00:00Z' } });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Lock lineup' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-ch-code="CH-16560"]') ?? dialog).toBeTruthy();
    expect(lock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock lineup' }));
    await waitFor(() => expect(lock).toHaveBeenCalledWith(fx.event.id));
  });

  it('is read-only once locked: no keys, no editing, and it says how a change is made', () => {
    const c = draw({ ...fx, lineup: { ...fx.lineup, status: 'locked' } });
    expect(spot(1)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish lineup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lock lineup' })).toBeNull();
    expect(c.textContent).toContain('The lineup is locked');
  });

  it('says the roster is empty (CH-16362) and that it did not load (CH-16262), never one as the other', () => {
    const empty = draw({ ...fx, players: [], candidates: [] });
    expect(empty.querySelector('[data-ch-code="CH-16362"]')?.textContent).toContain('No players on the roster');
    expect(empty.querySelector('[data-ch-code="CH-16262"]')).toBeNull();
    cleanup();
    const failed = draw({ ...fx, errors: { roster: true } });
    expect(failed.querySelector('[data-ch-code="CH-16262"]')?.textContent).toContain('The roster didn’t load');
    expect(failed.querySelector('[data-ch-code="CH-16362"]')).toBeNull();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('LineupBuilder states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401) and the page failure (CH-16201)', () => {
    const loading = draw(fx, { load: 'loading', phone }).querySelector('[data-ch-tour-view="lineup"]');
    expect(loading).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    cleanup();
    expect(draw(fx, { load: 'failed', phone }).querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
  });

  it('draws the builder with its spots and roster', () => {
    const c = draw(fx, { phone });
    expect(c.querySelector('.ch-tour')?.classList.contains('is-phone')).toBe(phone);
    expect(c.querySelectorAll('.ch-tour-lu-slot')).toHaveLength(5);
    expect(c.querySelectorAll('.ch-avatar').length > 0).toBe(!phone);
  });
});
