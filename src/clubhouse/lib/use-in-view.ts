'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * True once the element has scrolled into view, and then for good: a picture that draws itself the first time it is seen,
 * not every time. With no IntersectionObserver (an old WebView, a test) it is true at once, so nothing waits on it.
 */
export function useInViewOnce<T extends Element>(threshold = 0.35): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}
