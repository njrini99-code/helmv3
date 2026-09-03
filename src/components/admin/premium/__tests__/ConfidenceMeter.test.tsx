import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceMeter } from '../ConfidenceMeter';

describe('ConfidenceMeter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the percent as text, never only a bar', () => {
    render(<ConfidenceMeter value={0.86} />);
    expect(screen.getByText('86%')).toBeInTheDocument();
  });

  it('clamps a value of 1.0 to below 100% and warns in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ConfidenceMeter value={1} />);
    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('exposes the value via role="meter" for assistive tech', () => {
    render(<ConfidenceMeter value={0.5} label="merge confidence" />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '50');
    expect(meter).toHaveAttribute('aria-valuemax', '99');
  });
});
