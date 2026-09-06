'use client';

import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import type { ReactNode } from 'react';

/**
 * LazyMotion(domAnimation) at an admin route root. Without it every `<m.*>`
 * renders as static DOM and animated numbers freeze at 0 — this bit the
 * golf-admin Tracer KPI tiles before (see golf/admin/layout.tsx). Every admin
 * component that imports `m` from 'framer-motion' requires a LazyMotion
 * ancestor.
 *
 * Scoped to the admin subtree (mounted from each admin route's own
 * layout/template) so other routes that don't use motion don't pay the
 * ~15KB gz feature-bundle cost.
 *
 * Shared between `/admin` and `/golf/admin` — this used to be two
 * byte-identical copies under src/app (`src/app/admin/_motion-provider.tsx`
 * and `src/app/golf/admin/_motion-provider.tsx`, differing only in their
 * docblocks), which both files now re-export from here.
 */
export function AdminMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
