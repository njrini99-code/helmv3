import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../parts/SaveCard', () => ({ SaveCard: () => null }));
import { ArtifactView } from '../parts/Artifact';

const artifact = { id: 'report', kind: 'player_report' as const, title: 'October report', versions: [{ id: 'v1', at: '', body: null }] };
const original = Element.prototype.getAnimations;
let settle: () => void;
beforeEach(() => {
  const finished = new Promise<void>((resolve) => { settle = resolve; });
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [{ finished }] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (original) Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: original });
  else Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

it('waits for artifact exit across callback rerenders and calls only the latest close', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const view = render(<ArtifactView artifact={artifact} phone={false} body={() => <p>Report body</p>} onClose={first} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  view.rerender(<ArtifactView artifact={artifact} phone={false} body={() => <p>Report body</p>} onClose={latest} />);
  expect(view.container.querySelector('.ch-aki-artifact.is-leaving[inert]')).toBeTruthy();
  expect(first).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();
  await act(async () => settle());
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
});

it('Escape closes a focused desktop pane and returns focus to the artifact opener', async () => {
  function Page() {
    const [open, setOpen] = useState(false);
    return <><button type="button" onClick={() => setOpen(true)}>Open report</button>{open && <ArtifactView artifact={artifact} phone={false} body={() => null} onClose={() => setOpen(false)} />}</>;
  }
  render(<Page />);
  const opener = screen.getByRole('button', { name: 'Open report' });
  opener.focus();
  fireEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await act(async () => settle());
  expect(screen.queryByRole('complementary', { name: 'October report' })).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it('uses the native dialog lifetime at mid desktop and keeps its content until cancel exit settles', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query.includes('1279px'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const onClose = vi.fn();
  render(<ArtifactView artifact={artifact} phone={false} body={() => <p>Report body</p>} onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'October report' });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('Report body')).toBeTruthy();
  await act(async () => settle());
  expect(onClose).toHaveBeenCalledOnce();
});
