/**
 * Motion physics (D-64 extension, 2026-10-08): the spring tokens, sheet physics (CH-1611), toasts that swipe and hold
 * (CH-1614), re-tapping the open tab (CH-1907), a Back iOS already animated (CH-1908) and slider scrubs (CH-1708).
 * The rendered motion itself is sampled in WebKit; these pin the mechanics.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const haptics = vi.hoisted(() => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../lib/haptics', () => haptics);
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/sign-out', () => ({ chSignOut: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));

import { CH_DUR, CH_SPRINGS, chSpring, chSpringAt, chSpringCurve } from '../lib/motion';
import { rubberBand, takeSheetFling, useSheetDrag } from '../lib/sheet-drag';
import { poppedByUA } from '../lib/ua-pop';
import { TabBar } from '../shell/TabBar';
import { Modal } from '../ui/Modal';
import { Slider } from '../ui/Slider';
import { ToastProvider, useToast } from '../ui/Toast';
import './dialog-polyfill';

/** A pointer event as WebKit sends it: an id, a time and a primary flag (jsdom has no PointerEvent). Times start
 *  above 0, since React reads a 0 timeStamp as missing. */
function pointer(type: string, y: number, time: number, { x = 0, id = 1 }: { x?: number; id?: number } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: id }, timeStamp: { value: time }, isPrimary: { value: true } });
  return e;
}

beforeEach(() => {
  haptics.haptic.mockClear();
  haptics.hapticScrub.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('D-64 springs (extension, 2026-10-08)', () => {
  it('keep the D-64 base duration with a bounce of 0 to 0.1, handed to framer as stiffness and damping so velocity carries', () => {
    for (const { visualDuration, bounce } of Object.values(CH_SPRINGS)) {
      expect(visualDuration).toBe(CH_DUR.base);
      expect(bounce).toBeGreaterThanOrEqual(0);
      expect(bounce).toBeLessThanOrEqual(0.1);
    }
    // framer's own reading of visualDuration and bounce (motion-dom spring.mjs).
    const root = (2 * Math.PI) / (CH_DUR.base * 1.2);
    expect(chSpring('smooth')).toEqual({ type: 'spring', stiffness: root * root, damping: 2 * root, mass: 1 });
    expect(chSpring('settle')).toMatchObject({ stiffness: root * root, damping: 2 * 0.9 * root });
    expect(chSpring('smooth', false, 900)).toMatchObject({ velocity: 900 });
    expect(chSpring('settle', true)).toEqual({ duration: 0 });
  });

  it('never pass their mark by more than their bounce, and a thrown curve starts at the throw speed', () => {
    const peak = (kind: 'smooth' | 'settle', v0 = 0) => Math.max(...Array.from({ length: 1500 }, (_, i) => chSpringAt(kind, i / 1000, v0)));
    expect(peak('smooth')).toBeLessThanOrEqual(1);
    expect(peak('settle') - 1).toBeLessThan(0.002);
    expect(peak('settle', 8) - 1).toBeLessThan(0.003);
    const slope = (chSpringAt('smooth', 0.0001, 6) - chSpringAt('smooth', 0, 6)) / 0.0001;
    expect(slope).toBeCloseTo(6, 1);
    const curve = chSpringCurve('smooth');
    expect([curve.ease(0), curve.ease(1)]).toEqual([0, 1]);
    // The visual duration is D-64's base; the tail runs on until within 0.1% of the mark.
    expect(chSpringAt('smooth', CH_DUR.base)).toBeGreaterThan(0.96);
    expect(curve.ms).toBeGreaterThan(CH_DUR.base * 1000);
  });

  it('thrown at its mark faster than it can stop there, a curve passes it once; held, never by more than its rest', () => {
    const peak = (c: { ease: (p: number) => number }) => Math.max(...Array.from({ length: 1001 }, (_, i) => c.ease(i / 1000)));
    expect(peak(chSpringCurve('smooth', { velocity: 50 }))).toBeGreaterThan(1.2);
    expect(peak(chSpringCurve('smooth', { velocity: 50, hold: true })) - 1).toBeLessThanOrEqual(0.001);
    expect(peak(chSpringCurve('smooth', { velocity: 50, rest: 0.02, hold: true })) - 1).toBeLessThanOrEqual(0.02);
    // Where the pass would stay within its rest, holding changes nothing: the speed carries in full.
    for (const velocity of [12, 22]) {
      expect(chSpringCurve('smooth', { velocity, hold: true }).linear).toBe(chSpringCurve('smooth', { velocity }).linear);
    }
  });

  it('the CSS token is the same smooth spring, and Animations off zeroes it', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
    const curve = chSpringCurve('smooth');
    expect(css).toContain(`--ch-ease-spring-smooth: ${curve.linear};`);
    expect(css).toContain(`--ch-dur-spring-smooth: ${curve.ms}ms;`);
    expect(css).toMatch(/\[data-motion='off'\] \[data-ui='clubhouse'\] \{[^}]*--ch-dur-spring-smooth: 0ms;/);
  });
});

function Sheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(ref, onClose);
  return (
    <div ref={ref} data-testid="sheet" style={{ backgroundColor: 'rgb(253, 251, 247)' }}>
      <div data-testid="grab" onPointerDown={drag.onPointerDown} />
      <header data-testid="head" onPointerDown={drag.onPointerDown}>
        <button type="button">Close</button>
      </header>
      <div data-testid="body">
        <a href="#row" data-testid="row">
          Roster
        </a>
        <input aria-label="Name" />
      </div>
    </div>
  );
}

