// @vitest-environment jsdom
/**
 * ============================================================================
 * AskThreadPane — #63 bottom-padding regression
 * ----------------------------------------------------------------------------
 * Bug: the message-scroll region used an even `py-*` value, so the trailing
 * AI response sat flush against the composer's input bar with no distinct
 * breathing room. Fix: asymmetric padding, bottom deeper than top
 * (`pt-5 pb-8`), so the newest message always clears the input bar.
 *
 * This pins the CONTRACT (bottom strictly greater than top), not the exact
 * class names, so a future re-tune (e.g. `pt-6 pb-9`) doesn't spuriously
 * break this test as long as the asymmetry — and a real bottom gap — holds.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AskThreadPane } from './AskThreadPane';

// ── Embedded v3 Chat primitives are preserved/unchanged — stub them so this
//    suite only exercises AskThreadPane's own scroll-region layout. ─────────
vi.mock('@/components/golf/coachhelm/v3/Chat/ChatMessageList', () => ({
  ChatMessageList: () => <div data-testid="chat-message-list" />,
}));
vi.mock('@/components/golf/coachhelm/v3/Chat/ChatComposer', () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
}));

/** Tailwind `p{t,b}-N` → the spacing scale step N (4px per step). */
function paddingStep(classList: string, side: 't' | 'b'): number {
  const match = classList.match(new RegExp(`(?:^|\\s)p${side}-(\\d+)(?:\\s|$)`));
  if (!match) throw new Error(`No p${side}-* class found in "${classList}"`);
  return Number(match[1]);
}

describe('AskThreadPane bottom padding (#63 regression)', () => {
  it('gives the message-scroll region strictly deeper bottom padding than top', () => {
    // jsdom does not implement Element.scrollTo — the pane's auto-scroll
    // effect calls it on mount, which is irrelevant to this layout assertion.
    Element.prototype.scrollTo = vi.fn();

    render(
      <AskThreadPane
        messages={[]}
        activeId="thread-1"
        pending={false}
        error={null}
        onSend={vi.fn()}
      />,
    );

    const scrollRegion = screen.getByTestId('chat-message-list').parentElement;
    expect(scrollRegion).not.toBeNull();
    const classList = scrollRegion!.className;

    const top = paddingStep(classList, 't');
    const bottom = paddingStep(classList, 'b');
    expect(bottom).toBeGreaterThan(top);
  });
});
