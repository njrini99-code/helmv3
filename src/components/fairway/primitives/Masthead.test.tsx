import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LargeTitleContext } from '../app-shell/LargeTitleContext';
import { Masthead } from './Masthead';

describe('Masthead', () => {
  it('renders one large-title h1 with the context line, action, verdict and segmented slots', () => {
    render(
      <Masthead
        title="Home"
        context="Wed, Sep 23 · 12 full rounds"
        action={<a href="/golf/rounds/new">New</a>}
        verdict={<p>Scoring is trending down.</p>}
        segmented={<nav aria-label="Views" />}
      />,
    );
    const h1 = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(h1.className).toContain('text-large-title');
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByText('Wed, Sep 23 · 12 full rounds').className).not.toMatch(/uppercase|text-eyebrow/);
    expect(screen.getByRole('link', { name: 'New' })).toBeTruthy();
    expect(screen.getByText('Scoring is trending down.')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeTruthy();
  });

  it('drops the context row when there is neither context nor action', () => {
    const { container } = render(<Masthead title="Plan" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders an h2 at level 2', () => {
    render(<Masthead title="Putting" level={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Putting' }).className).toContain('text-title-2');
  });

  it('registers a string level-1 title with the top bar and clears it on unmount', () => {
    const setRegisteredTitle = vi.fn();
    const { unmount } = render(
      <LargeTitleContext.Provider value={{ registeredTitle: null, setRegisteredTitle }}>
        <Masthead title="Rounds" />
      </LargeTitleContext.Provider>,
    );
    expect(setRegisteredTitle).toHaveBeenLastCalledWith('Rounds');
    unmount();
    expect(setRegisteredTitle).toHaveBeenLastCalledWith(null);
  });

  it('does not register a level-2 title', () => {
    const setRegisteredTitle = vi.fn();
    render(
      <LargeTitleContext.Provider value={{ registeredTitle: null, setRegisteredTitle }}>
        <Masthead title="Putting" level={2} />
      </LargeTitleContext.Provider>,
    );
    expect(setRegisteredTitle).not.toHaveBeenCalled();
  });
});
