// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlayerSpine } from '../PlayerSpine';

vi.mock('@/components/fairway/modules', () => ({
  Spine: () => <div data-testid="desktop-spine" />,
}));

describe('PlayerSpine mobile layout', () => {
  it('keeps the mobile Log round action at the shared 44px touch target', () => {
    render(
      <PlayerSpine
        hero={{ value: '72.4', unit: 'score' }}
        verdict="Keep building your round sample."
        priorities={[]}
        ledger={[]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Log round' })).toHaveClass('min-h-11');
  });

  it('can hide only the mobile hero while retaining the desktop spine', () => {
    render(
      <PlayerSpine
        hero={{ value: '72.4', unit: 'score' }}
        verdict="Keep building your round sample."
        priorities={[]}
        ledger={[]}
        mobileClassName="hidden"
      />,
    );

    expect(screen.getByRole('link', { name: 'Log round' }).closest('aside')).toHaveClass('hidden');
    expect(screen.getByTestId('desktop-spine')).toBeInTheDocument();
  });
});
