import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../Card';

/**
 * A page's own card moved onto the kernel keeps every hook its page reads (dsx-12): its class, its element, the heading
 * that names it, its data attributes and its ref, so its rows and its stylesheet land exactly where they were.
 */
describe('Card kernel: a page card keeps its hooks', () => {
  it('a section card is named by the page heading inside it', () => {
    const { container } = render(
      <Card kind="list" className="ch-lv-card" labelledBy="t" data={{ 'data-density': 'phone' }}>
        <h2 id="t">Live now</h2>
      </Card>,
    );
    const s = container.querySelector('section')!;
    expect(s.className).toBe('ch-card ch-lv-card');
    expect(s.getAttribute('aria-labelledby')).toBe('t');
    expect(s.getAttribute('data-density')).toBe('phone');
    expect(s.getAttribute('data-card-role')).toBe('list');
  });

  it('a label wins over labelledBy, so a card is never named twice', () => {
    const { container } = render(<Card label="Working on" labelledBy="t" />);
    const s = container.querySelector('section')!;
    expect(s.getAttribute('aria-label')).toBe('Working on');
    expect(s.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('a card that is part of its page section stays a div, so the section around it is still the nearest one', () => {
    const { container } = render(
      <section aria-label="Your latest round">
        <Card kind="list" as="div" className="ch-ph-card">
          <p>Round</p>
        </Card>
      </section>,
    );
    const p = container.querySelector('p')!;
    expect(p.parentElement!.tagName).toBe('DIV');
    expect(p.closest('section')!.getAttribute('aria-label')).toBe('Your latest round');
  });

  it('hands its element to a page that measures it', () => {
    const ref = createRef<HTMLElement>();
    render(<Card ref={ref} data={{ 'data-ch-team-card': 'spot' }} />);
    expect(ref.current?.getAttribute('data-ch-team-card')).toBe('spot');
  });
});
