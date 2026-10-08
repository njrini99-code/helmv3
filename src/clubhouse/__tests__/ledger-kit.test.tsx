import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeatureCard, FigureRow, LedgerList, LedgerRow, PageIntro } from '../ui/Ledger';

/**
 * The Ledger kit's additive props (2026-10-08): a page's own class, its catalog number and an accessible name on every
 * piece, onClick where a piece can act, and an h2 intro under a bar that holds the h1. What already rendered renders
 * the same.
 */
describe('Ledger kit', () => {
  it('a row takes a class, a number and a name on itself; a plain row is named on its list item', async () => {
    const open = vi.fn();
    render(
      <LedgerList label="Players" code="T-1" className="x-list">
        <LedgerRow title="Jonah Okafor" meta="Senior" trail="72.4" onClick={open} className="x-row" code="T-2" label="Jonah Okafor, 72.4" />
        <LedgerRow title="Tee times" href="/golf/dashboard/calendar" code="T-3" label="Open tee times" />
        <LedgerRow title="Theo Marchetti" trail="74.1" code="T-4" label="Theo Marchetti, 74.1" className="x-plain" />
      </LedgerList>,
    );
    const list = screen.getByRole('list', { name: 'Players' });
    expect(list.className).toBe('ch-lgr x-list');
    expect(list.getAttribute('data-ch-code')).toBe('T-1');
    const button = screen.getByRole('button', { name: 'Jonah Okafor, 72.4' });
    expect(button.className).toBe('ch-lgr__row is-link x-row');
    expect(button.getAttribute('data-ch-code')).toBe('T-2');
    await userEvent.setup().click(button);
    expect(open).toHaveBeenCalledTimes(1);
    const link = screen.getByRole('link', { name: 'Open tee times' });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/calendar');
    expect(link.getAttribute('data-ch-code')).toBe('T-3');
    const plain = document.querySelector('[data-ch-code="T-4"]')!;
    expect(plain.tagName).toBe('DIV');
    expect(plain.className).toBe('ch-lgr__row x-plain');
    expect(plain.hasAttribute('aria-label')).toBe(false);
    expect(screen.getByRole('listitem', { name: 'Theo Marchetti, 74.1' }).contains(plain)).toBe(true);
  });

  it('a row with a link and a click runs the click as the link is followed', async () => {
    const remember = vi.fn();
    render(
      <LedgerList>
        <LedgerRow title="Spring qualifier" href="#q" onClick={remember} />
      </LedgerList>,
    );
    await userEvent.setup().click(screen.getByRole('link', { name: /Spring qualifier/ }));
    expect(remember).toHaveBeenCalledTimes(1);
  });

  it('the figures take a class, a number and a name; without them they render as before', () => {
    const items = [
      { label: 'Avg', value: '72.4' },
      { label: 'Best', value: '68', tone: 'under' as const },
    ];
    const { container, rerender } = render(<FigureRow items={items} />);
    const dl = container.querySelector('dl')!;
    expect(dl.className).toBe('ch-fgr');
    expect(dl.hasAttribute('data-ch-code')).toBe(false);
    expect(dl.hasAttribute('aria-label')).toBe(false);
    rerender(<FigureRow items={items} className="x-figs" code="T-5" label="Season figures" />);
    expect(dl.className).toBe('ch-fgr x-figs');
    expect(dl.getAttribute('data-ch-code')).toBe('T-5');
    expect(dl.getAttribute('aria-label')).toBe('Season figures');
  });

  it('the feature card acts as a button with onClick, is a link with href, and a named group when plain', async () => {
    const open = vi.fn();
    const { rerender } = render(<FeatureCard kicker="Up next" title="Spring qualifier" line="Round 2 today" onClick={open} code="T-6" className="x-feat" />);
    const button = screen.getByRole('button', { name: /Spring qualifier/ });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('ch-feat is-link x-feat');
    expect(button.getAttribute('data-ch-code')).toBe('T-6');
    await userEvent.setup().click(button);
    expect(open).toHaveBeenCalledTimes(1);
    rerender(<FeatureCard kicker="Up next" title="Spring qualifier" href="/golf/dashboard/qualifiers" label="Spring qualifier, round 2 today" />);
    expect(screen.getByRole('link', { name: 'Spring qualifier, round 2 today' }).className).toBe('ch-feat is-link');
    rerender(<FeatureCard kicker="Invite code" title="HX4-22Q" label="Invite code" />);
    const group = screen.getByRole('group', { name: 'Invite code' });
    expect(group.className).toBe('ch-feat');
    rerender(<FeatureCard kicker="Invite code" title="HX4-22Q" />);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('the intro is the page h1, or an h2 under a bar that holds the h1, and can be named', () => {
    const { rerender, container } = render(<PageIntro eyebrow="2026" title="October" brief="Six events" />);
    expect(screen.getByRole('heading', { level: 1, name: 'October' })).toBeTruthy();
    rerender(<PageIntro eyebrow="2026" title="October" level={2} label="October 2026" code="T-7" className="x-intro" action={<button type="button">Today</button>} />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'October 2026' }).className).toBe('ch-intro__title');
    const head = container.querySelector('header')!;
    expect(head.className).toBe('ch-intro x-intro');
    expect(head.getAttribute('data-ch-code')).toBe('T-7');
    expect(within(head).getByRole('button', { name: 'Today' })).toBeTruthy();
  });
});
