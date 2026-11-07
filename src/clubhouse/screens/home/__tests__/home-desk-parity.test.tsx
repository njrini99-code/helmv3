import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeskAgenda, DeskBoard, DeskRounds } from '../HomeDeskCrh';
import { PREVIEW_HOME, PREVIEW_HOME_EARLY } from '../../../preview/fixtures';
import { FormBars } from '../../../ui/FormLine';

afterEach(cleanup);

describe('coach Home desktop, design parity', () => {
  it('a board where nobody has a place shows a dash in the rank column and says why (HOME-S8)', () => {
    const { container } = render(<DeskBoard rows={PREVIEW_HOME_EARLY.leaderboard.rows} rosterSize={8} />);
    const ranks = [...container.querySelectorAll('.ch-dh-rank')].map((n) => n.textContent);
    expect(new Set(ranks)).toEqual(new Set(['—']));
    expect(screen.getByText(/no place until three rounds/)).toBeTruthy();
  });

  it('a board with places keeps its ranks, and a player still early keeps the dash', () => {
    const rows = PREVIEW_HOME.leaderboard.rows.slice(0, 5).map((r, i) => (i === 4 ? { ...r, status: 'early' as const } : { ...r, status: 'steady' as const }));
    const { container } = render(<DeskBoard rows={rows} rosterSize={8} />);
    const ranks = [...container.querySelectorAll('.ch-dh-rank')].map((n) => n.textContent);
    expect(ranks).toEqual(['1', '2', '3', '4', '—']);
  });

  it('a short board says players are still to join only when some are', () => {
    const rows = PREVIEW_HOME.leaderboard.rows.slice(0, 3).map((r) => ({ ...r, status: 'steady' as const }));
    const { rerender } = render(<DeskBoard rows={rows} rosterSize={3} />);
    expect(screen.queryByText(/join the board/)).toBeNull();
    rerender(<DeskBoard rows={rows} rosterSize={6} />);
    expect(screen.getByText(/join the board/)).toBeTruthy();
  });

  it('the board and Latest rounds link to their rebuilt routes from the card head', () => {
    render(
      <>
        <DeskBoard rows={PREVIEW_HOME.leaderboard.rows} rosterSize={8} />
        <DeskRounds rounds={PREVIEW_HOME.latestRounds.rounds} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Roster' }).getAttribute('href')).toMatch(/roster$/);
    expect(screen.getByRole('link', { name: 'Team stats' }).getAttribute('href')).toMatch(/stats$/);
  });

  it('Latest rounds holds each score and its to-par in a well', () => {
    const [r] = PREVIEW_HOME.latestRounds.rounds;
    const { container } = render(<DeskRounds rounds={[r!]} />);
    const well = container.querySelector('.ch-dh-score') as HTMLElement;
    expect(within(well).getByText(String(r!.score))).toBeTruthy();
    expect(well.querySelector('em')?.textContent).toBeTruthy();
  });

  it('a short week says what the list holds and never that the week is empty', () => {
    const rows = PREVIEW_HOME.week.agenda.slice(0, 1);
    render(<DeskAgenda rows={rows} />);
    expect(screen.getByText('That’s today and this week’s competitions.')).toBeTruthy();
  });

  it('a full week carries no line', () => {
    render(<DeskAgenda rows={PREVIEW_HOME.week.agenda.slice(0, 4)} />);
    expect(screen.queryByText(/this week’s competitions/)).toBeNull();
  });
});

describe('form bars', () => {
  it('the highest score still draws a bar: a 30% floor, the lowest at full height', () => {
    const { container } = render(<FormBars data={[70, 75, 80]} />);
    const heights = [...container.querySelectorAll('i')].map((n) => parseInt((n as HTMLElement).style.height, 10));
    expect(Math.max(...heights)).toBeLessThanOrEqual(100);
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);
    expect(heights[2]).toBeGreaterThanOrEqual(30);
  });
});
