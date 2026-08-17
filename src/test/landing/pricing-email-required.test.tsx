/**
 * `/pricing` carries its own inline email capture — a THIRD implementation of
 * "give us your work email and we'll set up a demo", alongside
 * `RequestDemoModal` (fixed in 9ccd9b84f) and the standalone `/golf/demo` page.
 *
 * The email is mandatory in fact. `PricingView.tsx:31` rejects the submit:
 *
 *     if (!email || !EMAIL_RE.test(email)) { … }
 *
 * …but the field carried no `required`, so it had no `aria-required` and its
 * label showed no asterisk. Verified in production 2026-08-17:
 * `required: false`, `aria-required: null`, label "Work email" with no marker.
 *
 * THE SHAPE HERE IS THE SAME ONE THAT BIT THE GOLF LOGIN FORM (54fea01a3).
 *
 * The visible label is hand-rolled (`PricingView.tsx:77-82`) rather than passed
 * to `<Input label=…>`, and for a good reason the code documents: a placeholder
 * alone vanishes on first keystroke and leaves the field unnamed (WCAG 3.3.2,
 * audit L-15). But `ui/input.tsx:132-139` renders the asterisk INSIDE its own
 * label block, and that block is skipped when `label` is empty — so going
 * around the component silently drops the marker. `required` alone does not
 * restore it; the hand-rolled label has to carry it too.
 *
 * Both halves are asserted below so a future refactor cannot fix one and lose
 * the other.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PricingView } from '@/components/landing/PricingView';

vi.mock('@/app/actions/demo-request', () => ({ submitDemoRequest: vi.fn() }));

afterEach(() => cleanup());

describe('pricing work-email capture', () => {
  it('marks the email the submit handler actually rejects', () => {
    render(<PricingView />);

    const input = document.querySelector<HTMLInputElement>('#pricing-work-email');
    expect(input, 'the pricing email field').not.toBeNull();
    expect(input!.getAttribute('aria-required')).toBe('true');

    const label = document.querySelector('label[for="pricing-work-email"]');
    expect(label, 'a real bound label, not just a placeholder').not.toBeNull();
    expect(label!.textContent).toContain('Work email');
    expect(label!.textContent, 'the required marker').toContain('*');
  });

  it('keeps exactly one label bound to the field', () => {
    // `<Input label="">` renders no label of its own (ui/input.tsx:132), so the
    // hand-rolled one must stay the only one — two would be a worse a11y bug
    // than the missing asterisk.
    render(<PricingView />);
    expect(document.querySelectorAll('label[for="pricing-work-email"]')).toHaveLength(1);
  });

  it('leaves the spam honeypot unmarked and out of the tab order', () => {
    render(<PricingView />);
    const hp = document.querySelector<HTMLInputElement>('input[name="company"]');
    expect(hp).not.toBeNull();
    expect(hp!.required).toBe(false);
    expect(hp!.tabIndex).toBe(-1);
    expect(hp!.getAttribute('aria-required')).toBeNull();
  });
});