describe('CH-1611 sheet physics', () => {
  it('pulled up past its open position it gives like a rubber band, over a floor of its own colour', () => {
    vi.useFakeTimers();
    render(<Sheet onClose={vi.fn()} />);
    const sheet = screen.getByTestId('sheet');
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 300, 1000));
      window.dispatchEvent(pointer('pointermove', 200, 1016));
    });
    const shown = parseFloat(sheet.style.translate.split(' ')[1]!);
    expect(shown).toBeCloseTo(-rubberBand(100), 3);
    expect(-shown).toBeLessThan(100 * 0.55);
    expect(sheet.style.boxShadow).toContain('120px');
    act(() => {
      window.dispatchEvent(pointer('pointermove', 200, 1120));
      window.dispatchEvent(pointer('pointerup', 200, 1130));
    });
    expect(sheet.style.translate).toBe('');
    act(() => vi.advanceTimersByTime(600));
    expect(sheet.style.boxShadow).toBe('');
  });

  it('thrown back up hard it passes its open position over the same floor, and a finger catches it where it is', () => {
    vi.useFakeTimers();
    vi.stubGlobal('CSS', { supports: () => true });
    try {
      render(<Sheet onClose={vi.fn()} />);
      const sheet = screen.getByTestId('sheet');
      act(() => {
        screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 300, 1000));
        window.dispatchEvent(pointer('pointermove', 380, 1050));
        window.dispatchEvent(pointer('pointermove', 340, 1066));
        window.dispatchEvent(pointer('pointerup', 340, 1068));
      });
      // 40px down and flicked back up at about 2.5px per ms: faster than the spring can stop in 40px.
      expect(sheet.style.transition).toMatch(/^translate \d+ms linear\(/);
      expect(sheet.style.boxShadow).toContain('120px');
      // jsdom runs no transition: say the pass has it 3px above its open position as the finger lands.
      const real = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
        const style = real(node, pseudo);
        if (node === sheet) Object.defineProperty(style, 'translate', { value: '0px -3px' });
        return style;
      });
      act(() => {
        screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 200, 1100));
      });
      expect(sheet.style.transition).toBe('none');
      expect(sheet.style.translate).toBe('0 -3px');
      expect(sheet.style.boxShadow).toContain('120px');
      act(() => {
        window.dispatchEvent(pointer('pointerup', 200, 1120));
      });
      act(() => vi.advanceTimersByTime(600));
      expect(sheet.style.boxShadow).toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drags from its body once that is at the top and the first move is down, and the row it started on does not open', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const sheet = screen.getByTestId('sheet');
    const row = screen.getByTestId('row');
    act(() => {
      row.dispatchEvent(pointer('pointerdown', 100, 0));
      window.dispatchEvent(pointer('pointermove', 104, 8));
    });
    expect(sheet.style.translate).toBe('');
    act(() => {
      window.dispatchEvent(pointer('pointermove', 130, 24));
      window.dispatchEvent(pointer('pointermove', 230, 40));
    });
    expect(sheet.style.translate).toBe('0 100px');
    act(() => {
      window.dispatchEvent(pointer('pointermove', 230, 64));
      window.dispatchEvent(pointer('pointerup', 230, 70));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(haptics.haptic).toHaveBeenCalledWith('commit');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    row.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('leaves the body alone when it is scrolled, the first move is up, the press is in a field, or the header owns it', () => {
    render(<Sheet onClose={vi.fn()} />);
    const sheet = screen.getByTestId('sheet');
    const body = screen.getByTestId('body');
    const press = (target: Element, moves: number[]) =>
      act(() => {
        target.dispatchEvent(pointer('pointerdown', 100, 0));
        moves.forEach((y, i) => window.dispatchEvent(pointer('pointermove', y, 16 * (i + 1))));
        window.dispatchEvent(pointer('pointerup', moves[moves.length - 1]!, 200));
      });
    Object.defineProperty(body, 'scrollTop', { value: 20, configurable: true });
    press(screen.getByTestId('row'), [140, 200]);
    expect(sheet.style.translate).toBe('');
    Object.defineProperty(body, 'scrollTop', { value: 0, configurable: true });
    press(screen.getByTestId('row'), [80, 200]);
    expect(sheet.style.translate).toBe('');
    press(screen.getByRole('textbox', { name: 'Name' }), [140, 200]);
    expect(sheet.style.translate).toBe('');
    press(screen.getByRole('button', { name: 'Close' }), [140, 200]);
    expect(sheet.style.translate).toBe('');
  });

  it('a throw hands its speed to the exit once, and a refused close lets it lapse', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const sheet = screen.getByTestId('sheet');
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 100, 1000));
      [10, 20, 30, 40].forEach((d, i) => window.dispatchEvent(pointer('pointermove', 100 + d, 1000 + 8 * (i + 1))));
      window.dispatchEvent(pointer('pointerup', 140, 1034));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // 40px over 32ms, let go 2ms after the last move: the speed fades by 2/80.
    expect(takeSheetFling(sheet)).toBeCloseTo(1.25 * (1 - 2 / 80), 3);
    expect(takeSheetFling(sheet)).toBe(0);
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 100, 2000));
      [10, 20, 30, 40].forEach((d, i) => window.dispatchEvent(pointer('pointermove', 100 + d, 2000 + 8 * (i + 1))));
      window.dispatchEvent(pointer('pointerup', 140, 2034));
    });
    now.mockReturnValue(2100);
    expect(takeSheetFling(sheet)).toBe(0);
  });

  it('a Modal thrown shut leaves on the spring at the throw speed; closed by its button it takes the base ease-out', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    vi.stubGlobal('CSS', { supports: () => true });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    const exits: KeyframeAnimationOptions[] = [];
    // jsdom has no Web Animations; the exit's timing is what this checks.
    HTMLElement.prototype.animate ??= (() => ({})) as unknown as typeof HTMLElement.prototype.animate;
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation((_frames, options) => {
      exits.push(options as KeyframeAnimationOptions);
      return { onfinish: null, cancel: vi.fn() } as unknown as Animation;
    });
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="Requests">
          Body
        </Modal>
      );
    }
    try {
      const thrown = render(<Harness />);
      const head = document.querySelector('.ch-modal__head') as HTMLElement;
      act(() => {
        head.dispatchEvent(pointer('pointerdown', 100, 1000));
        [12, 24, 36, 48].forEach((d, i) => window.dispatchEvent(pointer('pointermove', 100 + d, 1000 + 8 * (i + 1))));
        window.dispatchEvent(pointer('pointerup', 148, 1034));
      });
      expect(exits).toHaveLength(1);
      expect(String(exits[0]!.easing)).toMatch(/^linear\(/);
      expect(exits[0]!.duration).not.toBe(CH_DUR.base * 1000);
      thrown.unmount();
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(exits).toHaveLength(2);
      expect(exits[1]).toMatchObject({ duration: CH_DUR.base * 1000, easing: 'cubic-bezier(.22,1,.36,1)' });
    } finally {
      window.matchMedia = real;
      vi.unstubAllGlobals();
    }
  });
});

