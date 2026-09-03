import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnknownValue, UnknownInline } from '../UnknownValue';

describe('UnknownValue', () => {
  it('defaults to the word "Unknown" — never blank, never a bare dash', () => {
    render(<UnknownValue />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders a custom label and carries the reason as a tooltip', () => {
    render(<UnknownValue label="Flight Recorder unknown" reason="No run id was attached to this incident." />);
    const el = screen.getByText('Flight Recorder unknown');
    expect(el).toHaveAttribute('title', 'No run id was attached to this incident.');
  });

  it('prefers richer children over the plain label when both are given', () => {
    render(
      <UnknownValue label="fallback">
        <span>rich content</span>
      </UnknownValue>,
    );
    expect(screen.getByText('rich content')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });
});

describe('UnknownInline', () => {
  it('renders lowercase inline text by default', () => {
    render(<UnknownInline />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});
