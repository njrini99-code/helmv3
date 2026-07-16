/**
 * Masthead.tsx tests — surname wrap/shrink regression.
 *
 * Guards the BROKEN bug where a long surname (e.g. "RODRIGUEZ") clipped
 * mid-character inside a narrow flex row (the Player Today desktop right
 * rail, ~1/3 width, wrapped in a `PaperCard` that clips overflow). Root
 * cause: as a flex item, Masthead's root had no `min-w-0`, so it could never
 * shrink below the unbreakable surname's full-size intrinsic width — and the
 * surname text itself had no wrap-on-overflow behavior, so once the item hit
 * its width ceiling the text bled past the box and got clipped by the
 * ancestor `PaperCard`'s `overflow-hidden`.
 *
 * Mocks framer-motion the same way Reveal.test.tsx does (an `m` Proxy
 * rendering the underlying DOM tag), extended with `useScroll` / `useTransform`
 * stubs because Masthead calls both unconditionally (only applied when
 * `scrollShrink` is on).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';

vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
  useScroll: () => ({ scrollY: { get: () => 0, on: () => () => {} } }),
  useTransform: () => ({ get: () => 0, on: () => () => {} }),
  m: new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => {
          const { children, initial: _i, animate: _a, variants: _v, ...rest } = props;
          void _i;
          void _a;
          void _v;
          return React.createElement(prop as string, rest, children);
        },
    },
  ),
}));

import { Masthead } from './Masthead';

describe('Masthead — surname wrap/shrink in narrow embeds', () => {
  it('renders the given name and surname', () => {
    render(<Masthead given="Marcus" surname="Rodriguez" />);
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Rodriguez')).toBeInTheDocument();
  });

  it('lets the root shrink as a flex item (min-w-0) instead of forcing overflow', () => {
    const { container } = render(<Masthead given="Marcus" surname="Rodriguez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\bmin-w-0\b/);
  });

  it('allows the surname to wrap/break instead of overflowing past its box', () => {
    render(<Masthead given="Marcus" surname="Rodriguez" />);
    const surnameEl = screen.getByText('Rodriguez');
    expect(surnameEl.className).toMatch(/\bbreak-words\b/);
  });
});
