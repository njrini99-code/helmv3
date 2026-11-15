// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Trash2 } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../../../ui/Menu';

const reduced = vi.hoisted(() => ({ on: false }));
vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => reduced.on }));
const played = vi.hoisted(() => ({ calls: [] as Array<{ keyframes: Keyframe[]; spring: string | null; opts: Record<string, unknown>; anim: { onfinish: (() => void) | null; cancel: () => void } | null }> }));
vi.mock('../../motion/messages-motion', async (orig) => {
  const real = await orig<typeof import('../../motion/messages-motion')>();
  return {
    ...real,
    msAnimate: (_n: HTMLElement, keyframes: Keyframe[], spring: string | null, opts: Record<string, unknown> = {}) => {
      const anim = { onfinish: null as (() => void) | null, cancel: vi.fn() };
      played.calls.push({ keyframes, spring, opts, anim });
      return anim as unknown as Animation;
    },
  };
});

import { GlassMenu, GLASS_MENU_W, placeGlassMenu } from '../GlassMenu';

beforeEach(() => {
  played.calls.length = 0;
  reduced.on = false;
});
afterEach(cleanup);

const items = (over: Partial<Record<'a' | 'b' | 'c', () => void>> = {}): MenuItem[] => [
  { label: 'Open conversation', onSelect: over.a },
  { label: 'Pin', caption: 'Pin up to 3', disabled: true, onSelect: over.b },
  { kind: 'separator' },
  { label: 'Delete conversation', icon: Trash2, danger: true, onSelect: over.c },
];

describe('MSG-410 placement', () => {
  const view = { w: 390, h: 844 };
  const menu = { w: 236, h: 200 };
  it('hangs 8 below the anchor, left edge clamped 8 in', () => {
    expect(placeGlassMenu({ top: 100, bottom: 148, left: 2 }, menu, view)).toEqual({ up: false, top: 156, left: 8 });
  });
  it('clamps the right edge 8 in', () => {
    expect(placeGlassMenu({ top: 100, bottom: 148, left: 380 }, menu, view).left).toBe(390 - 236 - 8);
  });
  it('flips above when it would pass the bottom 40 and there is 60 above', () => {
    expect(placeGlassMenu({ top: 700, bottom: 748, left: 20 }, menu, view)).toEqual({ up: true, top: 700 - 8 - 200, left: 20 });
  });
  it('stays below when it passes the bottom but there is not 60 above', () => {
    expect(placeGlassMenu({ top: 30, bottom: 800, left: 20 }, { w: 236, h: 100 }, view).up).toBe(false);
  });
});

describe('MSG-410 the menu', () => {
  const anchor = () => {
    const b = document.createElement('button');
    document.body.append(b);
    return b;
  };

  it('is a 236 wide role=menu named by its label, with menuitems and a separator', () => {
    expect(GLASS_MENU_W).toBe(236);
    render(<GlassMenu open anchor={anchor()} items={items()} label="Actions for Maya" onClose={() => {}} />);
    const menu = screen.getByRole('menu', { name: 'Actions for Maya' });
    expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Open conversation', 'PinPin up to 3', 'Delete conversation']);
    expect(menu.querySelector('hr')).not.toBeNull();
  });

  it('a danger row is marked and a dimmed row is aria-disabled, with its caption', () => {
    render(<GlassMenu open anchor={anchor()} items={items()} label="x" onClose={() => {}} />);
    expect(screen.getByRole('menuitem', { name: /Delete conversation/ }).className).toContain('is-danger');
    const pin = screen.getByRole('menuitem', { name: /Pin/ });
    expect(pin.getAttribute('aria-disabled')).toBe('true');
    expect(pin.className).toContain('is-off');
    expect(pin.querySelector('small')!.textContent).toBe('Pin up to 3');
  });

  it('a pick closes the menu and selects; a disabled row does neither', () => {
    const a = vi.fn();
    const b = vi.fn();
    const onClose = vi.fn();
    render(<GlassMenu open anchor={anchor()} items={items({ a, b })} label="x" onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /Pin/ }));
    expect(b).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open conversation' }));
    expect(a).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens on lift, 0.8 to 1 with opacity, the first enabled row focused', () => {
    render(<GlassMenu open anchor={anchor()} items={items()} label="x" onClose={() => {}} />);
    const open = played.calls[0]!;
    expect(open.spring).toBe('lift');
    expect(open.keyframes).toEqual([{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }]);
    expect(open.opts).toMatchObject({ reduced: false });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open conversation' }));
  });

  it('under Reduce Motion the same motion is handed over as reduced (the engine crossfades it)', () => {
    reduced.on = true;
    render(<GlassMenu open anchor={anchor()} items={items()} label="x" onClose={() => {}} />);
    expect(played.calls[0]!.opts).toMatchObject({ reduced: true });
  });

  it('arrows, Home and End move focus through the rows, wrapping', () => {
    render(<GlassMenu open anchor={anchor()} items={items()} label="x" onClose={() => {}} />);
    const menu = screen.getByRole('menu');
    const rows = screen.getAllByRole('menuitem');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('Escape closes it and focus returns to the trigger', () => {
    const trigger = anchor();
    const onClose = vi.fn();
    render(<GlassMenu open anchor={trigger} items={items()} label="x" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  it('a tap on the scrim closes it', () => {
    const onClose = vi.fn();
    render(<GlassMenu open anchor={anchor()} items={items()} label="x" onClose={onClose} />);
    fireEvent.pointerDown(document.querySelector('.ch-mso-pop__scrim')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves by a 160 ms fade from where it is, then unmounts', () => {
    const a = anchor();
    const { rerender } = render(<GlassMenu open anchor={a} items={items()} label="x" onClose={() => {}} />);
    rerender(<GlassMenu open={false} anchor={a} items={items()} label="x" onClose={() => {}} />);
    const out = played.calls[played.calls.length - 1]!;
    expect(out.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(out.opts).toMatchObject({ live: true, fill: 'forwards', timing: { ms: 160 } });
    expect(screen.queryByRole('menu')).not.toBeNull();
    act(() => out.anim!.onfinish?.());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('reopened while it leaves, it unfolds again from the live frame and the old fade is dropped', () => {
    const a = anchor();
    const { rerender } = render(<GlassMenu open anchor={a} items={items()} label="x" onClose={() => {}} />);
    rerender(<GlassMenu open={false} anchor={a} items={items()} label="x" onClose={() => {}} />);
    const out = played.calls[played.calls.length - 1]!;
    rerender(<GlassMenu open anchor={a} items={items()} label="x" onClose={() => {}} />);
    const again = played.calls[played.calls.length - 1]!;
    expect(again.spring).toBe('lift');
    expect(again.opts).toMatchObject({ live: true });
    expect(out.anim!.cancel).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeNull();
  });
});
