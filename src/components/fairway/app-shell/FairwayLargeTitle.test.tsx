// =============================================================================
// src/components/fairway/app-shell/FairwayLargeTitle.test.tsx
//
// Pins the in-content large-title primitive's rendering rules (eyebrow/meta
// breakpoint gating) and its registration contract with the shell's standing
// top-bar title: registers on mount/update, clears on unmount so a route that
// hasn't adopted this primitive never inherits a stale title.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { FairwayLargeTitle } from './FairwayLargeTitle';
import { FairwayLargeTitleProvider, useLargeTitle } from './LargeTitleContext';

function TitleReader() {
  const { registeredTitle } = useLargeTitle();
  return <span data-testid="registered">{registeredTitle ?? '(none)'}</span>;
}

describe('FairwayLargeTitle — rendering', () => {
  it('renders the title as the one semantic <h1>', () => {
    render(<FairwayLargeTitle title="Roster" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Roster' })).toBeInTheDocument();
  });

  it('renders the eyebrow only in the desktop-only slot (hidden md:block)', () => {
    render(<FairwayLargeTitle title="Roster" eyebrow="Team" />);
    const eyebrow = screen.getByText('Team');
    expect(eyebrow.className).toContain('hidden');
    expect(eyebrow.className).toContain('md:block');
  });

  it('renders meta only in the phone-only slot (md:hidden)', () => {
    render(<FairwayLargeTitle title="Roster" meta="28 players · 4 classes" />);
    const meta = screen.getByText('28 players · 4 classes');
    expect(meta.className).toContain('md:hidden');
  });

  it('omits the eyebrow and meta lines entirely when not provided', () => {
    render(<FairwayLargeTitle title="Roster" />);
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
    expect(screen.queryByText(/players/)).not.toBeInTheDocument();
  });

  it('renders the actions slot when provided', () => {
    render(<FairwayLargeTitle title="Roster" actions={<Button type="button">Invite</Button>} />);
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });
});

describe('FairwayLargeTitle — standing-bar-title registration', () => {
  it('registers its title with the shell on mount', () => {
    render(
      <FairwayLargeTitleProvider>
        <FairwayLargeTitle title="Roster" />
        <TitleReader />
      </FairwayLargeTitleProvider>,
    );
    expect(screen.getByTestId('registered')).toHaveTextContent('Roster');
  });

  it('updates the registered title when the title prop changes', () => {
    function Wrapper({ title }: { title: string }) {
      return (
        <FairwayLargeTitleProvider>
          <FairwayLargeTitle title={title} />
          <TitleReader />
        </FairwayLargeTitleProvider>
      );
    }
    const { rerender } = render(<Wrapper title="Roster" />);
    expect(screen.getByTestId('registered')).toHaveTextContent('Roster');

    rerender(<Wrapper title="Calendar" />);
    expect(screen.getByTestId('registered')).toHaveTextContent('Calendar');
  });

  it('clears the registered title when it unmounts, so the shell never inherits a stale title', () => {
    function Wrapper({ show }: { show: boolean }) {
      return (
        <FairwayLargeTitleProvider>
          {show && <FairwayLargeTitle title="Roster" />}
          <TitleReader />
        </FairwayLargeTitleProvider>
      );
    }
    const { rerender } = render(<Wrapper show />);
    expect(screen.getByTestId('registered')).toHaveTextContent('Roster');

    rerender(<Wrapper show={false} />);
    expect(screen.getByTestId('registered')).toHaveTextContent('(none)');
  });
});
