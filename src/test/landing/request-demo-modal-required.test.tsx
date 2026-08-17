/**
 * The "Request Demo" modal is the conversion form on the marketing front door —
 * four buttons open it from `/`, and it is the only demo path linked from the
 * landing page (the standalone `/golf/demo` page is not linked from there at
 * all; see #1483).
 *
 * All three fields are mandatory in FACT. `RequestDemoModal.tsx:99-102` rejects
 * a submit unless each is present:
 *
 *     if (!name)   nextErrors.name   = 'Please enter your name.';
 *     if (!email || !EMAIL_RE.test(email)) nextErrors.email = '…';
 *     if (!school) nextErrors.school = 'Which program do you coach?';
 *
 * …but none is marked `required`, so `ui/input.tsx` renders no asterisk
 * (line 139) and sets no `aria-required` (line 160). Verified in production
 * 2026-08-17: all three report `required: false` and `aria-required: null`.
 *
 * The identical form at `/golf/demo` (`(auth)/demo/page.tsx:353-387`) passes
 * `required` on all three and renders "Your name*", "Work email*",
 * "School / Program*". Same three fields, two implementations, different
 * semantics — a coach meets whichever one they happened to arrive through.
 *
 * The consequence is small but it is on the highest-value lead form in the
 * product: nothing signals which fields are mandatory until the user submits
 * and is bounced, and a screen reader is never told at all.
 *
 * Both forms set `noValidate`, so `required` here changes the asterisk and the
 * ARIA only — it does not introduce native browser validation bubbles ahead of
 * the component's own error copy.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RequestDemoModal } from '@/components/landing/RequestDemoModal';

vi.mock('@/app/actions/demo-request', () => ({ submitDemoRequest: vi.fn() }));

afterEach(() => cleanup());

/** The label bound to a field by name, via its generated id. */
function labelForField(name: string): string {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`no input named ${name}`);
  const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
  if (!label) throw new Error(`no label bound to input[name="${name}"]`);
  return label.textContent ?? '';
}

describe('RequestDemoModal — required markers', () => {
  it('marks every field the submit handler actually rejects', () => {
    render(<RequestDemoModal open onClose={() => {}} />);

    for (const field of ['name', 'email', 'school']) {
      expect(labelForField(field), `label for ${field}`).toContain('*');
      expect(
        document.querySelector(`input[name="${field}"]`)?.getAttribute('aria-required'),
        `aria-required for ${field}`,
      ).toBe('true');
    }
  });

  it('leaves the spam honeypot unmarked and out of the tab order', () => {
    // `company` is the honeypot — filling it yields a quiet fake success
    // (RequestDemoModal.tsx:109-112). It must never gain a required marker,
    // which would both expose it and block real submissions.
    render(<RequestDemoModal open onClose={() => {}} />);
    const hp = document.querySelector<HTMLInputElement>('input[name="company"]');
    expect(hp).not.toBeNull();
    expect(hp!.required).toBe(false);
    expect(hp!.tabIndex).toBe(-1);
    expect(hp!.getAttribute('aria-required')).toBeNull();
  });

  it('renders nothing when closed', () => {
    render(<RequestDemoModal open={false} onClose={() => {}} />);
    expect(document.querySelector('input[name="email"]')).toBeNull();
  });
});
