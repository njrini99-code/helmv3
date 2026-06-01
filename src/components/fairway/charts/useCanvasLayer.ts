'use client';

/**
 * ============================================================================
 * useCanvasLayer — tiny retina-aware Canvas helper (local to charts group)
 * ----------------------------------------------------------------------------
 * Handles the boring-but-critical Canvas plumbing the spec calls out (§5.1):
 * device-pixel-ratio scaling for crisp retina rendering + ResizeObserver-driven
 * resize. Returns a ref to attach to a <canvas> plus the current CSS-px size and
 * a `draw(fn)` callback that runs the caller's painting in a pre-scaled context.
 *
 * Reads CSS custom properties off the canvas element so Canvas charts can resolve
 * the same `--fw-viz-*` tokens the SVG charts use (Canvas can't consume CSS vars
 * directly). Kept inside this folder per the brief's "no top-level shared files".
 * ========================================================================== */

import * as React from 'react';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface UseCanvasLayer {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  size: CanvasSize;
  /** Paint into a DPR-scaled, pre-cleared context (CSS-px coordinates). */
  draw: (fn: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void) => void;
}

/** Attach to a sized container; the canvas fills it and tracks DPR + resize. */
export function useCanvasLayer(): UseCanvasLayer {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = React.useState<CanvasSize>({ width: 0, height: 0 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const apply = () => {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const draw = React.useCallback(
    (fn: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void) => {
      const canvas = canvasRef.current;
      if (!canvas || size.width === 0 || size.height === 0) return;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
      canvas.width = Math.floor(size.width * dpr);
      canvas.height = Math.floor(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      fn(ctx, size);
    },
    [size],
  );

  return { canvasRef, size, draw };
}

/**
 * Resolve a CSS color (incl. `var(--fw-*)` tokens) to a concrete value Canvas
 * can paint. Reads off the given element's computed style. Falls back to the
 * raw input when no element is available (SSR / detached).
 */
export function resolveCssColor(el: HTMLElement | null, value: string): string {
  if (!el || typeof window === 'undefined') return value;
  const match = value.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
  const varName = match?.[1];
  if (!varName) return value;
  const resolved = getComputedStyle(el).getPropertyValue(varName).trim();
  return resolved || match?.[2]?.trim() || value;
}
