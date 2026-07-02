/**
 * HoverReveal.tsx tests — CSS-only, no framer-motion involved (chrome
 * visibility, not a spec motion principle), so no mock is needed.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoverReveal } from './HoverReveal';

describe('HoverReveal — hover-reveal wrapper with a touch fallback', () => {
  it('always renders the primary children', () => {
    render(<HoverReveal reveal={<span>chevron</span>}>row content</HoverReveal>);
    expect(screen.getByText('row content')).toBeInTheDocument();
  });

  it('always renders the reveal slot in the DOM (touch fallback — never absent, only faded)', () => {
    render(<HoverReveal reveal={<span>chevron</span>}>row content</HoverReveal>);
    expect(screen.getByText('chevron')).toBeInTheDocument();
  });

  it('the reveal slot is hidden by default via opacity, not `hidden`/display:none', () => {
    render(<HoverReveal reveal={<span data-testid="reveal-content">chevron</span>}>row</HoverReveal>);
    const wrapper = screen.getByTestId('reveal-content').parentElement;
    expect(wrapper?.className).toContain('opacity-0');
  });

  it('forces the reveal slot visible on coarse (touch) pointers via an arbitrary media variant', () => {
    render(<HoverReveal reveal={<span data-testid="reveal-content">chevron</span>}>row</HoverReveal>);
    const wrapper = screen.getByTestId('reveal-content').parentElement;
    expect(wrapper?.className).toContain('[@media(pointer:coarse)]:opacity-100');
  });

  it('reveals on hover AND keyboard focus-within (not hover-only)', () => {
    render(<HoverReveal reveal={<span data-testid="reveal-content">chevron</span>}>row</HoverReveal>);
    const wrapper = screen.getByTestId('reveal-content').parentElement;
    expect(wrapper?.className).toContain('group-hover/reveal:opacity-100');
    expect(wrapper?.className).toContain('group-focus-within/reveal:opacity-100');
  });

  it('position="inline" (default) does not absolutely position the slot', () => {
    render(<HoverReveal reveal={<span data-testid="reveal-content">chevron</span>}>row</HoverReveal>);
    const wrapper = screen.getByTestId('reveal-content').parentElement;
    expect(wrapper?.className).not.toContain('absolute');
  });

  it('position="overlay" absolutely positions the slot over the children', () => {
    render(
      <HoverReveal position="overlay" reveal={<span data-testid="reveal-content">chevron</span>}>
        row
      </HoverReveal>,
    );
    const wrapper = screen.getByTestId('reveal-content').parentElement;
    expect(wrapper?.className).toContain('absolute inset-0');
  });
});
