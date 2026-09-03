/**
 * ============================================================================
 * ModalShell — focus restoration on close + aria-modal (A11Y-1 / A11Y-2,
 * 2026-09-02 accessibility audit, docs/ui-audits/ACCESSIBILITY_AUDIT_2026-09-02.md)
 * ----------------------------------------------------------------------------
 * A11Y-1: Opening the New-event modal from Calendar and pressing Escape left
 * `document.activeElement` on `<body>` after close, confirmed twice live. A
 * keyboard-only user loses their position and must re-tab from the top.
 *
 * Root cause: Radix's Dialog.Content (modal variant) ships a default
 * `onCloseAutoFocus` handler that unconditionally calls `event.preventDefault()`
 * and then focuses `context.triggerRef.current` — the Dialog.Trigger element,
 * IF one was rendered. Every ModalShell caller in this app drives `open` from
 * its OWN external state (FairwayEventEditor et al. — no `trigger` prop, no
 * `<Dialog.Trigger>` anywhere in the tree), so that ref is always null and the
 * focus call is a no-op — but `preventDefault()` still fires, which suppresses
 * FocusScope's OWN fallback restore (return focus to whatever was focused
 * before the dialog opened). Net effect: focus is abandoned wherever it lands
 * once the trap releases, which resolves to `<body>`.
 *
 * The fix (ModalShell's `openerRef` + `handleCloseAutoFocus`): capture
 * `document.activeElement` in a LAYOUT effect when `isOpen` flips true (must
 * be a layout effect, not passive — FocusScope's own mount-autofocus is a
 * passive effect and passive effects fire child-before-parent, so a passive
 * effect in this ANCESTOR component would run after FocusScope has already
 * moved focus onto the panel), then on `Dialog.Content`'s `onCloseAutoFocus`,
 * explicitly refocus the captured element and call `event.preventDefault()`
 * ourselves — which supersedes Radix's own default handler in the
 * `composeEventHandlers` chain.
 *
 * Test wrapper note: the wrapper below CONDITIONALLY UNMOUNTS the whole
 * `<ModalShell>` element in response to a real `onOpenChange(false)` from a
 * real Escape keypress — the same precedent as
 * `FairwayCreateTaskModal.escape.test.tsx`'s `Wrapper`. This still exercises
 * the exact `openerRef`/`handleCloseAutoFocus` code under test (Radix's
 * FocusScope unmount — and therefore `onCloseAutoFocus` — fires on any React
 * unmount of Dialog.Content, regardless of whether the ancestor or
 * ModalShell's own internal AnimatePresence triggers it), while staying fast
 * and deterministic instead of depending on framer-motion's real ~520ms exit
 * timing settling correctly inside jsdom.
 *
 * A11Y-2: the same dialog had `role="dialog"` and a labeled heading but no
 * `aria-modal="true"` — Radix's `Dialog.Content` (asChild) never sets that
 * attribute itself. The JS focus trap already worked (Tab wraps inside), so
 * this was a semantic gap for assistive tech, not a containment failure.
 * ============================================================================
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { ModalShell } from './ModalShell';

/**
 * Mirrors real ModalShell callers (e.g. FairwayEventEditor): `open` is driven
 * entirely by external state, and the trigger is a plain button with no
 * `<Dialog.Trigger>` wiring — the exact shape that leaves Radix's
 * `context.triggerRef` null and previously caused the focus-loss bug.
 */
function Wrapper() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <Button type="button" onClick={() => setOpen(true)}>
        New event
      </Button>
      {open ? (
        <ModalShell open onOpenChange={setOpen} title="New event">
          <ModalShell.Body>
            <input aria-label="Event name" defaultValue="" />
          </ModalShell.Body>
        </ModalShell>
      ) : null}
    </div>
  );
}

describe('ModalShell — focus restoration on close (A11Y-1)', () => {
  it('returns focus to the element that opened the dialog after Escape closes it', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const trigger = screen.getByRole('button', { name: 'New event' });

    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('does not leave focus on <body> after close — the literal audit symptom', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const trigger = screen.getByRole('button', { name: 'New event' });

    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
  });
});

describe('ModalShell — aria-modal (A11Y-2)', () => {
  it('the dialog panel carries aria-modal="true"', async () => {
    render(
      <ModalShell open onOpenChange={() => {}} title="New event">
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
