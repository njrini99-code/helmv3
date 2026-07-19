// @vitest-environment jsdom
/* eslint-disable jsx-a11y/anchor-is-valid -- thin test stand-in for next/link, not user-facing UI */
/**
 * ============================================================================
 * ChatDrawer — #63 bottom-padding regression
 * ----------------------------------------------------------------------------
 * Bug: the message-scroll region used an even `py-4`, so the trailing AI
 * response sat flush against the ChatComposer below with no distinct
 * breathing room. Fix: asymmetric padding, bottom deeper than top
 * (`pt-4 pb-7`), so the newest reply always has clear air above the input bar.
 *
 * This pins the CONTRACT (bottom strictly greater than top), not the exact
 * class names, so a future re-tune doesn't spuriously break this test as
 * long as the asymmetry — and a real bottom gap — holds.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { ChatDrawer } from './ChatDrawer';

// next/link in jsdom triggers IntersectionObserver-backed prefetch. Stub it
// to a plain anchor (mirrors the established pattern elsewhere in the repo).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

// Embedded v3 Chat primitives are preserved/unchanged — stub them so this
// suite only exercises ChatDrawer's own scroll-region layout.
vi.mock('./ChatMessageList', () => ({
  ChatMessageList: () => <div data-testid="chat-message-list" />,
}));
vi.mock('./ChatComposer', () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
}));

/** Tailwind `p{t,b}-N` → the spacing scale step N (4px per step). */
function paddingStep(classList: string, side: 't' | 'b'): number {
  const match = classList.match(new RegExp(`(?:^|\\s)p${side}-(\\d+)(?:\\s|$)`));
  if (!match) throw new Error(`No p${side}-* class found in "${classList}"`);
  return Number(match[1]);
}

describe('ChatDrawer bottom padding (#63 regression)', () => {
  it('gives the message-scroll region strictly deeper bottom padding than top', () => {
    render(<ChatDrawer defaultOpen />);

    const scrollRegion = screen.getByTestId('chat-message-list').parentElement;
    expect(scrollRegion).not.toBeNull();
    const classList = scrollRegion!.className;

    const top = paddingStep(classList, 't');
    const bottom = paddingStep(classList, 'b');
    expect(bottom).toBeGreaterThan(top);
  });
});
