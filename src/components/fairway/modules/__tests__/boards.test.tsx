// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Filmstrip } from '../Filmstrip';
import { MatrixBoard } from '../MatrixBoard';
import type { FilmstripHole, MatrixBoardRow } from '../types';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';

const HOLES: FilmstripHole[] = Array.from({ length: 18 }, (_, i) => ({
  n: i + 1,
  par: 4,
  score: 4,
}));

describe('Filmstrip', () => {
  it('renders 18 buttons', () => {
    render(<Filmstrip holes={HOLES} />);
    expect(screen.getAllByRole('button')).toHaveLength(18);
  });

  it('fires onScrub with hole 7 on click', () => {
    const onScrub = vi.fn();
    render(<Filmstrip holes={HOLES} onScrub={onScrub} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hole 7, par 4, score 4' }));
    expect(onScrub).toHaveBeenCalledTimes(1);
    expect(onScrub).toHaveBeenCalledWith(expect.objectContaining({ n: 7, par: 4, score: 4 }));
  });

  it('wraps the strip in an overflow-x-auto container so 18 narrow columns scroll instead of crushing', () => {
    const { container } = render(<Filmstrip holes={HOLES} />);
    const scrollWrap = container.querySelector('[data-slot="filmstrip-scroll"]');
    expect(scrollWrap).not.toBeNull();
    expect(scrollWrap!.className).toContain('overflow-x-auto');
    const strip = scrollWrap!.querySelector('[data-slot="filmstrip"]');
    expect(strip).not.toBeNull();
    expect(scrollWrap!.contains(strip)).toBe(true);
  });

  it('renders a HoleShotPath strip SVG per hole (the premium visual, not a plain bar) and tones its ring by score vs par', async () => {
    const toneHoles: FilmstripHole[] = [
      { n: 1, par: 4, score: 3 }, // birdie
      { n: 2, par: 4, score: 4 }, // par
      { n: 3, par: 4, score: 6 }, // double
    ];
    const { container } = render(<Filmstrip holes={toneHoles} />);

    // HoleShotPath is dynamically imported (ssr:false) — wait for the real
    // component (an <svg>), not the loading Skeleton, to land.
    await waitFor(() => {
      expect(container.querySelectorAll('svg')).toHaveLength(3);
    });
    const boxes = container.querySelectorAll('svg');

    expect(boxes[0]!.parentElement!.className).toContain('ring-accent-500'); // birdie
    expect(boxes[1]!.parentElement!.className).toContain('ring-warm-300'); // par
    expect(boxes[2]!.parentElement!.className).toContain('ring-danger'); // double
  });

  it('passes each hole its own shots from shotsByHole down to the strip visual', async () => {
    const holes: FilmstripHole[] = [
      { n: 1, par: 4, score: 4 },
      { n: 2, par: 3, score: 3 },
    ];
    const shots: ShotInput[] = [
      { shot_number: 1, lie_after: 'sand', distance_to_hole_after: 80 },
    ];
    const shotsByHole = new Map<number, ShotInput[]>([[1, shots]]);
    const { container } = render(<Filmstrip holes={holes} shotsByHole={shotsByHole} />);

    await waitFor(() => {
      expect(container.querySelectorAll('svg')).toHaveLength(2);
    });
    // Hole 1 has a logged sand shot — its strip renders the sand-lie dot
    // color; hole 2 has none in the map, so it draws the empty turf only.
    const [hole1Svg, hole2Svg] = container.querySelectorAll('svg');
    expect(hole1Svg!.innerHTML).toContain('#d4b97a'); // LIE_COLOR.sand
    expect(hole2Svg!.querySelectorAll('circle[fill="#d4b97a"]')).toHaveLength(0);
  });
});

describe('MatrixBoard', () => {
  const rowWithExpand: MatrixBoardRow = {
    id: 'mason',
    cells: ['Mason Rivers', '2', '3'],
    expand: <div>Slump length 6 rds</div>,
    ariaLabel: 'Mason Rivers, expandable row',
  };
  const rowWithoutExpand: MatrixBoardRow = {
    id: 'jackson',
    cells: ['Jackson Hale', '1', '2'],
    ariaLabel: 'Jackson Hale row',
  };

  const columns = [
    { key: 'who', label: 'Player' },
    { key: 'tee', label: 'Tee', align: 'center' as const },
    { key: 'app', label: 'App', align: 'center' as const },
  ];

  it('toggles aria-expanded when an expandable row is clicked', () => {
    render(
      <MatrixBoard
        kpis={[{ label: 'Team scoring', value: '73.6' }]}
        columns={columns}
        rows={[rowWithExpand]}
      />,
    );
    const row = screen.getByRole('button', { name: 'Mason Rivers, expandable row' });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Slump length 6 rds')).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Slump length 6 rds')).not.toBeInTheDocument();
  });

  it('omits aria-expanded on a row with no expand content', () => {
    render(<MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />);
    const row = screen.getByRole('button', { name: 'Jackson Hale row' });
    expect(row).not.toHaveAttribute('aria-expanded');
  });
});
