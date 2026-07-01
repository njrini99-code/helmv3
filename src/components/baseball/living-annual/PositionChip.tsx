/**
 * PositionChip — the small-caps position / role chip (spec §5, §6 #5).
 *
 * `SS` · `2B` · `RHP` · `UTIL` set as a small-caps outline pill. By default it
 * is a quiet hairline-outlined chip (`neutral`); the ink variants tint the
 * border + text green (`team`) or clay (`pursuit`) so a chip can carry lane
 * wayfinding when it needs to. No fill — structure comes from a hairline rule,
 * never a gray box (spec §4.2 rule 5).
 *
 * No hooks — safe in a server component.
 */
import { cn } from '@/lib/utils';

export interface PositionChipProps {
  /** The position / role, e.g. `SS`, `2B`, `RHP`. Rendered uppercase small-caps. */
  label: string;
  /** Ink tint: `neutral` hairline (default), `team` green, or `pursuit` clay. */
  ink?: 'team' | 'pursuit' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

// Named text tokens (no arbitrary text-[Npx]); microbadge = 9px, eyebrow = 11px.
const SIZE: Record<NonNullable<PositionChipProps['size']>, string> = {
  sm: 'px-1.5 py-px text-microbadge',
  md: 'px-2 py-0.5 text-eyebrow',
};

const INK: Record<NonNullable<PositionChipProps['ink']>, string> = {
  team: 'border-grade-plus text-grade-plus',
  pursuit: 'border-pursuit text-pursuit',
  neutral: 'border-[color:var(--hairline)] text-text-secondary',
};

export function PositionChip({ label, ink = 'neutral', size = 'md', className }: PositionChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium uppercase leading-none tracking-[0.1em]',
        SIZE[size],
        INK[ink],
        className,
      )}
    >
      {label}
    </span>
  );
}
