import type { LucideIcon } from 'lucide-react';

/**
 * A line's weight at a size (B12): 1.5px up to 17, 1.75px to 22, 2px above. Absolute, so a 12px icon is not a hairline
 * beside 600-weight text and a 22px one is not heavy.
 */
export function iconStroke(size: number): number {
  return size <= 17 ? 1.5 : size <= 22 ? 1.75 : 2;
}

/** Lucide at the Clubhouse stroke (an absolute weight from `iconStroke`), outline only, decorative by default. */
export function Icon({ icon: Glyph, size = 16, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return <Glyph size={size} strokeWidth={iconStroke(size)} absoluteStrokeWidth aria-hidden="true" focusable="false" className={className} />;
}
