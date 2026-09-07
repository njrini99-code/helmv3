// @vitest-environment jsdom
//
// G-47 — composer geometry, now that the artboard supplies the numbers.
//
// Five deltas, one finding:
//   1. the raised outer "glass dock" did not exist — the <form> WAS the
//      composer, a flush `border-t` + `bg-surface-sunken` footer, so the
//      two-layer dock+track construction §9.1 describes was one layer (M03C F13)
//   2. the send control was `rounded-fw-md` (14px), a rounded square, where
//      the artboard draws a full circle
//   3. mobile drew a 44px VISIBLE circle, inverting §9.1's own 40px-visible /
//      44px-hit-area split by growing the circle instead of the tap zone
//   4. the track was hardcoded `items-end`, bottom-aligning controls on a
//      single-line composer the artboard centres
//   5. the placeholder was generic where the artboard names the recipient
//
// The dock's tests measure BOTH SIDES — the artboard's `.slab` parsed out of
// `Composer.dc.html` against the `--fw-*` values parsed out of
// `design-tokens.css` — because the finding IS that they are the same values.
// If either file moves, this suite says so.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MessageComposer } from './MessageComposer';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const artboard = read('audit/reference/Composer.dc.html');
const tokens = read('src/styles/design-tokens.css');
const composerSource = read('src/components/fairway/pages/messages/MessageComposer.tsx');
const parentSource = read('src/components/fairway/pages/messages/FairwayMessages.tsx');

