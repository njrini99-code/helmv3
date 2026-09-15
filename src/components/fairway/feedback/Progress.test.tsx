// @vitest-environment jsdom
/**
 * ============================================================================
 * Progress — completion of a PROCESS (role="progressbar")
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Progress } from './Progress';

describe('Progress — determinate', () => {
  it('exposes the correct aria-value* trio and clamps out-of-range values', () => {
    render(<Progress value={130} label="Uploading round data" />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading round data' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps a negative value to 0', () => {
    render(<Progress value={-20} label="Sync" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders the fill width proportional to value', () => {
    const { container } = render(<Progress value={40} label="Import" />);
    const fill = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(fill.style.width).toBe('40%');
  });

  it('uses the accent-650 fill by default and a semantic tone when given', () => {
    const { container: def } = render(<Progress value={50} label="Import" />);
    expect((def.querySelector('[aria-hidden="true"]') as HTMLElement).className).toContain('bg-accent-650');

    const { container: danger } = render(<Progress value={50} tone="danger" label="Import" />);
    expect((danger.querySelector('[aria-hidden="true"]') as HTMLElement).className).toContain('bg-fw-danger');
  });

  it('sizes the track h-1.5 (sm) or h-2 (md, default)', () => {
    render(<Progress value={10} label="A" size="sm" />);
    expect(screen.getByRole('progressbar').className).toContain('h-1.5');
  });
});

describe('Progress — indeterminate', () => {
  it('omits aria-valuenow/min/max and sets data-indeterminate', () => {
    render(<Progress indeterminate label="Syncing" />);
    const bar = screen.getByRole('progressbar', { name: 'Syncing' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemin');
    expect(bar).not.toHaveAttribute('aria-valuemax');
    expect(bar).toHaveAttribute('data-indeterminate', '');
  });
});
