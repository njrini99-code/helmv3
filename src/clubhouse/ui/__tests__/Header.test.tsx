import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityHeader, PageHeader, SectionHeader } from '../Header';
import { HeaderToolbar } from '../HeaderToolbar';
import { Section } from '../Section';

/** dsx-08: one header system at three levels, with a contextual toolbar. */
afterEach(cleanup);

describe('one anatomy at three levels', () => {
  it('a page head is the page h1, the large title, and opts into the framed desk head', () => {
    const { container } = render(<PageHeader eyebrow="Demo University · 2026" title="Roster" meta="12 players" tight />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Roster' });
    expect(h1).toHaveAttribute('data-ch-large-title');
    const head = container.querySelector('header')!;
    expect(head.className).toContain('ch-head--page');
    expect(head.getAttribute('data-canopy-head')).toBe('tight');
    expect(head.querySelector('.ch-head__eyebrow')!.textContent).toBe('Demo University · 2026');
    expect(head.querySelector('p.ch-head__meta')!.textContent).toBe('12 players');
  });

  it('a terse page title is named in full for screen readers', () => {
    render(<PageHeader title="Nov" label="November 2026" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('November 2026');
  });

  it('a section head is an h2 with its caption and toolbar, and no canopy', () => {
    const { container } = render(<SectionHeader title="Leaders" meta="Last 10 rounds" toolbar={<button type="button">All</button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Leaders' })).toBeInTheDocument();
    const head = container.firstElementChild!;
    expect(head.className).toContain('ch-head--section');
    expect(head.hasAttribute('data-canopy-head')).toBe(false);
    expect(head.querySelector('.ch-head__end button')).toBeTruthy();
  });

  it('an entity head carries a lead mark and its figures, label over value', () => {
    const { container } = render(
      <EntityHeader lead={<span data-testid="mark" />} title="Jonah Park" meta="Junior" figures={[{ label: 'Average', value: '72.4' }, { label: 'Rounds', value: '18' }]} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Jonah Park' })).toBeInTheDocument();
    expect(screen.getByTestId('mark').parentElement!.className).toBe('ch-head__lead');
    const terms = Array.from(container.querySelectorAll('.ch-head__figs dt')).map((d) => d.textContent);
    expect(terms).toEqual(['Average', 'Rounds']);
    expect(container.querySelector('.ch-head__figs dd')!.className).toContain('ch-num');
  });

  it('Section draws its head through the section level and keeps its own hooks', () => {
    const { container } = render(
      <Section id="ld" title="Leaders" meta="Season" actions={<button type="button">See all</button>}>
        <p>Body</p>
      </Section>,
    );
    const head = container.querySelector('.ch-sec__head')!;
    expect(head.className).toContain('ch-head--section');
    expect(head.querySelector('.ch-sec__titles .ch-sec__title')!.id).toBe('ld-t');
    expect(head.querySelector('.ch-sec__meta')!.textContent).toBe('Season');
    expect(head.querySelector('.ch-sec__actions button')).toBeTruthy();
    expect(container.querySelector('section')!.getAttribute('aria-labelledby')).toBe('ld-t');
  });

  it('a Section with actions and no title draws no empty heading', () => {
    const { container } = render(<Section actions={<button type="button">Add</button>} />);
    expect(container.querySelector('h2')).toBeNull();
  });
});

describe('the contextual toolbar', () => {
  const Tools = (props: { selection?: Parameters<typeof HeaderToolbar>[0]['selection'] }) => (
    <HeaderToolbar label="Roster actions" {...props}>
      <button type="button">Invite</button>
      <button type="button">Export</button>
      <button type="button" disabled>
        Archive
      </button>
      <button type="button">Print</button>
    </HeaderToolbar>
  );

  it('is one Tab stop that the arrow keys walk, skipping the disabled', () => {
    render(<Tools />);
    const bar = screen.getByRole('toolbar', { name: 'Roster actions' });
    const [invite, exportB, , print] = Array.from(bar.querySelectorAll('button'));
    expect(invite!.tabIndex).toBe(0);
    expect(exportB!.tabIndex).toBe(-1);
    invite!.focus();
    fireEvent.keyDown(invite!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(exportB);
    fireEvent.keyDown(exportB!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(print);
    fireEvent.keyDown(print!, { key: 'Home' });
    expect(document.activeElement).toBe(invite);
    fireEvent.keyDown(invite!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(print);
  });

  it('a toolbar of one control is just that control', () => {
    render(
      <HeaderToolbar label="Page actions">
        <button type="button">New round</button>
      </HeaderToolbar>,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'New round' }).hasAttribute('tabindex')).toBe(false);
  });

  it('a selection swaps in its count and actions, and Escape ends it', () => {
    const onClear = vi.fn();
    render(<Tools selection={{ count: 3, noun: ['player', 'players'], actions: <button type="button">Message</button>, onClear }} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 players selected');
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
    const msg = screen.getByRole('button', { name: 'Message' });
    msg.focus();
    fireEvent.keyDown(msg, { key: 'Escape' });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('with nothing selected it shows its usual actions, and no count', () => {
    render(<Tools selection={{ count: 0, noun: ['player', 'players'], actions: <button type="button">Message</button>, onClear: () => {} }} />);
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
  });

  it('announces the first count: its live region is in the page before anything is selected', () => {
    const selection = (count: number) => ({ count, noun: ['player', 'players'] as [string, string], actions: <button type="button">Message</button>, onClear: () => {} });
    const { rerender } = render(<Tools selection={selection(0)} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    rerender(<Tools selection={selection(1)} />);
    // The same node, now holding the words, so a screen reader reads the change.
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('1 player selected');
    rerender(<Tools selection={selection(2)} />);
    expect(region).toHaveTextContent('2 players selected');
  });

  /** A page that owns the selection, as a roster does: clearing it brings the usual actions back. */
  function Selecting() {
    const [count, setCount] = useState(2);
    return <Tools selection={{ count, noun: ['player', 'players'], actions: <button type="button">Message</button>, onClear: () => setCount(0) }} />;
  }

  it('Escape ends the selection and leaves the focus on the toolbar, not on the page', () => {
    render(<Selecting />);
    const msg = screen.getByRole('button', { name: 'Message' });
    msg.focus();
    fireEvent.keyDown(msg, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite' }));
  });

  it('Clear selection, pressed from the keyboard, leaves the focus on the toolbar too', () => {
    render(<Selecting />);
    const clear = screen.getByRole('button', { name: 'Clear selection' });
    clear.focus();
    fireEvent.click(clear);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite' }));
  });

  it('a selection cleared from elsewhere (the last row unticked) does not pull the focus into the toolbar', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { rerender } = render(<Tools selection={{ count: 1, noun: ['player', 'players'], actions: null, onClear: () => {} }} />);
    outside.focus();
    rerender(<Tools selection={{ count: 0, noun: ['player', 'players'], actions: null, onClear: () => {} }} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
