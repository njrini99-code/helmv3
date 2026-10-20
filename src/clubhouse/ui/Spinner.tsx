/**
 * The one "working" ring. A Button draws it over its own label while `busy` (ui/Button.tsx); a place with no button to
 * hang it on (a sync note, a thread's work line, a full-height wait) draws it alone. One duration: the sweep token, so
 * Animations off and reduced motion still it (tokens.css). Decorative: whatever is working says so in words beside it.
 */
export function Spinner({ size = 'md', tone = 'green', className }: { size?: 'sm' | 'md' | 'lg'; tone?: 'green' | 'current' | 'mint'; className?: string }) {
  return <span className={['ch-spinner', `ch-spinner--${size}`, `ch-spinner--${tone}`, className].filter(Boolean).join(' ')} aria-hidden="true" />;
}
