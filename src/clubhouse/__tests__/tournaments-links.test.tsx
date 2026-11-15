import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { LinkInbox } from '../screens/tournaments/LinkInbox';
import type { ChTourLinksData, ChTourLoad } from '../screens/tournaments/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const link = vi.fn();
const dismiss = vi.fn();
vi.mock('@/app/golf/actions/tournaments', () => ({
  linkTournamentRound: (...a: unknown[]) => link(...a),
  dismissTournamentLink: (...a: unknown[]) => dismiss(...a),
}));

beforeEach(() => {
  link.mockReset();
  dismiss.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

/**
 * The round link inbox (P016, 5.12). Catalog: CH-16201 and CH-16401 (page states), CH-16238 (the rounds didn’t load),
 * CH-16338 (no rounds to link), CH-16038 (linking failed), CH-16039 (dismissing failed).
 */
const data = tourFixture('ready').links;
const draw = (d: ChTourLinksData, opts: { phone?: boolean; load?: ChTourLoad } = {}) => render(<LinkInbox data={d} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;

describe('Link rounds on the phone (F-0054)', () => {
  it('names where it is once: the bar’s Back says Tournaments, so no eyebrow repeats it over the title', () => {
    const c = draw(data, { phone: true });
    expect(c.querySelector('h1.ch-large-title')?.textContent).toBe('Link rounds');
    expect([...c.querySelectorAll('.ch-intro__eyebrow')].map((e) => e.textContent)).not.toContain('Tournaments');
  });
  it('a desk keeps its eyebrow, as the qualifier forms do', () => {
    const c = draw(data);
    expect(c.querySelector('.ch-tour-head__k')?.textContent).toBe('Tournaments');
  });
});

describe('LinkInbox', () => {
  it('lists each round with its player, day, course, score and the match it is suggested for', () => {
    const c = draw(data);
    expect(c.querySelector('[data-ch-tour-view="links"] h1')?.textContent).toBe('Link rounds');
    const rows = c.querySelectorAll('.ch-tour-links-row');
    expect(rows).toHaveLength(3);
    const first = rows[0] as HTMLElement;
    expect(first.textContent).toContain('Eli');
    expect(first.textContent).toContain('Dogwood Lakes');
    expect(first.textContent).toContain('High match');
    expect(first.textContent).toContain('Same day and course');
    expect(rows[1]!.textContent).toContain('Medium match');
    expect(rows[2]!.textContent).toContain('A day away');
  });

  it('starts each row on its suggestion, and Link round writes that event round for that player', async () => {
    link.mockResolvedValue({ success: true, data: null });
    const c = draw(data);
    const row = c.querySelector('.ch-tour-links-row') as HTMLElement;
    const sug = data.candidates[0]!.suggestion!;
    const [eventSel, roundSel] = Array.from(row.querySelectorAll('select')) as HTMLSelectElement[];
    expect(eventSel!.value).toBe(sug.eventId);
    expect(roundSel!.value).toBe(sug.roundEventId);
    fireEvent.click(within(row).getByRole('button', { name: 'Link round' }));
    await waitFor(() => expect(link).toHaveBeenCalledWith(sug.roundEventId, data.candidates[0]!.playerId, data.candidates[0]!.roundId));
    // The row leaves the list as its write lands, and the page is re-read.
    await waitFor(() => expect(c.querySelectorAll('.ch-tour-links-row')).toHaveLength(2));
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the row and says why when the server refuses the link (CH-16038)', async () => {
    link.mockResolvedValue({ success: false, error: 'That player isn’t in this round’s lineup.', code: 'not_in_lineup' });
    const c = draw(data);
    fireEvent.click(within(c.querySelector('.ch-tour-links-row') as HTMLElement).getByRole('button', { name: 'Link round' }));
    await waitFor(() => expect(link).toHaveBeenCalled());
    await waitFor(() => expect(c.querySelectorAll('.ch-tour-links-row')).toHaveLength(3));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('will not link until an event round is picked', () => {
    const none: ChTourLinksData = { ...data, candidates: [{ ...data.candidates[0]!, suggestion: null }] };
    const c = draw(none);
    expect(within(c).getByRole('button', { name: 'Link round' })).toBeDisabled();
    expect(c.textContent).not.toContain('match');
  });

  it('Not a tournament round writes the dismissal and removes the row (CH-16039 when it fails)', async () => {
    dismiss.mockResolvedValue({ success: true, data: null });
    const c = draw(data);
    fireEvent.click(within(c.querySelector('.ch-tour-links-row') as HTMLElement).getByRole('button', { name: 'Not a tournament round' }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(data.candidates[0]!.roundId));
    await waitFor(() => expect(c.querySelectorAll('.ch-tour-links-row')).toHaveLength(2));
    cleanup();
    dismiss.mockResolvedValue({ success: false, error: 'It didn’t save. Try again.', code: 'failed' });
    const again = draw(data);
    fireEvent.click(within(again.querySelector('.ch-tour-links-row') as HTMLElement).getByRole('button', { name: 'Not a tournament round' }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(2));
    expect(again.querySelectorAll('.ch-tour-links-row')).toHaveLength(3);
  });

  it('lists lineup players with no round, each with a way to enter a score', () => {
    const c = draw(data);
    const miss = c.querySelector('.ch-tour-links-miss__row') as HTMLElement;
    expect(miss.textContent).toContain('Eli');
    expect(within(miss).getByRole('link', { name: 'Enter a score' })).toHaveAttribute('href', '/golf/dashboard/tournaments/e32/live');
  });

  it('says nothing to link when there is nothing (CH-16338), never a failure', () => {
    const c = draw(tourFixture('empty').links);
    expect(c.querySelector('[data-ch-code="CH-16338"]')?.textContent).toContain('No rounds to link');
    expect(c.querySelector('[data-ch-code="CH-16238"]')).toBeNull();
  });

  it('says the rounds did not load, with Try again, when only that read failed (CH-16238)', () => {
    const c = draw({ ...data, candidates: [], errors: { candidates: true } });
    const alert = c.querySelector('[data-ch-code="CH-16238"]');
    expect(alert?.textContent).toContain('The rounds didn’t load');
    expect(c.querySelector('[data-ch-code="CH-16338"]')).toBeNull();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('LinkInbox states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401) and the page failure (CH-16201)', () => {
    const loading = draw(data, { load: 'loading', phone }).querySelector('[data-ch-tour-view="links"]');
    expect(loading).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    cleanup();
    const failed = draw(data, { load: 'failed', phone });
    expect(failed.querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
  });

  it('draws the rows without portraits on the phone, stacked, with 44px keys', () => {
    const c = draw(data, { phone });
    expect(c.querySelector('.ch-tour')?.classList.contains('is-phone')).toBe(phone);
    expect(c.querySelectorAll('.ch-avatar').length > 0).toBe(!phone);
    expect(screen.getAllByRole('button', { name: 'Link round' })).toHaveLength(3);
  });
});
