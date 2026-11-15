import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeSheet } from '../PracticeSheet';

/**
 * Practice's forms on a Mac. `FormSheet` is drawn for the phone only; on a desk it opened as an unstyled dialog with Cancel, the title and the action stacked
 * as plain text (seen at 1440 on New plan, 10 Nov 2026). The same form is the shared Modal there.
 */
const room = vi.hoisted(() => ({ phone: false }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => room.phone }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  room.phone = false;
});

const form = (over: Partial<Parameters<typeof PracticeSheet>[0]> = {}) => {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <PracticeSheet open onClose={onClose} title="New drill" actionLabel="Save drill" onAction={onAction} {...over}>
      <label>
        Name <input defaultValue="Lag ladder" />
      </label>
    </PracticeSheet>,
  );
  return { ...view, onAction, onClose };
};

describe('a Practice form', () => {
  it('on a desk is the shared modal: its fields, then Cancel and the action under them', () => {
    const { onAction, onClose } = form();
    expect(document.querySelector('.ch-fsheet')).toBeNull();
    expect(screen.getByRole('heading', { name: 'New drill', hidden: true })).toBeTruthy();
    expect(screen.getByDisplayValue('Lag ladder')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save drill', hidden: true }));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('on a desk keeps what was typed and says why a save was refused', () => {
    form({ note: 'Couldn’t save the drill. Try again.' });
    expect(screen.getByRole('alert', { hidden: true }).textContent).toBe('Couldn’t save the drill. Try again.');
    expect(screen.getByDisplayValue('Lag ladder')).toBeTruthy();
  });
  it('on a desk an action that can’t run yet is off, and one in flight can’t be pressed twice', () => {
    const { onAction, unmount } = form({ actionDisabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save drill', hidden: true }));
    expect(onAction).not.toHaveBeenCalled();
    unmount();
    const busy = form({ busy: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save drill', hidden: true }));
    expect(busy.onAction).not.toHaveBeenCalled();
  });
  it('on a phone is the phone’s sheet, with the action in its bar', () => {
    room.phone = true;
    form();
    expect(document.querySelector('.ch-fsheet')).not.toBeNull();
    expect(document.querySelector('.ch-fsheet-bar__b.is-action')?.textContent).toBe('Save drill');
  });
});
