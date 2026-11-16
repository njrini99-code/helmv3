// Its ring travels with it: a page that loads its own sheets (the sign-in's AuthFrame) draws it too, turn and all.
import '../styles/spinner.css';
import '../styles/motion.css';

/**
 * The one "working" ring. A Button draws it over its own label while `busy` (ui/Button.tsx); a place with no button to
 * hang it on (a sync note, a thread's work line, a full-height wait) draws it alone. One duration: the working beat
 * (`--ch-dur-typing`), so Animations off stills it (tokens.css); under Reduce Motion it stands still too (MOTION-AND-VISUAL
 * 3.9, 3.11: the working sign is static). Decorative: whatever is working says so in words beside it.
 */
export function Spinner({ size = 'md', tone = 'green', className }: { size?: 'sm' | 'md' | 'lg'; tone?: 'green' | 'current' | 'mint'; className?: string }) {
  return <span className={['ch-spinner', `ch-spinner--${size}`, `ch-spinner--${tone}`, className].filter(Boolean).join(' ')} aria-hidden="true" />;
}
