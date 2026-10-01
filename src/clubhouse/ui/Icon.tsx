import type { LucideIcon } from 'lucide-react';

/** Lucide at the Clubhouse stroke (1.6), outline only, decorative by default. */
export function Icon({ icon: Glyph, size = 16, className }: { icon: LucideIcon; size?: number; className?: string }) {
  return <Glyph size={size} strokeWidth={1.6} aria-hidden="true" focusable="false" className={className} />;
}