function Raise() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title: 'Saved' })}>
      Raise
    </button>
  );
}

describe('CH-1614 a toast swipes away and waits while held', () => {
  const toastEl = () => {
    const el = screen.getByRole('status').closest('.ch-toast') as HTMLElement;
    // At the foot of the screen, as on a phone: its edge is down.
    el.getBoundingClientRect = () => ({ top: 700, height: 48, bottom: 748, left: 12, right: 378, width: 366, x: 12, y: 700, toJSON: () => ({}) }) as DOMRect;
    return el;
  };

  it('a finger on it stops its clock; let go, it finishes what was left, never less than 1.5 seconds', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Raise /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Raise' }));
    const el = toastEl();
    act(() => vi.advanceTimersByTime(3500));
    act(() => {
      el.dispatchEvent(pointer('pointerdown', 720, 0));
    });
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => {
      window.dispatchEvent(pointer('pointerup', 720, 10));
    });
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('thrown toward its edge past 40px it goes; short of that it springs back and stays', () => {
    render(<ToastProvider><Raise /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Raise' }));
    let el = toastEl();
    act(() => {
      el.dispatchEvent(pointer('pointerdown', 720, 0));
      window.dispatchEvent(pointer('pointermove', 740, 16));
      window.dispatchEvent(pointer('pointermove', 740, 200));
      window.dispatchEvent(pointer('pointerup', 740, 210));
    });
    expect(el.style.translate).toBe('');
    expect(screen.getByText('Saved')).toBeTruthy();
    el = toastEl();
    act(() => {
      el.dispatchEvent(pointer('pointerdown', 720, 300));
      window.dispatchEvent(pointer('pointermove', 790, 316));
    });
    expect(el.style.translate).toBe('0 70px');
    act(() => {
      window.dispatchEvent(pointer('pointerup', 790, 320));
    });
    expect(screen.queryByText('Saved')).toBeNull();
    expect(haptics.haptic).not.toHaveBeenCalled();
  });
});

describe('CH-1907 tapping the tab already open', () => {
  const shell = { nextEvent: null, pendingJoinRequests: null };

  it('at its root, scrolls to the top without a tick', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
    render(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
    const home = screen.getByRole('link', { name: /Home/ });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      home.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(haptics.haptic).not.toHaveBeenCalled();
  });

  it('with screens pushed, pops back to the root through history', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    window.history.replaceState({ chPhone: 2 }, '');
    try {
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      render(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
      fireEvent.click(screen.getByRole('link', { name: /Home/ }));
      expect(go).toHaveBeenCalledWith(-2);
      expect(haptics.haptic).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, '');
    }
  });
});

