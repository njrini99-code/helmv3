import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamField, type TeamFieldPlayer } from './TeamField';

const pts = (id: string, toPars: Array<number | null>) =>
  toPars.map((toPar, i) => ({ id: `${id}-${i}`, date: `2026-09-0${i + 1}`, toPar }));

const PLAYERS: TeamFieldPlayer[] = [
  { id: 'a', name: 'Cole Bennett', rounds: pts('a', [2, -1, 0, 3]), average: 1, delta: -0.5, href: '/golf/p/a' },
  { id: 'b', name: 'Ava Lin', rounds: pts('b', [4, 5, 6]), average: 5, delta: 1.5 },
  { id: 'c', name: 'Sam Ortiz', rounds: pts('c', [1, null, 2, 1]), average: 1.3, delta: null },
];

describe('TeamField', () => {
  it('is a named list, slipping players first and players with no trend last', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team, last 30 days" />);
    expect(screen.getByRole('list', { name: 'Team, last 30 days' })).toBeTruthy();
    const order = [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-player'));
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('keeps the given order with sort="none"', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team" sort="none" />);
    const order = [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-player'));
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('reads each row as text with the registry numbers', () => {
    render(<TeamField players={PLAYERS} label="Team" />);
    expect(screen.getByText('Ava Lin, 3 rounds, average plus 5.0, Early read, change plus 1.5')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cole Bennett, 4 rounds, average plus 1.0, Early read, change minus 0.5' })).toBeTruthy();
  });

  it('tones the change: a rise in average is amber, a fall is green', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team" />);
    expect(container.querySelector('[data-player="b"] [data-delta]')!.className).toContain('text-fw-warning-ink');
    expect(container.querySelector('[data-player="a"] [data-delta]')!.className).toContain('text-fw-success-ink');
    expect(container.querySelector('[data-player="c"] [data-delta]')).toBeNull();
  });

  it('draws one bar per plotted round in the golf tones, skipping rounds with no to par', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team" />);
    const a = [...container.querySelectorAll('[data-player="a"] [data-bar]')].map((b) => b.getAttribute('data-bar'));
    expect(a).toEqual(['over', 'under', 'level', 'over']);
    expect(container.querySelectorAll('[data-player="c"] [data-bar]')).toHaveLength(3);
    expect(container.querySelector('[data-player="a"] [data-bar="under"]')!.className).toContain('bg-accent-fill');
  });

  it('puts every strip on one scale: bar height is proportional to to par across rows', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team" />);
    const heights = (id: string) =>
      [...container.querySelectorAll(`[data-player="${id}"] [data-bar="over"]`)].map((b) =>
        parseFloat((b as HTMLElement).style.height),
      );
    const [cole2] = heights('a');
    const [ava4] = heights('b');
    // Cole's +2 and Ava's +4 share one scale (team span +6 to −1).
    expect(ava4! / cole2!).toBeCloseTo(2, 1);
  });

  it('prints an early average in secondary ink', () => {
    const { container } = render(<TeamField players={PLAYERS} label="Team" />);
    const avg = container.querySelector('[data-player="b"] [data-avg]')!;
    expect(avg.className).toContain('text-text-secondary');
  });

  it('says "No change" for a zero change instead of even par', () => {
    const { container } = render(
      <TeamField players={[{ ...PLAYERS[0]!, delta: 0 }]} label="Team" />,
    );
    const delta = container.querySelector('[data-delta]')!;
    expect(delta.textContent).toBe('No change');
    expect(delta.className).toContain('text-text-secondary');
    expect(screen.getByRole('link').textContent).toContain('average plus 1.0, Early read, no change');
  });

  it('prints a dash and the floor note for a thin average', () => {
    const { container } = render(
      <TeamField players={[{ id: 'x', name: 'New Player', rounds: pts('x', [3]), average: 3, delta: 1 }]} label="Team" />,
    );
    expect(container.textContent).toContain('—');
    expect(screen.getByText('New Player, 1 round, average Needs 2 more rounds')).toBeTruthy();
  });
});
