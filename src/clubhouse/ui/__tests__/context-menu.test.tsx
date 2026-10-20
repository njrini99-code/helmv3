import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextMenu } from '../ContextMenu';
import type { MenuItem } from '../Menu';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

let desktop = true;
beforeEach(() => {
  desktop = true;
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover') ? desktop : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

const onRemove = vi.fn();
const itemsFor = (name: string): MenuItem[] => [
  { label: 'View stats', href: `/stats?player=${name}` },
  { kind: 'separator' },
  { label: 'Remove from team', danger: true, onSelect: () => onRemove(name) },
];

function Rows() {
  const ctx = useContextMenu<string>({ label: (n) => `Actions for ${n}`, items: itemsFor });
  return (
    <LazyMotion features={domAnimation}>
      <div className="ch-root">
        {['Ava', 'Jonah'].map((n) => (
          <div key={n} role="row" tabIndex={0} aria-label={n} {...ctx.bind(n)}>
            {n}
            <input aria-label={`Note for ${n}`} />
          </div>
        ))}
        {ctx.menu}
      </div>
    </LazyMotion>
  );
}

const menu = () => screen.queryByRole('menu');

describe('ContextMenu', () => {
  it('opens at the pointer with the row\'s own items, and takes the browser\'s menu with it', () => {
    render(<Rows />);
    const row = screen.getByRole('row', { name: 'Jonah' });
    const notPrevented = fireEvent.contextMenu(row, { clientX: 300, clientY: 200 });
    expect(notPrevented).toBe(false);
    expect(menu()).toHaveAccessibleName('Actions for Jonah');
    expect(screen.getByRole('menuitem', { name: 'View stats' })).toHaveAttribute('href', '/stats?player=Jonah');
    expect(screen.getByRole('menuitem', { name: 'Remove from team' })).toBeInTheDocument();
  });

  it('runs the same handler as the row\'s kebab and closes', async () => {
    onRemove.mockClear();
    render(<Rows />);
    fireEvent.contextMenu(screen.getByRole('row', { name: 'Ava' }), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from team' }));
    expect(onRemove).toHaveBeenCalledWith('Ava');
    await waitFor(() => expect(menu()).toBeNull());
  });

  it('leaves the browser\'s menu alone for Shift, a text field and a phone', () => {
    render(<Rows />);
    const row = screen.getByRole('row', { name: 'Jonah' });
    expect(fireEvent.contextMenu(row, { shiftKey: true })).toBe(true);
    expect(menu()).toBeNull();
    expect(fireEvent.contextMenu(screen.getByLabelText('Note for Jonah'))).toBe(true);
    expect(menu()).toBeNull();
    desktop = false;
    expect(fireEvent.contextMenu(row)).toBe(true);
    expect(menu()).toBeNull();
  });

  it('opens from the keyboard (Shift F10, the Menu key) with the first item focused, and Escape gives focus back', async () => {
    render(<Rows />);
    const row = screen.getByRole('row', { name: 'Ava' });
    row.focus();
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
    expect(menu()).not.toBeNull();
    await act(async () => void (await new Promise((r) => requestAnimationFrame(() => r(null)))));
    expect(screen.getByRole('menuitem', { name: 'View stats' })).toHaveFocus();
    fireEvent.keyDown(menu()!, { key: 'Escape' });
    await waitFor(() => expect(menu()).toBeNull());
    await act(async () => void (await new Promise((r) => requestAnimationFrame(() => r(null)))));
    expect(row).toHaveFocus();
    fireEvent.keyDown(row, { key: 'ContextMenu' });
    expect(menu()).not.toBeNull();
  });

  it('does not take Shift F10 from a text field inside the row', () => {
    render(<Rows />);
    fireEvent.keyDown(screen.getByLabelText('Note for Ava'), { key: 'F10', shiftKey: true });
    expect(menu()).toBeNull();
  });

  it('closes on a press elsewhere, and a right-click on another row moves it', async () => {
    render(<Rows />);
    fireEvent.contextMenu(screen.getByRole('row', { name: 'Ava' }), { clientX: 10, clientY: 10 });
    expect(menu()).toHaveAccessibleName('Actions for Ava');
    fireEvent.contextMenu(screen.getByRole('row', { name: 'Jonah' }), { clientX: 20, clientY: 40 });
    expect(menu()).toHaveAccessibleName('Actions for Jonah');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(menu()).toBeNull());
  });
});
