'use client';

import type { KeyboardEvent } from 'react';

const RADIO = '[role="radio"]';

/** The radios a key can land on: in document order, without the disabled ones. */
function enabledRadios(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>(RADIO)).filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
  );
}

/** One tab stop for the group: the checked radio, or the first enabled one when none is checked. */
export function syncRoving(group: HTMLElement): void {
  const all = Array.from(group.querySelectorAll<HTMLElement>(RADIO));
  const live = enabledRadios(group);
  const stop = live.find((el) => el.getAttribute('aria-checked') === 'true') ?? live[0];
  for (const el of all) {
    const want = el === stop ? '0' : '-1';
    if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want);
  }
}

/** Where an arrow, Home or End key goes from `from` among `count` enabled radios, or null for any other key. Wraps. */
export function rovingTarget(key: string, from: number, count: number): number | null {
  if (count < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const d = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (!d) return null;
  return (Math.max(from, 0) + d + count) % count;
}

/** Keeps `group`'s tab stop current as radios are checked, disabled, added or removed; returns the cleanup. */
function watchRoving(group: HTMLElement): () => void {
  syncRoving(group);
  if (typeof MutationObserver === 'undefined') return () => {};
  const seen = new MutationObserver(() => syncRoving(group));
  seen.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'disabled', 'aria-disabled'] });
  return () => seen.disconnect();
}

function onKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const radios = enabledRadios(e.currentTarget);
  const from = radios.findIndex((el) => el === document.activeElement || el.contains(document.activeElement));
  if (from < 0) return;
  const to = rovingTarget(e.key, from, radios.length);
  if (to === null) return;
  e.preventDefault();
  const next = radios[to];
  if (!next || next === radios[from]) return;
  next.focus();
  next.click();
}

/**
 * Roving focus for a hand-rolled `role="radiogroup"`: the checked radio is the one tab stop, the arrow keys move
 * (Home and End jump) and check as the native control does, skipping disabled radios. The key focuses the next radio and
 * clicks it, so the group's own onClick (its haptic and its state change) stays the single way a choice is made.
 *
 *   <div role="radiogroup" aria-label="Holes" {...roving}> ...radios... </div>
 *
 * Spread it on the group. It holds no state, so it works in a loop (a par group per hole) and for radios that live in
 * child components: tab stops are kept on the DOM, and a MutationObserver follows what changes a choice.
 */
export const roving = {
  ref: (el: HTMLElement | null) => {
    if (!el) return undefined;
    const stop = watchRoving(el);
    return () => {
      stop();
    };
  },
  onKeyDown,
};

/** The same props as a hook, for a caller that reads better with one. */
export function useRoving() {
  return roving;
}
