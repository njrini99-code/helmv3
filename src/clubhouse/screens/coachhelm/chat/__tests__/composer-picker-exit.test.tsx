import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AskComposer } from '../Composer';
import { ToastProvider } from '../../../../ui/Toast';

const original = Element.prototype.getAnimations;
let settle: () => void;
beforeEach(() => {
  const finished = new Promise<void>((resolve) => { settle = resolve; });
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [{ finished }] });
});
afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: original });
  else Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

const props = { variant: 'dock' as const, phone: false, players: [], busy: false, failed: false, blocked: false, onSend: vi.fn(), onStop: vi.fn(), slash: [{ command: '/recap', label: 'Recap a round', seed: 'Recap the latest round' }] };

it('Escape closes a slash picker semantically at once, retains its exit, and keeps typing focus', async () => {
  const view = render(<ToastProvider><AskComposer {...props} /></ToastProvider>);
  const field = screen.getByRole('textbox');
  field.focus();
  fireEvent.change(field, { target: { value: '/' } });
  const commands = screen.getByRole('listbox', { name: 'Commands' });
  expect(field.getAttribute('aria-controls')).toBe(commands.id);
  expect(document.getElementById(field.getAttribute('aria-activedescendant')!)?.textContent).toContain('/recap');
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(field.hasAttribute('aria-controls')).toBe(false);
  expect(document.activeElement).toBe(field);
  expect(view.container.querySelector('.ch-aki-picker.is-leaving[inert]')?.textContent).toContain('/recap');
  await act(async () => settle());
  expect(view.container.querySelector('.ch-aki-picker')).toBeNull();
});

it('a keyboard pick seeds without sending and an outside press dismisses without stealing focus', async () => {
  render(<ToastProvider><AskComposer {...props} /><button type="button">Elsewhere</button></ToastProvider>);
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  field.focus();
  fireEvent.change(field, { target: { value: '/' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(field.value).toBe('Recap the latest round');
  expect(props.onSend).not.toHaveBeenCalled();
  await act(async () => settle());
  fireEvent.change(field, { target: { value: '/' } });
  const outside = screen.getByRole('button', { name: 'Elsewhere' });
  outside.focus();
  fireEvent.pointerDown(outside);
  expect(field.hasAttribute('aria-controls')).toBe(false);
  expect(document.activeElement).toBe(outside);
});
