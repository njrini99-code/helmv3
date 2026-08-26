/**
 * ============================================================================
 * ModalShell — keyboard-on-open regression (owner TestFlight report 2026-08-26)
 * ----------------------------------------------------------------------------
 * Radix's FocusScope autofocuses the first TABBABLE element when a dialog
 * opens. In a form modal that is a text input — and on a touch device,
 * focusing an input summons the software keyboard over the modal the user
 * just opened. The New-event editor opened with the iOS keyboard burying
 * everything below the name field.
 *
 * The fix (ModalShell's `handleOpenAutoFocus`): on coarse pointers, cancel
 * the input autofocus and land focus on the panel itself (`tabIndex={-1}`),
 * so focus is still trapped inside the dialog but no keyboard appears until
 * the user taps a field. Fine pointers keep Radix's default — desktop
 * first-field focus is correct, and the global test-setup matchMedia mock
 * (`matches: false` for everything) means every OTHER jsdom test exercises
 * exactly that unchanged path.
 * ============================================================================
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalShell } from './ModalShell';

const realMatchMedia = window.matchMedia;

function mockPointer(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: realMatchMedia,
  });
});

function renderFormModal() {
  return render(
    <ModalShell open onOpenChange={() => {}} title="New event">
      <ModalShell.Body>
        <input aria-label="Event name" defaultValue="" />
      </ModalShell.Body>
    </ModalShell>,
  );
}

describe('ModalShell open-autofocus by pointer type', () => {
  it('coarse pointer: the first input is NOT focused — focus lands on the panel', async () => {
    mockPointer(true);
    renderFormModal();

    const dialog = screen.getByRole('dialog');
    const input = screen.getByLabelText('Event name');

    // Radix fires the mount-autofocus event in an effect; wait for focus to
    // settle somewhere before asserting where.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });

    // The literal bug: on touch, focusing this input opened the iOS keyboard
    // over the form. It must stay unfocused on open…
    expect(document.activeElement).not.toBe(input);
    // …while focus still lands INSIDE the dialog (the trap must not be left
    // holding focus outside — that would break Escape and Tab order).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('fine pointer: Radix default is untouched — the first input IS focused', async () => {
    mockPointer(false);
    renderFormModal();

    const input = screen.getByLabelText('Event name');

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });
});
