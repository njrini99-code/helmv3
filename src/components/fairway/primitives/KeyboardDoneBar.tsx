'use client';

/**
 * KeyboardDoneBar: a 44pt "Done" key above the on-screen keyboard
 * (design-direction §4.5, §5 #21; ledger DS-12; RE-F3, RE-F8).
 *
 * The iOS shell hides the WebView accessory bar, so a numeric pad has no way
 * to close. This bar appears while a text field inside `scope` (default: the
 * whole document) has focus and blurs the field on Done. It renders nothing
 * on a fine pointer, where no on-screen keyboard covers the page.
 *
 * It sits on the keyboard through `--keyboard-height`, which CapacitorProvider
 * publishes from the native keyboard events and from `visualViewport` on the
 * web (the WebView never resizes for the keyboard, so a viewport reading of
 * its own would stay 0 on a device).
 *
 * Mount it once near the form. It carries no state beyond "a field is focused".
 */

import { useEffect, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

const TEXT_INPUT =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable="true"]';

export interface KeyboardDoneBarProps {
  /** Limit the bar to fields inside this element. */
  scope?: RefObject<HTMLElement | null>;
  label?: string;
  /** Called after the field is blurred. */
  onDone?: () => void;
  className?: string;
}

function isCoarse(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
}

export function KeyboardDoneBar({ scope, label = 'Done', onDone, className }: KeyboardDoneBarProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isCoarse()) return;
    const inScope = (el: EventTarget | null): el is HTMLElement =>
      el instanceof HTMLElement && el.matches(TEXT_INPUT) && (!scope?.current || scope.current.contains(el));

    const onFocusIn = (e: FocusEvent) => setActive(inScope(e.target));
    const onFocusOut = (e: FocusEvent) => {
      if (!inScope(e.relatedTarget)) setActive(false);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [scope]);

  if (!active) return null;

  return (
    <div
      data-slot="keyboard-done-bar"
      className={cn(
        'fixed inset-x-0 z-50 flex h-11 items-center justify-end border-t border-border-subtle bg-elevated px-4',
        className,
      )}
      style={{ bottom: 'var(--keyboard-height, 0px)' }}
    >
      {/* eslint-disable-next-line helm/no-raw-button -- keyboard accessory key, mirrors the system Done key */}
      <button
        type="button"
        // Keep focus on the field until the tap lands, so the keyboard does not drop first.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const el = document.activeElement;
          if (el instanceof HTMLElement) el.blur();
          setActive(false);
          onDone?.();
        }}
        className="min-h-11 px-2 font-fw-sans text-headline text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {label}
      </button>
    </div>
  );
}
