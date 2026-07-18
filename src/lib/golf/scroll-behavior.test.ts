// =============================================================================
// src/lib/golf/scroll-behavior.test.ts
//
// Pins the decision logic behind #947 (golf dashboard shell) items (2) and
// (3): scroll-to-top on forward route changes (never on back/forward or an
// anchor hash), and Home/End treated as page-scroll everywhere EXCEPT inside
// editable fields / composite ARIA widgets that own those keys themselves.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { isPageScrollHomeEndTarget, shouldResetScrollOnNavigate } from './scroll-behavior';

describe('shouldResetScrollOnNavigate', () => {
  it('resets on a normal forward navigation to a new route', () => {
    expect(
      shouldResetScrollOnNavigate({
        previousPathname: '/golf/dashboard',
        nextPathname: '/golf/dashboard/intelligence',
        isPopState: false,
        hash: '',
      }),
    ).toBe(true);
  });

  it('does not reset when the pathname did not change (re-render / first mount)', () => {
    expect(
      shouldResetScrollOnNavigate({
        previousPathname: '/golf/dashboard/intelligence',
        nextPathname: '/golf/dashboard/intelligence',
        isPopState: false,
        hash: '',
      }),
    ).toBe(false);
  });

  it('does not reset on browser back/forward — native scroll restoration owns it', () => {
    expect(
      shouldResetScrollOnNavigate({
        previousPathname: '/golf/dashboard/intelligence',
        nextPathname: '/golf/dashboard',
        isPopState: true,
        hash: '',
      }),
    ).toBe(false);
  });

  it('does not reset when the destination carries a hash (anchor navigation)', () => {
    expect(
      shouldResetScrollOnNavigate({
        previousPathname: '/golf/dashboard',
        nextPathname: '/golf/dashboard/roster',
        isPopState: false,
        hash: '#section',
      }),
    ).toBe(false);
  });

  it('treats first mount (previousPathname null) as no reset', () => {
    expect(
      shouldResetScrollOnNavigate({
        previousPathname: null,
        nextPathname: '/golf/dashboard',
        isPopState: false,
        hash: '',
      }),
    ).toBe(false);
  });
});

describe('isPageScrollHomeEndTarget', () => {
  function el(tagName: string, opts?: { role?: string; contentEditable?: boolean }): HTMLElement {
    const node = document.createElement(tagName);
    if (opts?.role) node.setAttribute('role', opts.role);
    if (opts?.contentEditable) {
      // jsdom respects the attribute for `.isContentEditable` reads.
      node.setAttribute('contenteditable', 'true');
    }
    return node;
  }

  it('is true for a plain generic element (default case — scroll the page)', () => {
    expect(isPageScrollHomeEndTarget(el('div'))).toBe(true);
  });

  it('is true for a button (never captures Home/End itself)', () => {
    expect(isPageScrollHomeEndTarget(el('button'))).toBe(true);
  });

  it('is true when target is null (no focused element)', () => {
    expect(isPageScrollHomeEndTarget(null)).toBe(true);
  });

  it.each(['input', 'textarea', 'select'])(
    'is false for a native form control (<%s> owns Home/End as cursor movement)',
    (tag) => {
      expect(isPageScrollHomeEndTarget(el(tag))).toBe(false);
    },
  );

  it('is false for a contentEditable element', () => {
    expect(isPageScrollHomeEndTarget(el('div', { contentEditable: true }))).toBe(false);
  });

  it.each(['listbox', 'tablist', 'menu', 'menubar', 'grid', 'treegrid', 'tree', 'slider'])(
    'is false inside a composite widget with role="%s" (owns its own Home/End)',
    (role) => {
      const widget = el('div', { role });
      const child = document.createElement('span');
      widget.appendChild(child);
      expect(isPageScrollHomeEndTarget(child)).toBe(false);
    },
  );

  it('is false when the composite-widget role sits on an ANCESTOR, not just the target itself', () => {
    const tablist = el('div', { role: 'tablist' });
    const tab = document.createElement('button');
    const label = document.createElement('span');
    tab.appendChild(label);
    tablist.appendChild(tab);
    expect(isPageScrollHomeEndTarget(label)).toBe(false);
  });
});
