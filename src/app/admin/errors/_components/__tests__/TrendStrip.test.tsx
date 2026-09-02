import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendStrip } from '@/app/admin/errors/_components/TrendStrip';

describe('TrendStrip', () => {
  it('renders one bar per day with a per-bar accessible count', () => {
    render(<TrendStrip buckets={[0, 1, 2, 0, 5, 3, 1]} truncated={false} unavailable={false} />);
    expect(screen.getByRole('img', { name: '5 occurrences, 2 days ago' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 occurrence, today' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 occurrences, 6 days ago' })).toBeInTheDocument();
  });

  it('sums the total and states it plainly when not truncated', () => {
    render(<TrendStrip buckets={[0, 1, 2, 0, 5, 3, 1]} truncated={false} unavailable={false} />);
    expect(screen.getByText('12 occurrences over the last 7 days')).toBeInTheDocument();
  });

  it('labels the total as a lower bound when the underlying fetch was capped', () => {
    render(<TrendStrip buckets={[100, 100, 100, 100, 100, 100, 100]} truncated unavailable={false} />);
    expect(screen.getByText(/at least 700 occurrences over the last 7 days — capped/)).toBeInTheDocument();
  });

  it('renders a flat all-zero week without crashing (no divide-by-zero bar heights)', () => {
    render(<TrendStrip buckets={[0, 0, 0, 0, 0, 0, 0]} truncated={false} unavailable={false} />);
    expect(screen.getByText('0 occurrences over the last 7 days')).toBeInTheDocument();
  });

  // The distinction this component exists to protect: a failed query and a
  // quiet week produce the same empty bucket array, and rendering them the
  // same way tells an operator the error stopped when it may not have.
  it('says the trend is unavailable rather than drawing a quiet week', () => {
    render(<TrendStrip buckets={[]} truncated={false} unavailable />);
    expect(screen.getByText(/7-day trend unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/0 occurrences over the last 7 days/)).not.toBeInTheDocument();
  });
});
