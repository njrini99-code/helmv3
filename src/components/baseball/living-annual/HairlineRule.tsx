'use client';

/**
 * HairlineRule — the signature draw-on rule, as a standalone atom.
 *
 * The `scaleX 0→1` baseline rule that ties every Living Annual page together
 * (spec §4.4 #2), extracted from the pattern baked into `<RuledStatLine>` so any
 * surface can hang a rule anywhere — a row separator, a section underline, a
 * KPI baseline. On mount it DRAWS from the left; pass `animate={false}` (or under
 * `prefers-reduced-motion`) and it renders already-drawn.
 *
 * Ink follows the two-ink law: `team` → GREEN (`--grade-plus`, the "more green"
 * presence the founder addendum asks for), `pursuit` → clay (`--pursuit-ink`),
 * `hairline` → the quiet warm `--hairline` (a neutral separator). Default is the
 * neutral hairline; opt into green/clay deliberately.
 *
 * Spans its container (`w-full`) unless a width is passed via `className`
 * (twMerge lets `w-16` win). Default `weight` ~1.5px lives in the `style` map
 * (never an arbitrary `h-[Npx]` className).
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { rulesDraw } from './motion';

export interface HairlineRuleProps {
  /** Rule ink: `team` green, `pursuit` clay, or the neutral warm `hairline`. */
  ink?: 'team' | 'pursuit' | 'hairline';
  /** Rule thickness in px (default 1.5). Set via `style`, not an arbitrary class. */
  weight?: number;
  /** Draw on mount (default true). `false` renders already-drawn. */
  animate?: boolean;
  className?: string;
}

// Full utility names so Tailwind's JIT keeps them; team is green, pursuit clay,
// hairline the quiet warm separator.
const RULE_BG: Record<NonNullable<HairlineRuleProps['ink']>, string> = {
  team: 'bg-grade-plus',
  pursuit: 'bg-pursuit',
  hairline: 'bg-[color:var(--hairline)]',
};

export function HairlineRule({ ink = 'hairline', weight = 1.5, animate = true, className }: HairlineRuleProps) {
  const reduced = useReducedMotion() ?? false;
  const still = !animate || reduced;
  const base = cn('w-full origin-left', RULE_BG[ink], className);

  if (still) {
    return <div aria-hidden className={base} style={{ height: weight }} />;
  }

  return (
    <m.div
      aria-hidden
      initial="hidden"
      animate="visible"
      variants={rulesDraw(false)}
      className={base}
      style={{ height: weight }}
    />
  );
}