/** Comment-stripped, so the fix's own prose cannot satisfy a check. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
const composerCode = strip(composerSource);
const parentCode = strip(parentSource);

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** One declaration out of the artboard's `.slab` rule. */
function slabValue(prop: string): string {
  const body = artboard.match(/\.slab\s*\{([\s\S]*?)\}/)?.[1];
  expect(body, 'expected a .slab rule in Composer.dc.html').toBeDefined();
  const value = body!.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`))?.[1];
  expect(value, `expected ${prop} in .slab`).toBeDefined();
  return squash(value!);
}

/**
 * A light-theme custom property. Names repeat in the dark block, so the FIRST
 * occurrence in file order is the light value — the same de-duping the bubble
 * depth suite needed.
 */
function token(name: string): string {
  const value = tokens.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1];
  expect(value, `expected ${name} in design-tokens.css`).toBeDefined();
  return squash(value!);
}

const dock = (container: HTMLElement) =>
  container.querySelector('form > div') as HTMLDivElement | null;
const sendButton = () => screen.getByLabelText('Send message');
const field = () => screen.getByPlaceholderText(/Message |Type a message/) as HTMLTextAreaElement;

function paintTextarea(lineHeightPx: number) {
  const style = document.createElement('style');
  style.setAttribute('data-test-paint', 'true');
  style.textContent = `textarea { box-sizing: border-box; font-size: 15px;
    line-height: ${lineHeightPx}px; padding-top: 8px; padding-bottom: 8px;
    border-top-width: 0px; border-bottom-width: 0px; }`;
  document.head.appendChild(style);
}

beforeEach(() => document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove()));
afterEach(() => document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove()));

describe('G-47 · the dock — and it is the Fairway glass material exactly', () => {
  it('the artboard background IS --fw-glass-bg', () => {
    expect(slabValue('background')).toBe(token('--fw-glass-bg').replace('var(--fw-glass-tint)', '244 232 210'));
  });

  it('the artboard blur and saturation ARE the glass tokens', () => {
    expect(slabValue('backdrop-filter')).toBe(
      `blur(${token('--fw-blur-glass')}) saturate(${token('--fw-glass-saturate')})`,
    );
  });

  it('the artboard radius IS --fw-radius-lg, the "glass bars" step', () => {
    expect(slabValue('border-radius')).toBe(token('--fw-radius-lg'));
  });

  it('the artboard drop shadow IS --fw-shadow-pop, to the byte', () => {
    // The .slab shadow is three layers: an inset specular, then two drops.
    // The two drops are what --fw-shadow-pop is.
    const drops = slabValue('box-shadow').split(/,\s*(?=0 )/).slice(1).join(', ');
    expect(drops).toBe(token('--fw-shadow-pop'));
  });

  it('renders a dock layer distinct from the form, carrying those tokens', () => {
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const el = dock(container);
    expect(el, 'expected a dock element inside the form').not.toBeNull();

    const cls = el!.className;
    expect(cls).toContain('rounded-fw-lg');
    expect(cls).toContain('[background:var(--fw-glass-bg)]');
    expect(cls).toContain('backdrop-filter:blur(var(--fw-blur-glass))_saturate(var(--fw-glass-saturate))');
    expect(cls).toContain('var(--fw-shadow-pop)');
    expect(cls).toContain('var(--fw-glass-highlight)');
  });

  it('is padded as the artboard pads it — 12px, 14px at the bottom', () => {
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(slabValue('padding')).toBe('12px 12px 14px 12px');
    expect(dock(container)!.className).toContain('p-3 pb-3.5');
  });

  it('no longer paints the flush edge-to-edge footer it replaced', () => {
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const form = container.querySelector('form') as HTMLFormElement;

    // Scoped to the FORM's own classes on purpose: `bg-surface-sunken` is
    // still correct further down, on the send button's disabled fill, and a
    // whole-file search would ban a token that has nothing to do with this.
    expect(form.className).not.toContain('bg-surface-sunken');
    expect(form.className).not.toContain('border-t');
    expect(composerCode).not.toContain('border-t border-border-subtle');
  });

  it('takes the pop depth step, not the overlay family’s raise', () => {
    // `.fw-glass-regular` is the same material but composes --fw-shadow-raise,
    // a visibly heavier float meant for popovers above the page.
    expect(composerCode).not.toContain('fw-glass-regular');
    expect(composerCode).not.toContain('var(--fw-shadow-raise)');
  });
});

describe('G-47 · the send control', () => {
  it('is a full circle, which is what --fw-radius-full is reserved for', () => {
    expect(artboard).toContain('.send { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 9999px;');
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(sendButton().className).toContain('rounded-full');
    expect(sendButton().className).not.toContain('rounded-fw-md');
  });

  it('draws 40px at every width, not 44 on a phone', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const cls = sendButton().className;
    expect(cls).toContain('h-10 w-10');
    // The defect: the visible circle was grown to the hit-area size.
    expect(cls).not.toContain('h-11 w-11');
    expect(cls).not.toContain('md:h-10 md:w-10');
  });

  it('keeps the 44px tap target as an overlay, so nothing drawn moves', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    // -inset-0.5 is 2px a side: 40 + 4 = 44, exactly §9.1's split.
    expect(sendButton().className).toContain('after:-inset-0.5');
    expect(sendButton().className).toContain('relative');
  });
});

describe('G-47 · the track aligns the way the artboard does', () => {
  it('centres its controls at rest', () => {
    paintTextarea(24);
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const track = container.querySelector('.rounded-fw-lg.flex') as HTMLElement | null;
    expect(track, 'expected the writing track').not.toBeNull();
    expect(track!.className).toContain('items-center');
    expect(track!.className).not.toContain('items-end');
  });

  it('bottom-aligns once the field has grown, and only then', () => {
    paintTextarea(24);
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const track = () => container.querySelector('.rounded-fw-lg.flex') as HTMLElement;

    // jsdom reports scrollHeight 0, so drive the grown state the way the
    // browser would: a taller content box than one line's worth.
    Object.defineProperty(field(), 'scrollHeight', { value: 24 * 3 + 16, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(track().className).toContain('items-end');
    expect(track().className).not.toContain('items-center');
  });

  it('opens 12px on the left, so the clip is off the track edge', () => {
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(artboard).toContain('padding: 5px 5px 5px 12px');
    expect((container.querySelector('.rounded-fw-lg.flex') as HTMLElement).className).toContain('pl-3');
  });
});

describe('G-47 · the field names who is about to hear you', () => {
  it('writes "Message <name>" when it is told one', () => {
    expect(artboard).toContain('Message Cole');
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true), recipientName: 'Cole' }));
    expect(screen.getByPlaceholderText('Message Cole')).toBeTruthy();
  });

  it('falls back rather than rendering "Message undefined"', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy();
  });

  it('reads the same source the thread header does', () => {
    // Two places naming the same person must not be able to disagree.
    expect(parentCode).toContain('recipientName={');
    expect(parentCode).toContain('other_participant?.name');
    expect(parentCode).toContain('selectedConversation.is_group');
  });

  it('keeps a group title whole — a group name is not a person’s', () => {
    // Clipping at the first space would invent a first name out of "Varsity
    // Team Chat".
    const call = parentCode.slice(parentCode.indexOf('recipientName={'));
    const groupBranch = call.slice(0, call.indexOf('}\n'));
    expect(groupBranch).toMatch(/is_group[\s\S]*title \|\| undefined/);
  });
});
