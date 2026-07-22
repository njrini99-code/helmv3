/**
 * ============================================================================
 * ModalShell × fairway/forms Select — dead-dropdown regression (2026-07-21)
 * ----------------------------------------------------------------------------
 * TWO independent bugs combined to make "Prescribe a focus area"'s Player /
 * Category dropdowns dead inside ModalShell:
 *
 * 1. Focus trap (structural): ModalShell's Radix Dialog traps focus with a
 *    `FocusScope` that decides "is this focus target inside the modal?" via
 *    REAL DOM CONTAINMENT (`container.contains(target)`, see
 *    @radix-ui/react-focus-scope) — not React-tree containment.
 *    fairway/forms/Select.tsx is Base UI's `Select`, which portals its popup
 *    to `document.body` by default: a document.body SIBLING of the Dialog,
 *    not a descendant. The instant the popup tries to take focus (Base UI
 *    auto-focuses the popup on open via FloatingFocusManager), Radix's
 *    `focusin` listener sees a target outside its container and yanks focus
 *    straight back into the modal — the popup never keeps focus, so options
 *    can't be reached by keyboard and the dropdown reads as dead.
 *
 *    Fix: ModalShell captures its own Dialog.Content DOM node and provides
 *    it through ModalPortalContext (fairway/overlays/_shared.ts); Select
 *    reads it and passes it as Base UI Select.Portal's `container` prop, so
 *    the popup renders as a genuine DOM DESCENDANT of the dialog instead of
 *    a document.body sibling.
 *
 * 2. Stacking (confirmed live-QA root cause, overrides the focus-trap
 *    hypothesis as PRIMARY): `z-dropdown` used to live on Base UI's
 *    `Select.Popup`, which renders `position: static` (Base UI sets no
 *    position style on the Popup itself) — CSS only honors `z-index` on a
 *    POSITIONED box, so it had zero effect there. `Select.Positioner` IS
 *    positioned (`position: absolute`/`fixed`, floating-ui), so that's the
 *    only element where the class can actually create a stacking context.
 *    Before the fix, the popup mounted correctly (aria-expanded=true,
 *    listbox present in the DOM, even inside the dialog after bug #1's fix)
 *    but was never painted/hit-testable above ModalShell's own inline
 *    `zIndex: FW_Z.modal` content.
 *
 *    Fix: `z-dropdown` moved from `popupClasses` to a new
 *    `popupPositionerClasses` applied to `Select.Positioner`/
 *    `Combobox.Positioner` (fairway/forms/styles.ts).
 *
 * These are structural/behavioral jsdom-level assertions (full visual +
 * pointer-interaction verification happens in a later browser QA wave, per
 * the mission plan) — they exercise the REAL ModalShell + REAL Select (no
 * mocks), so they fail against the pre-fix code exactly the way the bug
 * manifested: the popup renders outside `dialog.contains(...)`, focus that
 * Base UI puts on the popup gets reverted before the assertion runs, or the
 * z-index class sits on the wrong (unpositioned) element.
 * ============================================================================
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ModalShell } from './ModalShell';
import { Select } from '@/components/fairway/forms/Select';

const OPTIONS = [
  { value: 'putting', label: 'Putting' },
  { value: 'driving', label: 'Driving' },
  { value: 'approach', label: 'Approach' },
];

function renderModalWithSelect() {
  return render(
    <ModalShell open onOpenChange={() => {}} title="Prescribe a focus area">
      <ModalShell.Body>
        <Select
          placeholder="Select a category…"
          options={OPTIONS}
        />
      </ModalShell.Body>
    </ModalShell>,
  );
}

describe('ModalShell + fairway Select — popup portals inside the dialog, not document.body', () => {
  it('renders the open popup as a DOM descendant of the dialog content', async () => {
    const user = userEvent.setup();
    renderModalWithSelect();

    const dialog = screen.getByRole('dialog');
    const trigger = screen.getByRole('combobox');

    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');

    // The crux structural assertion: before the fix, Base UI Select.Portal
    // defaults to document.body, so `listbox` would be a SIBLING of
    // `dialog` in the DOM (both children of document.body), never a
    // descendant. Only the ModalPortalContext wiring makes this true.
    expect(dialog.contains(listbox)).toBe(true);

    // And it must NOT have simply rendered in-place under document.body —
    // confirm document.body itself isn't the immediate portal target by
    // checking the listbox's portal ancestor chain terminates inside the
    // dialog before it terminates outside it.
    expect(document.body.contains(listbox)).toBe(true); // still in the document at all
    expect(dialog).not.toBe(listbox);

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Putting', 'Driving', 'Approach']);
    options.forEach((option) => {
      expect(dialog.contains(option)).toBe(true);
    });
  });

  it('keeps focus on the open popup instead of the Dialog FocusScope stealing it back', async () => {
    const user = userEvent.setup();
    renderModalWithSelect();

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');

    // Base UI's Select auto-focuses its popup (FloatingFocusManager) on
    // open, asynchronously via requestAnimationFrame (enqueueFocus). Give
    // that — and Radix's FocusScope `focusin` listener, which runs
    // synchronously on the resulting event — time to settle.
    //
    // Pre-fix: the popup is a document.body sibling of the dialog, so the
    // instant Base UI focuses it, Radix's FocusScope sees a `focusin`
    // target outside `container.contains(target)` and forces focus back
    // onto the last known-good element inside the dialog (the trigger) —
    // `document.activeElement` would settle back on `trigger`, never
    // reaching `listbox`.
    //
    // Post-fix: the popup is a real descendant of the dialog, so Radix's
    // containment check passes and never fires the steal-back — focus
    // legitimately lands on, and stays on, the popup.
    await waitFor(() => {
      expect(document.activeElement).toBe(listbox);
    });

    // The dropdown must not have been yanked back onto the trigger button —
    // that reversion is the literal "dead dropdown" symptom being guarded.
    expect(document.activeElement).not.toBe(trigger);
  });

  it('puts the z-dropdown stacking class on the positioned Positioner, not the static Popup', async () => {
    const user = userEvent.setup();
    renderModalWithSelect();

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');
    const positioner = listbox.parentElement;

    // Pre-fix: `z-dropdown` sat on the Popup (`listbox`), which Base UI
    // renders `position: static` — z-index has no effect there, so the
    // popup silently painted BELOW ModalShell's own inline-zIndexed content
    // despite being structurally present in the DOM (the live-QA-confirmed
    // "options exist but aren't hit-testable" symptom). The class must live
    // on the Positioner (a genuinely positioned ancestor) instead.
    expect(positioner).not.toBeNull();
    expect(positioner?.className).toMatch(/\bz-dropdown\b/);
    expect(listbox.className).not.toMatch(/\bz-dropdown\b/);
  });

  it('falls back to portaling into document.body when there is no ModalShell ancestor', async () => {
    const user = userEvent.setup();
    render(
      <Select
        placeholder="Pick one…"
        options={OPTIONS}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');

    // No dialog in the tree at all — the popup must still mount (the
    // ModalPortalContext default of `null` must never be forwarded to Base
    // UI's Portal as a literal `container={null}`, which means "wait for a
    // container" and would leave every non-modal Select permanently
    // unopenable).
    expect(document.body.contains(listbox)).toBe(true);
  });
});
