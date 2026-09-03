import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PosturePill, ReleaseWatchPosturePill } from '../PosturePill';

describe('PosturePill', () => {
  it('renders a known tone through StatusPill', () => {
    render(<PosturePill tone="success">RESOLVED</PosturePill>);
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
  });

  it('routes the "unknown" tone through the hatched UnknownValue treatment, not a plain neutral pill', () => {
    render(
      <PosturePill tone="unknown" reason="Read failed.">
        RELEASE WATCH
      </PosturePill>,
    );
    const el = screen.getByText('RELEASE WATCH');
    expect(el).toHaveAttribute('title', 'Read failed.');
    expect(el).toHaveAttribute('data-slot', 'bridge-unknown-value');
  });
});

describe('ReleaseWatchPosturePill', () => {
  it('labels PROVEN HEALTHY with a success tone', () => {
    render(<ReleaseWatchPosturePill state="proven-healthy" />);
    expect(screen.getByText('PROVEN HEALTHY')).toBeInTheDocument();
  });

  it('renders unknown watch state with the hatched treatment and a reason', () => {
    render(<ReleaseWatchPosturePill state="unknown" />);
    const el = screen.getByText('UNKNOWN');
    expect(el).toHaveAttribute('data-slot', 'bridge-unknown-value');
  });
});
