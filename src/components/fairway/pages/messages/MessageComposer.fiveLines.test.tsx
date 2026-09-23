// @vitest-environment jsdom
//
// G-22 — five-line growth was a hardcoded 120px.
//
// `MessageComposer` clamped the textarea with `Math.min(scrollHeight, 120)`
// and an inline `maxHeight: '120px'`. §9.4 asks for computed lines, and the
// constant is not even five of them: at the composer's 24px line-height, 120px
// is five lines of CONTENT, and `py-2` spends 16px of it on padding — about
// 4.3 visible lines at the default text size, before a browser zoom, an OS
// text-size setting or iOS Dynamic Type takes another fraction away. That
// shrinking-under-large-text case is the one §9.4 exists to protect.
//
// BOTH SIDES ARE MEASURED. The cap the component writes is compared against
// the line-height parsed out of `tailwind.config.ts` plus the padding parsed
// out of the component's own class list — so the suite fails if the type scale
// moves, if the padding moves, or if the computation stops tracking them.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MessageComposer } from './MessageComposer';

const ROOT = process.cwd();
const composerSource = readFileSync(
  join(ROOT, 'src/components/fairway/pages/messages/MessageComposer.tsx'),
  'utf-8',
);
/** Comment-stripped, so the fix's own prose cannot satisfy a check. */
const composerCode = composerSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** The line-height `text-body` resolves to, read from the Tailwind config. */
function tokenBodyLineHeight(): number {
  const config = readFileSync(join(ROOT, 'tailwind.config.ts'), 'utf-8');
  const match = config.match(/'body':\s*\[\s*'\d+px',\s*\{\s*lineHeight:\s*'(\d+)px'/);
  expect(match, "expected a 'body' entry with a px lineHeight in tailwind.config.ts").not.toBeNull();
  return Number(match![1]);
}

/** The textarea's vertical padding, read from the class the component sets. */
function composerVerticalPadding(): number {
  // `py-2` on Tailwind's default 4px step. Read from the source rather than
  // assumed, so changing the class fails this suite rather than the layout.
  const classes = composerCode.match(/'flex-1 resize-none[^']*'/)?.[0] ?? '';
  const py = classes.match(/(?:^|\s)py-(\d+)/);
  expect(py, 'expected a py-* class on the composer textarea').not.toBeNull();
  return Number(py![1]) * 4 * 2;
}

/**
 * jsdom applies no Tailwind, so the type that would come from the class list
 * is injected directly. Longhand properties only — jsdom's cascade resolves
 * those reliably where shorthands can surprise.
 */
function paintTextarea(lineHeightPx: number, paddingPx: number) {
  const style = document.createElement('style');
  style.setAttribute('data-test-paint', 'true');
  style.textContent = `textarea {
    box-sizing: border-box;
    font-size: 15px;
    line-height: ${lineHeightPx}px;
    padding-top: ${paddingPx / 2}px;
    padding-bottom: ${paddingPx / 2}px;
    border-top-width: 0px;
    border-bottom-width: 0px;
  }`;
  document.head.appendChild(style);
}

const field = () => screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;

beforeEach(() => {
  document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove());
});
afterEach(() => {
  document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove());
});

describe('G-22 — the field grows to five measured lines', () => {
  it('caps at five lines of the type it is actually rendering, padding included', () => {
    const lineHeight = tokenBodyLineHeight();
    const padding = composerVerticalPadding();
    paintTextarea(lineHeight, padding);

    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    // Five lines of content PLUS the padding that shares the box — the half
    // the old constant omitted.
    expect(field().style.maxHeight).toBe(`${lineHeight * 5 + padding}px`);
  });

  it('is taller than the constant it replaces, by exactly the padding', () => {
    const lineHeight = tokenBodyLineHeight();
    const padding = composerVerticalPadding();
    paintTextarea(lineHeight, padding);

    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    expect(parseFloat(field().style.maxHeight)).toBe(120 + padding);
    expect(field().style.maxHeight).not.toBe('120px');
  });

  it('grows with the text, which is the case §9.4 was written for', () => {
    const padding = composerVerticalPadding();
    // A user at a larger text size: same five lines, more pixels each.
    paintTextarea(36, padding);

    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    expect(field().style.maxHeight).toBe(`${36 * 5 + padding}px`);
  });

  it('re-measures when the text size changes without a keystroke', () => {
    const padding = composerVerticalPadding();
    paintTextarea(24, padding);
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(field().style.maxHeight).toBe(`${24 * 5 + padding}px`);

    // A zoom, an OS text-size change, or a webfont finishing its load. All of
    // them fire a resize and none of them types a character.
    document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove());
    paintTextarea(30, padding);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(field().style.maxHeight).toBe(`${30 * 5 + padding}px`);
  });

  it('survives a line-height the platform declines to resolve', () => {
    const style = document.createElement('style');
    style.setAttribute('data-test-paint', 'true');
    // `normal` computes to the string, so parseFloat gives NaN — which would
    // poison the max and let the field grow without limit.
    style.textContent =
      'textarea { box-sizing: border-box; font-size: 20px; line-height: normal;' +
      ' padding-top: 0px; padding-bottom: 0px; border-top-width: 0px; border-bottom-width: 0px; }';
    document.head.appendChild(style);

    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    const max = parseFloat(field().style.maxHeight);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(0);
  });

  it('counts padding only where the box model includes it', () => {
    const style = document.createElement('style');
    style.setAttribute('data-test-paint', 'true');
    style.textContent =
      'textarea { box-sizing: content-box; font-size: 15px; line-height: 24px;' +
      ' padding-top: 8px; padding-bottom: 8px; border-top-width: 0px; border-bottom-width: 0px; }';
    document.head.appendChild(style);

    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    // Under content-box `height` excludes padding, so adding it would
    // overshoot by exactly 16px — the same class of error as the constant.
    expect(field().style.maxHeight).toBe('120px');
  });

  it('keeps the resting height a constant, which belongs to G-47', () => {
    paintTextarea(24, composerVerticalPadding());
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));

    // §9.4 is about growth. The control's one-line height is composer
    // geometry and is not this finding's to move.
    expect(field().style.minHeight).toBe('40px');
  });
});

describe('G-22 — the constant is gone from the source', () => {
  it('no longer clamps the height to a pixel literal', () => {
    expect(composerCode).not.toContain('scrollHeight, 120');
    expect(composerCode).not.toContain("maxHeight: '120px'");
  });

  it('writes the cap it computed, so no CSS cap can override it', () => {
    // Leaving `maxHeight` in the inline style would put the constant back in
    // charge, just more quietly.
    expect(composerCode).toContain('el.style.maxHeight = `${max}px`');
  });

  it('derives the cap from the element rather than the class list', () => {
    expect(composerCode).toContain('window.getComputedStyle(el)');
    expect(composerCode).toContain('MAX_VISIBLE_LINES');
  });
});
