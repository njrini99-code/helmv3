/**
 * Performance optimization utilities
 */

import { memo, ComponentType } from 'react';

/**
 * Deep comparison function for React.memo
 * Use sparingly - only for components with complex props
 */
export function deepCompare<T extends Record<string, any>>(
  prevProps: T,
  nextProps: T
): boolean {
  return JSON.stringify(prevProps) === JSON.stringify(nextProps);
}

/**
 * Shallow comparison for simple props
 * More performant than deep compare
 */
export function shallowCompare<T extends Record<string, any>>(
  prevProps: T,
  nextProps: T
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Memoize a component with shallow comparison
 * Use for components that receive primitive props
 */
export function memoShallow<P extends Record<string, any>>(
  Component: ComponentType<P>,
  displayName?: string
): ComponentType<P> {
  const MemoComponent = memo(Component, shallowCompare);

  if (displayName) {
    MemoComponent.displayName = displayName;
  }

  return MemoComponent;
}

/**
 * Memoize a component with deep comparison
 * Use for components that receive complex objects
 * WARNING: Can be expensive - use sparingly
 */
export function memoDeep<P extends Record<string, any>>(
  Component: ComponentType<P>,
  displayName?: string
): ComponentType<P> {
  const MemoComponent = memo(Component, deepCompare);

  if (displayName) {
    MemoComponent.displayName = displayName;
  }

  return MemoComponent;
}

/**
 * Debounce function for performance
 * Delays function execution until after delay has passed
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle function for performance
 * Limits function execution to once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCall >= interval) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Request Idle Callback wrapper with fallback
 * Schedules work during browser idle time
 */
export function requestIdleCallbackPolyfill(
  callback: () => void,
  options?: { timeout?: number }
): number {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  }

  // Fallback to setTimeout
  return setTimeout(callback, 1) as unknown as number;
}

/**
 * Cancel idle callback with fallback
 */
export function cancelIdleCallbackPolyfill(id: number): void {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * Intersection Observer hook helper
 * Lazy load content when it enters viewport
 */
export function createIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px', // Start loading slightly before element enters viewport
    threshold: 0.01, // Trigger when 1% is visible
    ...options,
  });
}

/**
 * Prefetch data or resources
 * Use for anticipated navigation or data needs
 */
export function prefetchResource(url: string, type: 'script' | 'style' | 'fetch' = 'fetch'): void {
  if (typeof window === 'undefined') return;

  if (type === 'fetch') {
    // Prefetch data
    fetch(url, { priority: 'low' } as RequestInit).catch(() => {
      // Silently fail - this is just a hint
    });
  } else {
    // Prefetch script or style
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = type === 'script' ? 'script' : 'style';
    document.head.appendChild(link);
  }
}

/**
 * Measure component render time (development only)
 */
export function measureRenderTime(componentName: string, callback: () => void): void {
  if (process.env.NODE_ENV !== 'development') {
    callback();
    return;
  }

  const start = performance.now();
  callback();
  const end = performance.now();

  console.log(`[Performance] ${componentName} rendered in ${(end - start).toFixed(2)}ms`);
}

/**
 * Virtual scrolling helper for large lists
 * Returns slice of items to render based on scroll position
 */
export function getVisibleItems<T>(
  items: T[],
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  overscan = 3
): { visibleItems: T[]; startIndex: number; endIndex: number } {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  return {
    visibleItems: items.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
  };
}
