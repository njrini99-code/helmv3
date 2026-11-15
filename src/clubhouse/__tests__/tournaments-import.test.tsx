import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChTourDeskData, ChTourHoleLedger } from '../screens/tournaments/types';
import { COURSE, HOLES, PARS, ROSTER, card, event, pr, total } from '../screens/tournaments/import/__tests__/fixtures';
import './dialog-polyfill';

const save = vi.fn();
const toast = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/golf/actions/tournaments-import', () => ({ importTournamentResults: (...a: unknown[]) => save(...a) }));
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast, useDelayedToast: () => () => () => {} }));

const { ImportResults } = await import('../screens/tournaments/ImportResults');
const { HoleEntry } = await import('../screens/tournaments/HoleEntry');

beforeEach(() => {
  save.mockReset();
  toast.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

/**
 * Import results and Enter holes on the Event desk (P016, launch readiness F-01). Catalog: CH-16080 and CH-16081 (a
 * save fails), CH-16180 (a file that can't be read), CH-16181 (no scores found), CH-16182 (a grid cell that can't be
 * saved), CH-16183 (nothing pasted), CH-16380 (none of ours in the file), CH-16381 (no grid for the round), CH-16480
 * (reading), CH-16580 and CH-16581 (Start over, Leave without saving), CH-16880 (the grid by keyboard), CH-16980 (the
 * file and a card differ). The event: two rounds at Pinehurst, Ava, Theo, Sofia, Jonah and Eli in the lineup, William
 * the alternate.
 */
function desk(over: Partial<ChTourDeskData> = {}, ev = event()): ChTourDeskData {
  return { now: '2026-10-21T18:00:00Z', teamName: 'Demo University', event: ev, players: ROSTER, courses: { pin: COURSE }, holes: null, findings: [], story: null, review: null, travel: null, adviceGivers: [], previous: null, errors: {}, ...over };
}

const dialog = () => screen.getAllByRole('dialog').find((d) => d.hasAttribute('open')) as HTMLElement;

/** Our five and Elon's five, round by round, as a leaderboard copied from a results page (tabs between columns). */
const LEADERBOARD = [
  ['Pos', 'Player', 'Team', 'R1', 'R2', 'Total'],
  ['1', 'Ava Lindqvist', 'Demo University', '70', '71', '141'],
  ['T2', 'Theo Marchetti', 'Demo University', '72', '71', '143'],
  ['T2', 'Kai Ito', 'Elon', '71', '72', '143'],
  ['4', 'Sofia Alvarez', 'Demo University', '73', '72', '145'],
  ['5', 'Jonah Okafor', 'Demo University', '74', '73', '147'],
  ['6', 'Bo Kim', 'Elon', '74', '74', '148'],
  ['7', 'Eli Brandt', 'Demo University', '75', '76', '151'],
  ['8', 'Max Roy', 'Elon', '75', '75', '150'],
  ['9', 'Lu Chen', 'Elon', '76', '75', '151'],
  ['10', 'Ren Ota', 'Elon', '78', '77', '155'],
]
  .map((r) => r.join('\t'))
  .join('\n');

function paste(text: string) {
  fireEvent.click(within(dialog()).getByRole('radio', { name: 'Paste' }));
  fireEvent.change(within(dialog()).getByLabelText('Paste the results'), { target: { value: text } });
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Read results' }));
}

describe('Import results', () => {
  it('reads a pasted leaderboard, matches our players, works out the field and saves it all in one go', async () => {
    save.mockResolvedValue({ success: true, data: { cards: 10, kept: [], teams: 1, added: 1, places: true } });
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste(LEADERBOARD);
    await waitFor(() => expect(within(dialog()).getByText('Your players')).toBeInTheDocument());
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'Check the results' })).toBeInTheDocument();
    // Five of ours, two rounds each, every one new; Elon is one team on the field.
    const players = d.querySelectorAll('[data-ch-import-player]');
    expect(players).toHaveLength(5);
    expect(within(d).getByText('Rounds to save').nextElementSibling?.textContent).toBe('10');
    const field = d.querySelector('.ch-tour-imp-ts') as HTMLElement;
    expect(within(field).getByText('Elon')).toBeInTheDocument();
    expect(within(field).getByText('New to the field')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'Save 10 rounds and 1 team' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const input = save.mock.calls[0]![0] as { tournamentId: string; cards: Array<{ playerId: string; total: number | null; holes: unknown }>; teams: Array<{ name: string; us: boolean; rounds: unknown }> };
    expect(input.tournamentId).toBe('e1');
    expect(input.cards.find((c) => c.playerId === 'ava')).toMatchObject({ total: 70, holes: null });
    expect(input.teams.find((t) => !t.us)).toMatchObject({ name: 'Elon', rounds: [{ n: 1, total: 296 }, { n: 2, total: 296 }] });
    await waitFor(() => expect(within(dialog()).getByText('Saved')).toBeInTheDocument());
    expect(within(dialog()).getByText(/10 rounds saved to your players’ cards\. 1 team on the field, 1 of them new\. Places are set\./)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('says why a refused save failed, under its own code, and keeps the check step (CH-16080)', async () => {
    save.mockResolvedValue({ success: false, error: 'The results are official, so scores can’t change. Reopen the results first.' });
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste(LEADERBOARD);
    await waitFor(() => expect(within(dialog()).getByText('Your players')).toBeInTheDocument());
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Save / }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', code: 'CH-16080', title: 'Couldn’t save the results' })));
    expect(within(dialog()).getByText('Your players')).toBeInTheDocument();
  });

  it('asks for the results when nothing is pasted (CH-16183)', () => {
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste('  ');
    const line = within(dialog()).getByRole('alert');
    expect(line).toHaveAttribute('data-ch-code', 'CH-16183');
    expect(line.textContent).toBe('Paste the results first.');
  });

  it('turns away a PDF with the way forward, and offers another file or a paste (CH-16180)', async () => {
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    const pdf = new File([new TextEncoder().encode('%PDF-1.7 results')], 'results.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog()).getByLabelText('Choose a results file'), { target: { files: [pdf] } });
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveAttribute('data-ch-code', 'CH-16180');
    expect(alert).toHaveAttribute('data-ch-fail', 'pdf');
    expect(within(alert).getByText('A PDF can’t be read here')).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Paste instead' }));
    expect(within(dialog()).getByLabelText('Paste the results')).toBeInTheDocument();
  });

  it('shows the reading state for a slow file, after its first beat (CH-16480)', async () => {
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    const file = new File(['x'], 'big.csv', { type: 'text/csv' });
    let finish: (b: ArrayBuffer) => void = () => {};
    Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((r) => (finish = r)) });
    fireEvent.change(within(dialog()).getByLabelText('Choose a results file'), { target: { files: [file] } });
    const reading = await within(dialog()).findByText('Reading the results…');
    expect(reading.closest('[data-ch-code]')).toHaveAttribute('data-ch-code', 'CH-16480');
    await act(async () => finish(new TextEncoder().encode(LEADERBOARD).buffer as ArrayBuffer));
    await waitFor(() => expect(within(dialog()).getByText('Your players')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('opens the column editor when no column reads as scores, and reads the file once the columns are set (CH-16181)', async () => {
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste(['Golfer\tSchool\tA\tB', 'Ava Lindqvist\tDemo University\t70\t71'].join('\n'));
    await waitFor(() => expect(within(dialog()).getByText('No scores found')).toBeInTheDocument());
    const d = dialog();
    expect(d.querySelector('[data-ch-code="CH-16181"]')).not.toBeNull();
    expect(within(d).getByRole('region', { name: 'The sheet’s first rows' })).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Player column'), { target: { value: '0' } });
    fireEvent.change(within(d).getByLabelText('Round 1 score column'), { target: { value: '2' } });
    await waitFor(() => expect(within(dialog()).getByText('Rounds to save').nextElementSibling?.textContent).toBe('2'));
  });

  it('a file of team scores only says so, and still saves the field (CH-16380)', async () => {
    save.mockResolvedValue({ success: true, data: { cards: 0, kept: [], teams: 1, added: 1, places: false } });
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste(['Place\tTeam\tRd 1\tRd 2\tTotal', '1\tElon\t285\t288\t573', '2\tDemo University\t290\t286\t576'].join('\n'));
    await waitFor(() => expect(within(dialog()).getByText('No player rows in this file')).toBeInTheDocument());
    expect(dialog().querySelector('[data-ch-code="CH-16380"]')).not.toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save 1 team' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  it('asks before Start over lets the coach’s choices go (CH-16580)', async () => {
    render(<ImportResults open onClose={() => {}} data={desk()} />);
    paste(LEADERBOARD);
    await waitFor(() => expect(within(dialog()).getByText('Your players')).toBeInTheDocument());
    fireEvent.change(within(dialog()).getByLabelText('Roster match for Eli Brandt'), { target: { value: '' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Start over' }));
    const ask = dialog();
    expect(within(ask).getByRole('heading', { name: 'Start over?' })).toBeInTheDocument();
    expect(ask).toHaveAttribute('data-ch-code', 'CH-16580');
    fireEvent.click(within(ask).getByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(within(dialog()).getByRole('radio', { name: 'File' })).toBeInTheDocument());
  });

  it('shows the file and a differing card side by side and lets the coach choose (CH-16980)', async () => {
    save.mockResolvedValue({ success: true, data: { cards: 1, kept: [], teams: 0, added: 0, places: false } });
    // Theo's open card: 73 with the bogey on hole 5. The file: 73 with the bogey on hole 1.
    const ledger: ChTourHoleLedger = {
      courseId: 'pin',
      pars: PARS,
      handicaps: [],
      totalsOnly: [],
      cards: [{ playerId: 'theo', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: card(1, 5).map((s, i) => ({ n: i + 1, par: PARS[i]!, strokes: s, source: 'card', disputed: false })) }],
    };
    const ev = event({ playerRounds: [pr({ playerId: 'theo', roundNumber: 1, roundId: 'g2', total: 73, holesKnown: true, cardOpen: true })] });
    render(<ImportResults open onClose={() => {}} data={desk({ holes: ledger }, ev)} />);
    const theo = card(1);
    paste([['Player', 'Round', ...HOLES, 'Total'].join('\t'), ['Theo Marchetti', '1', ...theo.map(String), String(total(theo))].join('\t')].join('\n'));
    const note = await waitFor(() => {
      const el = dialog().querySelector('[data-ch-code="CH-16980"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(note.querySelector('p')?.textContent).toBe('Round 1: the file says 73, the card says 73. Holes 1 and 5 differ.');
    // The totals agree, so the card is kept unless the coach says otherwise.
    expect(within(note).getByRole('radio', { name: 'Keep the card' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog()).getByRole('button', { name: 'Nothing to save' })).toBeDisabled();
    fireEvent.click(within(note).getByRole('radio', { name: 'Use the file' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save 1 round' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].cards[0]).toMatchObject({ playerId: 'theo', holes: theo, replace: true });
  });
});

describe('Enter holes', () => {
  const grid = (data = desk(), round = 1) => render(<HoleEntry open onClose={() => {}} data={data} round={round} />);
  const cell = (name: string, hole: number) => within(dialog()).getByLabelText(new RegExp(`^${name}, hole ${hole}, par \\d$`)) as HTMLInputElement;

  it('moves on after a whole score, and the arrows and Enter move around the grid (CH-16880)', () => {
    grid();
    expect(dialog().querySelector('[data-ch-code="CH-16880"]')).not.toBeNull();
    const first = cell('Ava Lindqvist', 1);
    first.focus();
    fireEvent.change(first, { target: { value: '4' } });
    expect(document.activeElement).toBe(cell('Ava Lindqvist', 2));
    // A 1 may be the start of 10 to 15: it waits.
    fireEvent.change(cell('Ava Lindqvist', 2), { target: { value: '1' } });
    expect(document.activeElement).toBe(cell('Ava Lindqvist', 2));
    fireEvent.keyDown(cell('Ava Lindqvist', 2), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('Theo Marchetti', 2));
    fireEvent.keyDown(cell('Theo Marchetti', 2), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell('Theo Marchetti', 1));
    fireEvent.keyDown(cell('Theo Marchetti', 1), { key: 'Enter' });
    expect(document.activeElement).toBe(cell('Sofia Alvarez', 1));
  });

  it('names a cell it can’t save and keeps Save off until it is fixed (CH-16182)', () => {
    grid();
    fireEvent.change(cell('Eli Brandt', 3), { target: { value: 'x' } });
    const errs = within(dialog()).getByRole('alert');
    expect(errs).toHaveAttribute('data-ch-code', 'CH-16182');
    expect(errs.textContent).toBe('Eli Brandt, hole 3: A hole score is a whole number of strokes, 1 or more.');
    expect(cell('Eli Brandt', 3)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog()).getByRole('button', { name: 'Nothing to save' })).toBeDisabled();
  });

  it('saves each changed row as that player’s card for the round, and says when it fails (CH-16081)', async () => {
    save.mockResolvedValue({ success: false, error: 'That player isn’t in this round’s lineup.' });
    grid();
    fireEvent.change(cell('Ava Lindqvist', 1), { target: { value: '5' } });
    fireEvent.change(cell('Sofia Alvarez', 18), { target: { value: '4' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save holes for 2 players' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const input = save.mock.calls[0]![0] as { cards: Array<{ playerId: string; holes: Array<number | null>; roundEventId: string }>; teams: unknown[] };
    expect(input.teams).toEqual([]);
    expect(input.cards.map((c) => [c.playerId, c.roundEventId])).toEqual([
      ['ava', 'r1'],
      ['sofia', 'r1'],
    ]);
    expect(input.cards[0]!.holes[0]).toBe(5);
    expect(input.cards[1]!.holes[17]).toBe(4);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-16081', title: 'Couldn’t save the holes', body: 'That player isn’t in this round’s lineup.' })));
    // What was typed is still there.
    expect(cell('Ava Lindqvist', 1).value).toBe('5');
  });

  it('asks before leaving typed holes unsaved (CH-16581)', () => {
    grid();
    fireEvent.change(cell('Jonah Okafor', 7), { target: { value: '3' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog()).getByRole('heading', { name: 'Leave without saving?' })).toBeInTheDocument();
    expect(within(dialog()).getByText('The holes you typed for 1 player aren’t saved.')).toBeInTheDocument();
  });

  it('says why there is no grid when the course has no hole pars (CH-16381)', () => {
    grid(desk({ courses: { pin: { ...COURSE, holes: [] } } }));
    const empty = dialog().querySelector('[data-ch-code="CH-16381"]');
    expect(empty?.textContent).toContain('The course has no hole pars yet');
  });

  it('shows a submitted round read-only, and marks an entered total the holes will replace', () => {
    const ev = event({ playerRounds: [pr({ playerId: 'theo', roundNumber: 1, roundId: 'g2', total: 73, holesKnown: true, cardOpen: false }), pr({ playerId: 'sofia', roundNumber: 1, total: 74 })] });
    grid(desk({}, ev));
    expect(cell('Theo Marchetti', 1)).toHaveAttribute('readonly');
    const sofia = dialog().querySelector('[data-ch-grid-row="sofia"]') as HTMLElement;
    expect(within(sofia).getByText('Entered 74')).toBeInTheDocument();
    fireEvent.change(cell('Sofia Alvarez', 1), { target: { value: '4' } });
    expect(within(sofia).getByText('Replaces 74')).toBeInTheDocument();
  });
});

describe('Event desk: where results come in', () => {
  const tab = { tab: 'overview' as const, round: 'all' as const, view: 'team' as const, holes: 'to-par' as const };
  it('desktop: Import results in the head and in the empty Who counted, Enter holes on the Holes tab', async () => {
    const { EventDesk } = await import('../screens/tournaments/EventDesk');
    const c = render(<EventDesk data={desk()} search={tab} load="ready" phone={false} />).container;
    const head = c.querySelector('.ch-tour-head') as HTMLElement;
    fireEvent.click(within(head).getByRole('button', { name: 'Import results' }));
    expect(within(dialog()).getByRole('heading', { name: 'Import results' })).toBeInTheDocument();
    cleanup();
    const holes = render(<EventDesk data={desk()} search={{ ...tab, tab: 'holes' }} load="ready" phone={false} />).container;
    fireEvent.click(within(holes).getByRole('button', { name: 'Enter holes' }));
    expect(within(dialog()).getByRole('heading', { name: 'Enter holes' })).toBeInTheDocument();
  });

  it('phone: the empty state carries Import results; no grid, and nothing once the results are official', async () => {
    const { EventDesk } = await import('../screens/tournaments/EventDesk');
    const c = render(<EventDesk data={desk()} search={tab} load="ready" phone />).container;
    const empty = c.querySelector('[data-ch-code="CH-16320"]') as HTMLElement;
    expect(within(empty).getByRole('button', { name: 'Import results' })).toBeInTheDocument();
    cleanup();
    const official = render(<EventDesk data={desk({ track: { version: 1, cancelled: false, official: true, scoredRound: null, entries: 2 } })} search={tab} load="ready" phone={false} />).container;
    expect(within(official).queryByRole('button', { name: 'Import results' })).toBeNull();
    cleanup();
    // The event says official even where the tracking row didn't load.
    const marked = render(<EventDesk data={desk({ track: null }, { ...event(), trust: 'official' })} search={tab} load="ready" phone={false} />).container;
    expect(within(marked).queryByRole('button', { name: 'Import results' })).toBeNull();
  });
});
