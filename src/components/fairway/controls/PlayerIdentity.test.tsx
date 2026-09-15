// @vitest-environment jsdom
/**
 * ============================================================================
 * PlayerIdentity — render smoke + meta line clamp (2026-09-10, primitives
 * follow-up)
 * ----------------------------------------------------------------------------
 * The meta line used to be a bare `truncate` (1 line everywhere), which cut
 * an attention-reason meta line mid-sentence on a phone board row. It now
 * defaults to clamping at 2 lines below `md` and 1 line from `md` up
 * (`metaLines={2}`), with `metaLines={1}` kept for the old behavior.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerIdentity } from './PlayerIdentity';

describe('PlayerIdentity — render smoke', () => {
  it('renders the name and, when given, the meta line', () => {
    render(<PlayerIdentity name="Jordan Lee" meta="Class of '27" />);
    // Two matches for "Jordan Lee" are expected: the visible name span, and
    // the Avatar's own sr-only accessible name — select the visible one.
    expect(screen.getByText('Jordan Lee', { selector: 'span.text-text-primary' })).toBeInTheDocument();
    expect(screen.getByText("Class of '27")).toBeInTheDocument();
  });

  it('omits the meta line entirely when not given', () => {
    render(<PlayerIdentity name="Jordan Lee" />);
    expect(screen.queryByText("Class of '27")).not.toBeInTheDocument();
  });

  it('renders nameAddon inline with the name and trailing after the identity block', () => {
    render(
      <PlayerIdentity
        name="Jordan Lee"
        nameAddon={<span>'27</span>}
        trailing={<button type="button">Message</button>}
      />,
    );
    expect(screen.getByText("'27")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message' })).toBeInTheDocument();
  });
});

describe('PlayerIdentity — meta line clamp', () => {
  it('defaults to a 2-line clamp below md and 1 line from md up', () => {
    render(<PlayerIdentity name="Jordan Lee" meta="Trending down, missed 3 goals this month" />);
    const meta = screen.getByText('Trending down, missed 3 goals this month');
    expect(meta.className).toContain('line-clamp-2');
    expect(meta.className).toContain('md:line-clamp-1');
    // Not the old always-1-line `truncate` utility.
    expect(meta.className).not.toMatch(/(^|\s)truncate(\s|$)/);
  });

  it('metaLines={1} keeps the old single-line-everywhere behavior', () => {
    render(<PlayerIdentity name="Jordan Lee" meta="Trending down" metaLines={1} />);
    const meta = screen.getByText('Trending down');
    expect(meta.className).toContain('line-clamp-1');
    expect(meta.className).not.toContain('line-clamp-2');
  });
});
