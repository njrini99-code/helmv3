import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminStatusBanner } from '@/app/admin/_components/AdminStatusBanner';

describe('AdminStatusBanner', () => {
  it('renders the all-clear line with a timestamp', () => {
    render(<AdminStatusBanner state="nominal" attentionCount={0} checkedAt="2026-07-01T12:00:00Z" />);
    expect(screen.getByText(/All systems nominal/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('renders the attention count when red', () => {
    render(<AdminStatusBanner state="critical" attentionCount={3} checkedAt="2026-07-01T12:00:00Z" />);
    expect(screen.getByText(/3 items need attention/i)).toBeInTheDocument();
  });
  it('renders an explicit STALE state distinct from healthy-quiet', () => {
    render(<AdminStatusBanner state="stale" attentionCount={0} checkedAt="2026-07-01T12:00:00Z" />);
    expect(screen.getByText(/status feed stale/i)).toBeInTheDocument();
  });
});
