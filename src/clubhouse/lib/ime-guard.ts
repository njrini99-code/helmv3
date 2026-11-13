'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { CompositionEvent, KeyboardEvent } from 'react';

/**
 * Enter is how an input method (Japanese, Chinese, Korean, Vietnamese …) COMMITS a word, so an Enter-to-send that does not
 * know about composition sends the fragment typed so far and clears the box. Fairway's message composer learned this
 * first (G-23, `MessageComposer.imeComposition.test.tsx`); this is the same guard for Clubhouse's composers.
 *
 * No single signal covers every engine, so it reads three:
 *   - `isComposing` on the native event: Chromium and Gecko dispatch the commit keydown while composition is still open.
 *   - `keyCode === 229`: the same engines' legacy mark, and all some Android WebViews report.
 *   - composition events: WebKit (Safari, the iOS app's WKWebView) ends composition BEFORE the commit keydown, so the two
 *     above are already false by then. The flag clears on the next macrotask rather than at compositionend, which swallows
 *     exactly that one keydown and nothing a person could type next.
 *
 * Spread `composition` on the field and ask `composing(e)` first in its keydown.
 */
export function useImeGuard(): {
  composition: { onCompositionStart: (e: CompositionEvent) => void; onCompositionEnd: (e: CompositionEvent) => void };
  composing: (e: KeyboardEvent) => boolean;
} {
  const open = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onCompositionStart = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    open.current = true;
  }, []);
  const onCompositionEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      open.current = false;
      timer.current = null;
    }, 0);
  }, []);
  const composing = useCallback((e: KeyboardEvent) => open.current || e.nativeEvent.isComposing || e.keyCode === 229, []);
  return { composition: { onCompositionStart, onCompositionEnd }, composing };
}
