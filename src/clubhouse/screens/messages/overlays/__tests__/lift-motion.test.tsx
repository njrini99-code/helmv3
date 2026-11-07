// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reduced = vi.hoisted(() => ({ on: false }));
vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => reduced.on }));
type Call = { node: HTMLElement; keyframes: Keyframe[]; spring: string | null; opts: Record<string, unknown>; anim: { onfinish: (() => void) | null; cancel: () => void; reverse: () => void } };
const played = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('../../motion/messages-motion', async (orig) => {
  const real = await orig<typeof import('../../motion/messages-motion')>();
  return {
    ...real,
    msAnimate: (node: HTMLElement, keyframes: Keyframe[], spring: string | null, opts: Record<string, unknown> = {}) => {
      const anim = { onfinish: null as (() => void) | null, cancel: vi.fn(), reverse: vi.fn() };
      played.calls.push({ node, keyframes, spring, opts, anim });
      return anim as unknown as Animation;
    },
  };
});

import { HoldLift, atRestBox, placeLift, type LiftGeometry } from '../../hold-lift';
import { HoldReactKeys } from '../HoldKeys';
import { ComposerPlusV2, ATTACH_IN, ATTACH_OUT } from '../../ComposerPlusV2';
import { layerReactions } from '../../api/use-overlay-api';
import { popBadge } from '../bubble-actions';

