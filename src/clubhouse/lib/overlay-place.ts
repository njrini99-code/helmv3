/**
 * The one placement every Clubhouse overlay uses (design lab, the overlay base; the research report's collision rules checked
 * against the code: Menu, ContextMenu, Tooltip and usePopoverFit each did this by hand, four ways). Pure, so it is tested
 * without a browser:
 *
 * - it opens on the anchor's preferred side (below) and flips above only when the panel does not fit below and there is more
 *   room above (collision, not preference);
 * - it shifts along the edge to stay `edge` px inside the window, and never runs under the keyboard (`overlayView`);
 * - it caps its height at the room on the side it chose, so a long list scrolls inside the panel instead of off the screen;
 * - it says which corner it grows from, so a pop scales out of its anchor (B16).
 *
 * Callers place again on a window or visual-viewport resize, a rotation and the keyboard (BS-21): `watchOverlayView`.
 */
export type OverlayRect = { top: number; bottom: number; left: number; right: number };
export type OverlayView = { width: number; bottom: number };
export type OverlayPlace = { left: number; top: number; maxHeight: number; up: boolean; origin: string };

export function placeOverlay(
  anchor: OverlayRect,
  size: { width: number; height: number },
  view: OverlayView,
  { align = 'start', gap = 6, edge = 8 }: { align?: 'start' | 'end' | 'center'; gap?: number; edge?: number } = {},
): OverlayPlace {
  const above = Math.max(0, Math.min(anchor.top, view.bottom - edge) - gap - edge);
  const below = Math.max(0, view.bottom - Math.max(edge, anchor.bottom) - gap - edge);
  const up = size.height > below && above > below;
  const maxHeight = up ? above : below;
  const h = Math.min(size.height, maxHeight);
  const top = Math.max(edge, Math.min(up ? anchor.top - h - gap : anchor.bottom + gap, view.bottom - edge - h));
  const want = align === 'end' ? anchor.right - size.width : align === 'center' ? (anchor.left + anchor.right) / 2 - size.width / 2 : anchor.left;
  const left = Math.max(edge, Math.min(want, view.width - size.width - edge));
  const x = align === 'end' ? 'right' : align === 'center' ? 'center' : 'left';
  return { left, top, maxHeight, up, origin: `${up ? 'bottom' : 'top'} ${x}` };
}

/** The window an overlay may use now: its width, and its bottom above the keyboard and the visual viewport's foot. */
export function overlayView(): OverlayView {
  const keyboard =
    typeof document !== 'undefined' && document.body.classList.contains('keyboard-open')
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0
      : 0;
  const viewport = window.visualViewport;
  return { width: window.innerWidth, bottom: Math.min(window.innerHeight - keyboard, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) };
}

/** Calls `place` whenever the room an overlay has changes: a resize, a rotation, the visual viewport (zoom, toolbar) or the keyboard. */
export function watchOverlayView(place: () => void): () => void {
  const keyboard = new MutationObserver(place);
  keyboard.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  keyboard.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', place);
  window.addEventListener('orientationchange', place);
  window.visualViewport?.addEventListener('resize', place);
  return () => {
    keyboard.disconnect();
    window.removeEventListener('resize', place);
    window.removeEventListener('orientationchange', place);
    window.visualViewport?.removeEventListener('resize', place);
  };
}
