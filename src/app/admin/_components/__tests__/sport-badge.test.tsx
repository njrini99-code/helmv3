import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SportBadge } from '@/app/admin/_components/SportBadge';

describe('SportBadge', () => {
  it('labels golf with the green ink', () => {
    render(<SportBadge sport="golf" />);
    const badge = screen.getByText('Golf');
    expect(badge.className).toContain('text-accent-700');
  });
  it('labels baseball with the clay ink', () => {
    render(<SportBadge sport="baseball" />);
    const badge = screen.getByText('Baseball');
    expect(badge.className).toContain('text-team-baseball');
  });
  it('renders nothing for null (no fake attribution)', () => {
    const { container } = render(<SportBadge sport={null} />);
    expect(container.firstChild).toBeNull();
  });
});