describe('CH-1908 a Back that iOS already animated', () => {
  it('is known at once, and turns the page crossfade off for a moment', () => {
    vi.useFakeTimers();
    const back = new PopStateEvent('popstate', { state: null });
    Object.defineProperty(back, 'hasUAVisualTransition', { value: true });
    window.dispatchEvent(back);
    expect(poppedByUA()).toBe(true);
    expect(document.documentElement.hasAttribute('data-ch-ua-pop')).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(document.documentElement.hasAttribute('data-ch-ua-pop')).toBe(false);
  });
});

describe('CH-1708 scrubbing a slider', () => {
  function Harness() {
    const [value, setValue] = useState(2);
    return <Slider label="Holes" value={value} min={0} max={9} step={1} onChange={setValue} />;
  }

  it('warms the engine as the finger lands, ticks each step it crosses, and lets it idle on release; a key ticks once', () => {
    render(<Harness />);
    const range = screen.getByRole('slider', { name: 'Holes' });
    fireEvent.pointerDown(range);
    fireEvent.change(range, { target: { value: '3' } });
    fireEvent.change(range, { target: { value: '4' } });
    fireEvent.pointerUp(range);
    expect(haptics.hapticScrub.mock.calls.map((c) => c[0])).toEqual(['start', 'step', 'step', 'end']);
    expect(haptics.haptic).not.toHaveBeenCalled();
    fireEvent.change(range, { target: { value: '5' } });
    expect(haptics.haptic).toHaveBeenCalledWith('select');
    expect(haptics.hapticScrub).toHaveBeenCalledTimes(4);
  });
});
