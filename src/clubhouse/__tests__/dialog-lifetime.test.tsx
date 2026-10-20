import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormSheet, ActionSheet } from '../screens/settings/phone/sheets';
import { RecFormSheet, RecActionSheet } from '../screens/recruiting/RecSheet';
import { HistoryDrawer } from '../screens/coachhelm/chat/History';
import { useRef } from 'react';
import { useSheetDrag } from '../lib/sheet-drag';
import './dialog-polyfill';

const preferences = vi.hoisted(() => ({ showAnimations: true }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => preferences }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../screens/settings/parts', () => ({ useReportDirty: vi.fn() }));

const exits: Array<{ onfinish: null | (() => void); cancel: ReturnType<typeof vi.fn> }> = [];
function recordedExit(index: number) {
  const exit = exits[index];
  if (!exit) throw new Error(`Expected recorded exit animation ${index}`);
  return exit;
}
beforeEach(() => {
  exits.length = 0;
  preferences.showAnimations = true;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('Animation', class {});
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => {
    const exit = { onfinish: null, cancel: vi.fn() };
    exits.push(exit);
    return exit as unknown as Animation;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// jsdom doesn't supply WAAPI, but a real deferred completion is necessary to
// distinguish a dismissed component from a still-visible exiting native dialog.
HTMLElement.prototype.animate ??= (() => ({})) as unknown as typeof HTMLElement.prototype.animate;

describe('Custom native dialog lifetime', () => {
  it('retains Recruiting fields cleared by the caller, then restores focus without scrolling', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const focus = vi.spyOn(opener, 'focus');
    const view = render(<RecFormSheet open title="New prospect" onClose={() => {}} onAction={() => {}}><input aria-label="Name" defaultValue="Draft" /></RecFormSheet>);
    const dialog = document.querySelector('dialog')!;
    expect(document.body.style.position).toBe('fixed');
    view.rerender(<RecFormSheet open={false} title="" onClose={() => {}} onAction={() => {}}>{null}</RecFormSheet>);
    expect(dialog.open).toBe(true);
    expect(view.getByLabelText('Name')).toHaveValue('Draft');
    expect(dialog.querySelector('h2')?.textContent).toBe('New prospect');
    act(() => recordedExit(0).onfinish?.());
    expect(dialog.open).toBe(false);
    expect(document.body.style.position).not.toBe('fixed');
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    view.unmount(); opener.remove();
  });

  it('ignores a superseded close even after another close has started', () => {
    const sheet = (open: boolean) => <RecFormSheet open={open} title="Edit" onClose={() => {}} onAction={() => {}}>Fields</RecFormSheet>;
    const view = render(sheet(true));
    view.rerender(sheet(false)); const stale = recordedExit(0).onfinish!;
    view.rerender(sheet(true)); view.rerender(sheet(false));
    act(() => stale());
    expect(document.querySelector('dialog')!.open).toBe(true);
    expect(document.body.style.position).toBe('fixed');
    act(() => recordedExit(1).onfinish?.());
    expect(document.querySelector('dialog')!.open).toBe(false);
    expect(document.body.style.position).not.toBe('fixed');
    view.unmount();
  });

  it('keeps the parent lock when a nested destructive sheet finishes or unmounts', () => {
    const tree = (inner: boolean) => <><FormSheet open title="Profile" onClose={() => {}} onAction={() => {}}>Fields</FormSheet><ActionSheet open={inner} title="Delete?" onClose={() => {}} actions={[]} /></>;
    const view = render(tree(true));
    view.rerender(tree(false));
    act(() => recordedExit(0).onfinish?.());
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
    expect(document.body.style.position).toBe('fixed');
    view.unmount();
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(0);
    expect(document.body.style.position).not.toBe('fixed');
  });

  it('keeps Settings dirty confirmation and Recruiting busy cancellation guards', () => {
    const close = vi.fn();
    const view = render(<FormSheet open dirty title="Profile" onClose={close} onAction={() => {}}>Fields</FormSheet>);
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(view.getByRole('alertdialog')).toHaveAttribute('open');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Keep editing' }));
    act(() => recordedExit(0).onfinish?.());
    expect(document.body.style.position).toBe('fixed');
    view.unmount();
    const action = render(<RecActionSheet open busy title="Delete prospect?" message="Cannot undo" actionLabel="Delete" onClose={close} onAction={() => {}} />);
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(close).not.toHaveBeenCalled();
    expect(action.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    action.unmount();
  });

  it('reduced motion closes immediately without starting an exit animation', () => {
    preferences.showAnimations = false;
    const view = render(<RecActionSheet open title="Delete?" message="Cannot undo" actionLabel="Delete" onClose={() => {}} onAction={() => {}} />);
    view.rerender(<RecActionSheet open={false} title="Delete?" message="Cannot undo" actionLabel="Delete" onClose={() => {}} onAction={() => {}} />);
    expect(exits).toHaveLength(0);
    expect(document.querySelector('dialog')!.open).toBe(false);
    expect(document.body.style.position).not.toBe('fixed');
    view.unmount();
  });

  it('History retains its native lock through exit and releases on unmount', () => {
    const props = { conversations: { list: [], error: false }, openId: null, nowIso: '2026-10-02T12:00:00Z', timezone: 'UTC', onNew: () => {}, onClose: () => {} };
    const view = render(<HistoryDrawer {...props} open />);
    view.rerender(<HistoryDrawer {...props} open={false} />);
    expect(document.querySelector('dialog')!.open).toBe(true);
    expect(document.body.style.position).toBe('fixed');
    expect(view.getByText('No chats yet')).toBeInTheDocument();
    view.unmount();
    act(() => recordedExit(0).onfinish?.());
    expect(document.body.style.position).not.toBe('fixed');
  });

  it('left drags ignore secondary pointers, cancel, paused velocity, and unmounted listeners', () => {
    const close = vi.fn();
    function Drawer() {
      const ref = useRef<HTMLDivElement>(null);
      const drag = useSheetDrag(ref, close, { direction: 'left' });
      return <div ref={ref} data-testid="drawer" onPointerDown={drag.onPointerDown}>Handle</div>;
    }
    const view = render(<Drawer />); const drawer = view.getByTestId('drawer');
    const pointer = (type: string, x: number, time: number, id = 1, primary = true) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
      Object.defineProperties(event, { pointerId: { value: id }, timeStamp: { value: time }, isPrimary: { value: primary } }); return event;
    };
    act(() => { drawer.dispatchEvent(pointer('pointerdown', 200, 0, 2, false)); window.dispatchEvent(pointer('pointermove', 80, 20, 2)); window.dispatchEvent(pointer('pointerup', 80, 40, 2)); });
    expect(close).not.toHaveBeenCalled();
    act(() => { drawer.dispatchEvent(pointer('pointerdown', 200, 100)); window.dispatchEvent(pointer('pointermove', 165, 120)); window.dispatchEvent(pointer('pointerup', 165, 470)); });
    expect(drawer.style.translate).toBe(''); expect(close).not.toHaveBeenCalled();
    act(() => { drawer.dispatchEvent(pointer('pointerdown', 200, 500)); window.dispatchEvent(pointer('pointermove', 80, 520)); window.dispatchEvent(pointer('pointercancel', 80, 530)); });
    expect(close).not.toHaveBeenCalled();
    act(() => { drawer.dispatchEvent(pointer('pointerdown', 200, 600)); window.dispatchEvent(pointer('pointermove', 80, 620)); });
    view.unmount();
    act(() => { window.dispatchEvent(pointer('pointerup', 80, 630)); });
    expect(close).not.toHaveBeenCalled();
  });
});
