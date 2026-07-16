'use client';

import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import type { ReactNode } from 'react';

/**
 * Motion provider for the `(public)` baseball route group — `team/[id]`,
 * `player/[id]`, `program/[id]`, `packet/[token]` — public recruiting pages
 * visited by signed-out browsers (coaches sharing a link, families checking a
 * player profile) with no app shell of their own to supply one.
 *
 * `team/[id]` and `player/[id]` (via `PlayerProfileClient`) render Living
 * Annual `m`-based atoms directly — `Masthead`, `RuledStatLine`,
 * `HairlineRule` (default `animate=true`) — whose entrance variant
 * (`inkSettles`/`rulesDraw` in `living-annual/motion.ts`) starts at `hidden`
 * (`opacity: 0` for text, `scaleX: 0` for rules) and only transitions to
 * `visible` once framer-motion's animation feature bundle is loaded. An
 * `m.*` component never mounts that feature — and therefore never leaves
 * `hidden` — without a `LazyMotion` ancestor (see `motion-dom`'s
 * `VisualElement.updateFeatures`, and the identical note on
 * `AdminMotionProvider` / `(dashboard)/dashboard/template.tsx`). Before this
 * wrapper, the `(public)` layout was `<>{children}</>` with nothing upstream
 * providing one, so any visitor without `prefers-reduced-motion` on saw
 * invisible player/team names and stat numerals on these live public pages.
 *
 * `strict`: verified no descendant in this route's component tree renders a
 * full `motion.*` component (only `m.*`), so `strict` is safe here and turns
 * a future accidental `motion` import into a loud dev-time error instead of
 * a silent tree-shaking regression.
 *
 * Kept as its own file (not merged into `layout.tsx`) so the layout stays a
 * Server Component — `LazyMotion` requires a client boundary.
 */
export function PublicMotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