const calls = () => played.calls as Call[];
beforeEach(() => {
  played.calls.length = 0;
  reduced.on = false;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const geom: LiftGeometry = { row: { left: 0, top: 300, width: 390, height: 60 }, bubble: { left: 200, top: 300, right: 380, bottom: 340 }, sink: 0.97, scope: '' };
const view = { w: 390, h: 844 };
const box = { barW: 260, menuW: 236, menuH: 200 };
const still = { top: 0, bottom: 0 };

describe('MSG-402 placement', () => {
  it('bar 56 above the bubble, menu 10 below, mine right-aligned, clamped 8 in', () => {
    const p = placeLift(geom, box, view, { mine: true, phone: true, inset: still });
    expect(p).toMatchObject({ shift: 0, barTop: 244, menuTop: 350, barLeft: 120, menuLeft: 144 });
  });
  it('theirs left-aligned, never closer than 8 to the edge', () => {
    const p = placeLift({ ...geom, bubble: { ...geom.bubble, left: 2, right: 100 } }, box, view, { mine: false, phone: true, inset: still });
    expect(p.barLeft).toBe(8);
    expect(p.menuLeft).toBe(8);
  });
  it('moves up when the menu would pass the bottom 36 (phone) and down when the bar would pass the top 60', () => {
    const low = placeLift({ ...geom, bubble: { ...geom.bubble, top: 700, bottom: 740 } }, box, view, { mine: true, phone: true, inset: still });
    expect(low.shift).toBe(844 - 36 - (740 + 10 + 200));
    const high = placeLift({ ...geom, bubble: { ...geom.bubble, top: 80, bottom: 120 } }, box, view, { mine: true, phone: true, inset: still });
    expect(high.shift).toBe(60 - (80 - 56));
  });
  it('desktop safe margins are 12 and 12', () => {
    const high = placeLift({ ...geom, bubble: { ...geom.bubble, top: 50, bottom: 90 } }, box, view, { mine: true, phone: false, inset: still });
    expect(high.shift).toBe(12 - (50 - 56));
  });
  it('takes the press scale out of a measured box', () => {
    const scaled = new DOMRect(10.15, 5.15, 97, 29.1);
    const rest = atRestBox(new DOMRect(10.15, 5.15, 97, 29.1), scaled, 100);
    expect(rest.width).toBeCloseTo(100, 0);
  });
});

function mount(opts: { onClosed?: () => void } = {}) {
  const row = document.createElement('div');
  row.id = 'ch-ms-message-m1';
  row.innerHTML = '<div class="ch-ms-msg__stack" data-ch-msg-focus tabindex="0" data-ch-press-scale=".97"><div class="ch-ms-bub" data-ch-bubble>hi</div></div>';
  row.getBoundingClientRect = () => new DOMRect(0, 300, 390, 60);
  const bubble = row.querySelector('[data-ch-bubble]') as HTMLElement;
  bubble.getBoundingClientRect = () => new DOMRect(200, 300, 180, 40);
  document.body.append(row);
  const ui = (signal: number) => (
    <HoldLift messageId="m1" mine closeSignal={signal} onClosed={opts.onClosed ?? (() => {})} bar={<HoldReactKeys reacts={[{ key: 'Love', count: 1, mine: true }]} onPick={() => {}} />}>
      <button type="button" role="menuitem">Reply</button>
    </HoldLift>
  );
  return { row, ui, ...render(ui(0)) };
}

describe('MSG-402 / 403 the lift', () => {
  it('is a dialog with a React toolbar of the six exactly-named keys and a menu; Love is on', () => {
    mount();
    expect(screen.getByRole('dialog', { name: 'Message actions' })).toBeTruthy();
    const bar = screen.getByRole('toolbar', { name: 'React' });
    expect(Array.from(bar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Like', 'Love', 'Laugh', 'Celebrate', 'Surprised', 'Thanks']);
    expect(screen.getByRole('button', { name: 'Love' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('copies the row without its id, press scale or tab stop, and hides the real row', () => {
    const { row } = mount();
    const copy = document.querySelector('.ch-mso-lift__copy')!;
    expect(copy.querySelector('[id]')).toBeNull();
    expect(copy.querySelector('[data-ch-press-scale], [tabindex]')).toBeNull();
    expect(row.style.visibility).toBe('hidden');
  });

  it('MOT-HOLD-2/3/4/5: copy lifts on lift from the press scale, bar pops, menu unfolds on lift, scrim fades on smooth', () => {
    mount();
    const by = (cls: string) => calls().find((c) => c.node.className.includes(cls))!;
    expect(by('ch-mso-lift__copy').spring).toBe('lift');
    expect(String(by('ch-mso-lift__copy').keyframes[0]!.transform)).toMatch(/^translateY\(0\) scale\((0\.9|1\.0)/);
    expect(by('ch-mso-lift__copy').keyframes[1]).toEqual({ transform: 'translateY(0px) scale(1.02)' });
    expect(by('ch-mso-rbar').spring).toBe('pop');
    expect(by('ch-mso-rbar').keyframes[0]).toEqual({ transform: 'scale(.5)', opacity: 0 });
    expect(by('ch-mso-menu').spring).toBe('lift');
    expect(by('ch-mso-menu').keyframes[0]).toEqual({ transform: 'scale(.8)', opacity: 0 });
    expect(by('ch-mso-lift__scrim').spring).toBe('smooth');
    expect(by('ch-mso-lift__copy').node.style.transformOrigin).toBe('290px 20px');
  });

  it('first reaction key takes focus', () => {
    mount();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Like' }));
  });

  it('MOT-HOLD-6: dismiss shrinks bar .6 and menu .85 over 160 ms live, scrim 280 ms, copy settles home; the row returns and takes focus', () => {
    const onClosed = vi.fn();
    const { row, rerender, ui } = mount({ onClosed });
    played.calls.length = 0;
    rerender(ui(1));
    const by = (cls: string) => calls().find((c) => c.node.className.includes(cls))!;
    expect(by('ch-mso-rbar').keyframes[1]).toEqual({ opacity: 0, transform: 'scale(.6)' });
    expect(by('ch-mso-rbar').opts).toMatchObject({ live: true, fill: 'forwards', timing: { ms: 160 } });
    expect(by('ch-mso-menu').keyframes[1]).toEqual({ opacity: 0, transform: 'scale(.85)' });
    expect(by('ch-mso-lift__scrim').opts).toMatchObject({ live: true, timing: { ms: 280 } });
    expect(by('ch-mso-lift__copy').spring).toBe('settle');
    expect(onClosed).not.toHaveBeenCalled();
    act(() => calls().forEach((c) => c.anim.onfinish?.()));
    expect(onClosed).toHaveBeenCalledOnce();
    expect(row.style.visibility).toBe('');
    expect(document.activeElement).toBe(row.querySelector('[data-ch-msg-focus]'));
  });

  it('touching the settling copy takes it back from the live frame (MC-04): every part reversed, none finishes', () => {
    const onClosed = vi.fn();
    const { rerender, ui } = mount({ onClosed });
    played.calls.length = 0;
    rerender(ui(1));
    const out = calls().slice();
    fireEvent.pointerDown(document.querySelector('.ch-mso-lift__copy')!);
    for (const c of out) expect(c.anim.reverse).toHaveBeenCalled();
    act(() => out.forEach((c) => c.anim.onfinish?.()));
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('Escape dismisses', () => {
    mount();
    played.calls.length = 0;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls().some((c) => c.opts.timing && (c.opts.timing as { ms: number }).ms === 160)).toBe(true);
  });

  it('Reduce Motion: every part is handed over reduced (the engine crossfades; the copy has no motion of its own)', () => {
    reduced.on = true;
    mount();
    expect(calls().every((c) => c.opts.reduced === true)).toBe(true);
    expect(calls().find((c) => c.node.className.includes('lift__copy'))!.opts.rd).toBeNull();
  });
});

describe('MOT-RX-1 badge pop', () => {
  it('scales .4 to 1 on pop, once per badge; Reduce Motion hands it over reduced (appears)', () => {
    const el = document.createElement('button');
    popBadge(el, false);
    popBadge(el, false);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({ spring: 'pop', keyframes: [{ transform: 'scale(.4)' }, { transform: 'scale(1)' }] });
    const b = document.createElement('button');
    popBadge(b, true);
    expect(calls()[1]!.opts).toMatchObject({ reduced: true });
  });
});

describe('MSG-406 reaction badges layered on the server (optimistic, RX order)', () => {
  const base = new Map([['m1', [{ key: 'Thanks' as const, count: 1, mine: false, userIds: ['u2'] }, { key: 'Like' as const, count: 2, mine: false, userIds: ['u2', 'u3'] }]]]);
  it('orders by the picker, not by code point', () => {
    expect(layerReactions(base, new Map(), 'me').get('m1')!.map((r) => r.key)).toEqual(['Like', 'Thanks']);
  });
  it('a pending add shows at once, mine, counted', () => {
    const r = layerReactions(base, new Map([['m1|Love', true]]), 'me').get('m1')!;
    expect(r.map((x) => x.key)).toEqual(['Like', 'Love', 'Thanks']);
    expect(r.find((x) => x.key === 'Love')).toMatchObject({ count: 1, mine: true, userIds: ['me'] });
  });
  it('a pending take-back drops the badge at 1 and decrements above', () => {
    const mine = new Map([['m1', [{ key: 'Like' as const, count: 2, mine: true, userIds: ['me', 'u3'] }, { key: 'Love' as const, count: 1, mine: true, userIds: ['me'] }]]]);
    const r = layerReactions(mine, new Map([['m1|Like', false], ['m1|Love', false]]), 'me').get('m1')!;
    expect(r).toEqual([{ key: 'Like', count: 1, mine: false, userIds: ['u3'] }]);
  });
  it('a tap the server already agrees with changes nothing', () => {
    const mine = new Map([['m1', [{ key: 'Like' as const, count: 1, mine: true, userIds: ['me'] }]]]);
    expect(layerReactions(mine, new Map([['m1|Like', true]]), 'me').get('m1')).toEqual(mine.get('m1'));
  });
});

describe('MOT-ATT-2 / MC-06 the attach menu', () => {
  const api = { polls: undefined } as never;
  const conv = { id: 'c1', group: false } as never;
  const show = () => render(<ComposerPlusV2 api={api} conv={conv} onPick={() => {}} />);
  const key = () => screen.getByRole('button', { name: /Add a photo|Close/ });

  it('grows 0.4 to 1 on lift from the +; exactly Photos and File in a DM', () => {
    show();
    fireEvent.click(key());
    expect(ATTACH_IN[0]).toEqual({ transform: 'scale(.4)', opacity: 0 });
    expect(calls()[0]).toMatchObject({ spring: 'lift' });
    expect(calls()[0]!.keyframes).toEqual([...ATTACH_IN]);
    expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Photos', 'File']);
  });

  it('closes 1 to 0.7 over 160 ms from the live frame, and unmounts when it ends', () => {
    show();
    fireEvent.click(key());
    played.calls.length = 0;
    fireEvent.click(key());
    expect(calls()[0]!.keyframes).toEqual([...ATTACH_OUT]);
    expect(calls()[0]!.opts).toMatchObject({ live: true, fill: 'forwards', timing: { ms: 160 } });
    expect(screen.queryByRole('menu')).not.toBeNull();
    act(() => calls()[0]!.anim.onfinish?.());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('reopened while it closes, it unfolds again from the live frame and the old fade is cancelled (no second menu)', () => {
    show();
    fireEvent.click(key());
    fireEvent.click(key());
    const out = calls()[calls().length - 1]!;
    played.calls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /Add a photo|Close/ }));
    expect(calls()[0]).toMatchObject({ spring: 'lift' });
    expect(calls()[0]!.opts).toMatchObject({ live: true });
    expect(out.anim.cancel).toHaveBeenCalled();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    act(() => out.anim.onfinish?.());
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('Escape closes it and focus returns to the + key', () => {
    show();
    fireEvent.click(key());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(key());
  });

  it('Reduce Motion: handed over reduced (the engine crossfades)', () => {
    reduced.on = true;
    show();
    fireEvent.click(key());
    expect(calls()[0]!.opts).toMatchObject({ reduced: true });
  });
});
