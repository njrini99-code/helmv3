/**
 * FairwayCalendarSkeleton — matches the real masthead pair's shape so there
 * is no layout shift when FairwayCalendarHero (phone) / FairwayCalendarToolbar
 * (desktop) mount in its place.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayCalendarSkeleton } from '../FairwayCalendarSkeleton';

describe('FairwayCalendarSkeleton', () => {
  it('announces the loading state once', () => {
    render(<FairwayCalendarSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading calendar…')).toBeInTheDocument();
  });

  it('renders two masthead shapes — the phone bar hidden from md, the desktop Toolbar row hidden below it', () => {
    const { container } = render(<FairwayCalendarSkeleton />);
    const phone = container.querySelector('.md\\:hidden');
    const desktop = container.querySelector('.md\\:flex');
    expect(phone).not.toBeNull();
    expect(desktop).not.toBeNull();
    expect(phone!.className).toContain('md:hidden');
    expect(desktop!.className).toContain('hidden');
    expect(desktop!.className).toContain('md:flex');
  });
});
