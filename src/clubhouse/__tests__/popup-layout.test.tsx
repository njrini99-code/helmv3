import { fireEvent, render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../ui/Modal';
import { Menu } from '../ui/Menu';
import { FormSheet } from '../screens/settings/phone/sheets';
import { BrandTeamSwitch } from '../shell/TeamSwitch';
import { usePopoverFit } from '../lib/use-popover-fit';
import { useRef } from 'react';
import { RecActionSheet } from '../screens/recruiting/RecSheet';
import './dialog-polyfill';
vi.mock('../shell/team-switch', () => ({ useTeamSwitch: () => ({ shownId: 'one', pending: false, pick: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.classList.remove('keyboard-open'); document.documentElement.style.removeProperty('--keyboard-height'); });
const trigger = (p: Parameters<Parameters<typeof Menu>[0]['trigger']>[0]) => <button {...p}>Actions</button>;
describe('popup layout and native dialog containment', () => {
  it('keeps a menu inside its native modal top layer', () => {
    const view = render(<Modal open title="Event" onClose={() => {}}><Menu label="Event actions" items={[{ label: 'Copy link' }]} trigger={trigger} /></Modal>);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    expect(view.getByRole('menu').closest('dialog[open]')).not.toBeNull();
  });
  it('makes a scrollable menu reachable in the tab order', () => {
    const view = render(<Menu label="Actions" items={[{ kind: 'separator' }, { label: 'First' }, { label: 'Second' }]} trigger={trigger} />);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    expect(view.getByRole('menuitem', { name: 'First' })).toHaveAttribute('tabindex', '0');
    expect(view.getByRole('menuitem', { name: 'Second' })).toHaveAttribute('tabindex', '-1');
  });
  it('connects the modal description to its accessible dialog', () => {
    const view = render(<Modal open title="Course" description="Choose the course, then its tees." onClose={() => {}} />);
    expect(view.getByRole('dialog')).toHaveAccessibleDescription('Choose the course, then its tees.');
  });
  it('keeps an open menu when a text field scrolls its value on blur', () => {
    const view = render(<><input aria-label="Course name" /><Menu label="Actions" items={[{ label: 'Copy link' }]} trigger={trigger} /></>);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    fireEvent.scroll(view.getByRole('textbox'));
    expect(view.getByRole('menu')).toBeInTheDocument();
  });
  it('starts a settings form at its reading title', () => {
    const view = render(<FormSheet open title="Profile" onClose={() => {}} onAction={() => {}}>Fields</FormSheet>);
    expect(view.getByRole('heading', { name: 'Profile' })).toHaveFocus();
  });
  it('announces the recruiting confirmation message', () => {
    const view = render(<RecActionSheet open title="Delete prospect?" message="Private documents will also be removed." actionLabel="Delete" onClose={() => {}} onAction={() => {}} />);
    expect(view.getByRole('dialog')).toHaveAccessibleDescription('Private documents will also be removed.');
  });
  it('reserves the native keyboard space when placing a menu', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    document.body.classList.add('keyboard-open');
    document.documentElement.style.setProperty('--keyboard-height', '300px');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 130, bottom: 164, left: 20, right: 54, width: 34, height: 34, x: 20, y: 130, toJSON() {} });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500);
    const view = render(<Menu label="Actions" items={[{ label: 'Copy link' }]} trigger={trigger} />);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    const menu = view.getByRole('menu');
    expect(Number.parseFloat(menu.style.top) + Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(292);
  });
  it('bounds a long team list below the sidebar trigger', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 20, bottom: 80, left: 16, right: 224, width: 208, height: 60, x: 16, y: 20, toJSON() {} });
    const view = render(<BrandTeamSwitch teamName="Team one" model={{ activeId: 'one', choices: [{ id: 'one', label: 'Team one' }, { id: 'two', label: 'Team two' }] }} />);
    fireEvent.click(view.getByRole('button', { name: /Switch team/ }));
    const popup = document.querySelector<HTMLElement>('.ch-tsw')!;
    expect(Number.parseFloat(popup.style.maxHeight)).toBe(206);
  });
  it('flips an absolute calendar popover above a low anchor', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 230, bottom: 270, left: 20, right: 340, width: 320, height: 40, x: 20, y: 230, toJSON() {} });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function(this: HTMLElement) { return this.parentElement; });
    function Fixture() {
      const ref = useRef<HTMLDivElement>(null);
      const placement = usePopoverFit(ref);
      return <div><div ref={ref} data-testid="popup" style={placement} /></div>;
    }
    const view = render(<Fixture />);
    expect(view.getByTestId('popup').style.top).toBe('-222px');
    expect(view.getByTestId('popup').style.maxHeight).toBe('214px');
  });
  it('keeps a tall anchored menu within a short viewport', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 130, bottom: 164, left: 20, right: 54, width: 34, height: 34, x: 20, y: 130, toJSON() {} });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500);
    const view = render(<Menu label="Actions" items={Array.from({ length: 12 }, (_, i) => ({ label: `Action ${i + 1}` }))} trigger={trigger} />);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    const menu = view.getByRole('menu');
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(122);
  });
});
