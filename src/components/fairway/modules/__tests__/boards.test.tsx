// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // Hole 1 has a logged sand shot — its strip renders a dot at all (a
    // cream-fill marker, never the old lie-colored fill — see
    // `HoleShotPath`'s 2026-07-22 "cream markers" redesign) AND, because a
    // sand lie with no logged miss_direction is a MISS with no direction
    // (Wave B's shape-based hit/miss signal), a neutral radiating burst
    // glyph. Hole 2 has no entry in the map at all — no dot, no glyph, just
    // the empty turf.
    const [hole1Svg, hole2Svg] = container.querySelectorAll('svg');
    expect(hole1Svg!.querySelectorAll('circle[fill="#fbf3e0"]').length).toBeGreaterThan(0);
    expect(hole1Svg!.querySelectorAll('[data-shot-outcome="miss"]')).toHaveLength(1);
    expect(hole1Svg!.querySelectorAll('[data-miss-burst="true"]')).toHaveLength(1);
    expect(hole1Svg!.querySelectorAll('[data-miss-wedge="true"]')).toHaveLength(0);
    // Never the old (2026-07-22-and-earlier, now-legacy) lie-colored fill.
    expect(hole1Svg!.querySelectorAll('circle[fill="#d4b97a"]')).toHaveLength(0);
    expect(hole2Svg!.querySelectorAll('circle[fill="#fbf3e0"]')).toHaveLength(0);
    expect(hole2Svg!.querySelectorAll('[data-shot-outcome]')).toHaveLength(0);
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

  it('renders row.actions as a sibling of the press-target, never nested inside it', () => {
    const rowWithActions: MatrixBoardRow = {
      id: 'avery',
      cells: ['Avery Cole', '3', '1'],
      ariaLabel: 'Avery Cole row',
      // A fixture standing in for whatever the caller passes; the assertion
      // is about where it lands in the tree, not what element it is.
      // eslint-disable-next-line helm/no-raw-button
      actions: <button type="button">Overflow</button>,
    };
    const { container } = render(
      <MatrixBoard kpis={[]} columns={columns} rows={[rowWithActions]} />,
    );

    const rowButton = screen.getByRole('button', { name: 'Avery Cole row' });
    const overflowButton = screen.getByRole('button', { name: 'Overflow' });

    // Never a button nested inside a button.
    expect(rowButton.contains(overflowButton)).toBe(false);
    expect(overflowButton.contains(rowButton)).toBe(false);

    // Rendered as a dedicated actions slot, a sibling of the row button
    // under the shared row wrapper.
    const actionsSlot = container.querySelector('[data-slot="matrix-row-actions"]');
    expect(actionsSlot).not.toBeNull();
    expect(actionsSlot!.contains(overflowButton)).toBe(true);
    expect(actionsSlot!.parentElement).toBe(rowButton.parentElement);
  });

  it('omits the actions slot entirely when a row has no actions', () => {
    const { container } = render(
      <MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />,
    );
    expect(container.querySelector('[data-slot="matrix-row-actions"]')).toBeNull();
  });

  it('defers to an externally controlled expandedRowId instead of internal state', () => {
    const onExpandedRowChange = vi.fn();
    const { rerender } = render(
      <MatrixBoard
        kpis={[]}
        columns={columns}
        rows={[rowWithExpand]}
        expandedRowId={null}
        onExpandedRowChange={onExpandedRowChange}
      />,
    );
    const row = screen.getByRole('button', { name: 'Mason Rivers, expandable row' });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    // Clicking a controlled row never flips its own state — it only reports
    // the candidate id upward.
    fireEvent.click(row);
    expect(onExpandedRowChange).toHaveBeenCalledTimes(1);
    expect(onExpandedRowChange).toHaveBeenCalledWith('mason');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Slump length 6 rds')).not.toBeInTheDocument();

    // The parent "accepts" the change by feeding the id back in.
    rerender(
      <MatrixBoard
        kpis={[]}
        columns={columns}
        rows={[rowWithExpand]}
        expandedRowId="mason"
        onExpandedRowChange={onExpandedRowChange}
      />,
    );
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Slump length 6 rds')).toBeInTheDocument();

    // Clicking again while expanded reports null (collapse), not toggled
    // internal state.
    fireEvent.click(row);
    expect(onExpandedRowChange).toHaveBeenCalledTimes(2);
    expect(onExpandedRowChange).toHaveBeenLastCalledWith(null);
  });

  it('leaves independent per-row uncontrolled state intact when expandedRowId is omitted', () => {
    const secondRowWithExpand: MatrixBoardRow = {
      id: 'harlow',
      cells: ['Harlow Reyes', '4', '2'],
      expand: <div>Second expandable row</div>,
      ariaLabel: 'Harlow Reyes, expandable row',
    };
    render(
      <MatrixBoard
        kpis={[]}
        columns={columns}
        rows={[rowWithExpand, secondRowWithExpand]}
      />,
    );
    const first = screen.getByRole('button', { name: 'Mason Rivers, expandable row' });
    const second = screen.getByRole('button', { name: 'Harlow Reyes, expandable row' });

    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  describe('onRowSelect', () => {
    it('fires on click for a bare row (no expand content), without expanding it', () => {
      const onRowSelect = vi.fn();
      render(
        <MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} onRowSelect={onRowSelect} />,
      );
      const row = screen.getByRole('row', { name: 'Jackson Hale row' });
      fireEvent.click(row);
      expect(onRowSelect).toHaveBeenCalledTimes(1);
      expect(onRowSelect).toHaveBeenCalledWith(rowWithoutExpand);
      // Still nothing to expand — no aria-expanded, no expand band.
      expect(row).not.toHaveAttribute('aria-expanded');
    });

    it('fires on Enter and Space via real keyboard activation', async () => {
      const user = userEvent.setup();
      const onRowSelect = vi.fn();
      render(
        <MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} onRowSelect={onRowSelect} />,
      );
      const row = screen.getByRole('row', { name: 'Jackson Hale row' });
      row.focus();
      await user.keyboard('{Enter}');
      expect(onRowSelect).toHaveBeenCalledTimes(1);
      await user.keyboard(' ');
      expect(onRowSelect).toHaveBeenCalledTimes(2);
    });

    it('never fires for a row that has expand content — that row keeps toggling instead', () => {
      const onRowSelect = vi.fn();
      render(
        <MatrixBoard kpis={[]} columns={columns} rows={[rowWithExpand]} onRowSelect={onRowSelect} />,
      );
      const row = screen.getByRole('button', { name: 'Mason Rivers, expandable row' });
      fireEvent.click(row);
      expect(onRowSelect).not.toHaveBeenCalled();
      expect(row).toHaveAttribute('aria-expanded', 'true');
    });

    it('marks the row aria-selected when selectedId matches its id, and not otherwise', () => {
      const onRowSelect = vi.fn();
      const { rerender } = render(
        <MatrixBoard
          kpis={[]}
          columns={columns}
          rows={[rowWithoutExpand]}
          onRowSelect={onRowSelect}
          selectedId={null}
        />,
      );
      const row = screen.getByRole('row', { name: 'Jackson Hale row' });
      expect(row).toHaveAttribute('aria-selected', 'false');

      rerender(
        <MatrixBoard
          kpis={[]}
          columns={columns}
          rows={[rowWithoutExpand]}
          onRowSelect={onRowSelect}
          selectedId="jackson"
        />,
      );
      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('leaves a bare row exactly as before (no role, no tabIndex, no click handler) when onRowSelect is omitted', () => {
      render(<MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />);
      const row = screen.getByRole('button', { name: 'Jackson Hale row' });
      expect(row).not.toHaveAttribute('aria-selected');
      fireEvent.click(row);
      // No throw, no state change to observe — the assertion is simply that
      // this row is still reachable by its native button role, unchanged.
      expect(row).toBeInTheDocument();
    });
  });

  describe('hideOnMobile', () => {
    it('hides an extra column key below 940px in addition to the built-in set', () => {
      render(
        <MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} hideOnMobile={['app']} />,
      );
      // 'app' is not one of the built-in HIDE_ON_MOBILE keys, so without the
      // prop it would stay visible on phone; with it, it collapses like the
      // built-ins do (header AND the matching data cell).
      const appHeader = screen.getByRole('columnheader', { name: 'App' });
      expect(appHeader.className).toContain('hidden');
      expect(appHeader.className).toContain('min-[940px]:block');

      const row = screen.getByRole('button', { name: 'Jackson Hale row' });
      const appCell = row.children[2] as HTMLElement; // columns: who, tee, app
      expect(appCell.className).toContain('hidden');
      expect(appCell.className).toContain('min-[940px]:flex');
    });

    it('keeps the built-in hidden set working when hideOnMobile is omitted', () => {
      render(<MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />);
      const teeHeader = screen.getByRole('columnheader', { name: 'Tee' });
      // 'tee' is not in the built-in set and no hideOnMobile was passed, so
      // it must stay visible at every width.
      expect(teeHeader.className).not.toContain('hidden');
    });
  });

  describe('identityTrack', () => {
    it('defaults the first column track to minmax(0,2fr), not the old 120px-floor track', () => {
      const { container } = render(
        <MatrixBoard kpis={[]} columns={columns} rows={[rowWithoutExpand]} />,
      );
      const board = container.querySelector('[data-slot="matrix-board"]') as HTMLElement;
      expect(board.style.getPropertyValue('--mtx-mobile').split(' ')[0]).toBe('minmax(0,2fr)');
      expect(board.style.getPropertyValue('--mtx-desktop').split(' ')[0]).toBe('minmax(0,2fr)');
    });

    it('accepts an override for the first column track', () => {
      const { container } = render(
        <MatrixBoard
          kpis={[]}
          columns={columns}
          rows={[rowWithoutExpand]}
          identityTrack="minmax(160px,2.4fr)"
        />,
      );
      const board = container.querySelector('[data-slot="matrix-board"]') as HTMLElement;
      expect(board.style.getPropertyValue('--mtx-desktop').split(' ')[0]).toBe('minmax(160px,2.4fr)');
    });
  });
});
