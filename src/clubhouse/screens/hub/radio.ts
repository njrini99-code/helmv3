import type { KeyboardEvent } from 'react';

/**
 * A radio group the keyboard can walk (P010 D7): one Tab stop (the checked radio, else the first), and the arrow keys,
 * Home and End move between the radios. `select`: the arrow also chooses the radio it lands on, as a native radio group
 * does; off where choosing is a write that reaches someone (an RSVP), where the arrows only move and Space or Enter
 * chooses.
 */
export function radioKeys(select = true) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')];
    if (!radios.length) return;
    const at = radios.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? radios[0]! : e.key === 'End' ? radios[radios.length - 1]! : radios[(Math.max(at, 0) + step + radios.length) % radios.length]!;
    e.preventDefault();
    next.focus();
    if (select && next.getAttribute('aria-checked') !== 'true') next.click();
  };
}

/** A callback ref for the group: keeps the one Tab stop on the checked radio as the choice changes. */
export function rovingRadios(group: HTMLElement | null): void {
  if (!group) return;
  const sync = () => {
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    const on = radios.find((r) => r.getAttribute('aria-checked') === 'true') ?? radios[0];
    for (const r of radios) r.tabIndex = r === on ? 0 : -1;
  };
  sync();
  new MutationObserver(sync).observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
}
