import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Row, RowGroup } from './Row';

describe('Row', () => {
  it('renders a link row with a chevron when it has an href', () => {
    const { container } = render(<Row title="Cole Bennett" subtitle="Last round Sep 17" value="+2" href="/golf/p/1" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/golf/p/1');
    expect(link.textContent).toContain('Cole Bennett');
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders a button row that calls onClick, without a chevron', () => {
    const onClick = vi.fn();
    const { container } = render(<Row title="Putting" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Putting' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders a plain block with no target and no chevron', () => {
    const { container } = render(<Row title="Handicap" value="4.2" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('wraps the title to two lines instead of truncating it, and is taller with a subtitle', () => {
    const { container, rerender } = render(<Row title="Peek'n Peak Resort, Upper Course" />);
    const title = screen.getByText("Peek'n Peak Resort, Upper Course");
    expect(title.className).toContain('line-clamp-2');
    expect(title.className).not.toContain('truncate');
    expect(container.innerHTML).toContain('min-h-11');
    rerender(<Row title="Course" subtitle="Par 72" />);
    expect(container.innerHTML).toContain('min-h-[60px]');
  });

  it('prints the trailing value and its second line in tabular figures', () => {
    render(<Row title="Scoring average" value="72.8" valueSub="Last 10" />);
    expect(screen.getByText('72.8').className).toContain('tabular-nums');
    expect(screen.getByText('Last 10').className).toContain('text-text-secondary');
  });

  it('draws a ghost row in secondary ink', () => {
    render(<Row title="Scrambling" value="Needs 3 more rounds" ghost />);
    expect(screen.getByText('Scrambling').className).toContain('text-text-secondary');
  });

  it('uses the aria-label override as the accessible name', () => {
    render(<Row title="CB" href="/x" aria-label="Cole Bennett, 2 over" />);
    expect(screen.getByRole('link', { name: 'Cole Bennett, 2 over' })).toBeTruthy();
  });
});

describe('RowGroup', () => {
  it('is a named group on the inset-group radius', () => {
    render(
      <RowGroup label="Recent rounds">
        <Row title="Sep 17" />
      </RowGroup>,
    );
    const group = screen.getByRole('group', { name: 'Recent rounds' });
    expect(group.className).toContain('rounded-fw-sm');
  });
});
