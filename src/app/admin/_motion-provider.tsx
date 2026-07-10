'use client';

import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import type { ReactNode } from 'react';

/**
 * LazyMotion(domAnimation) at the /admin route root. Without it every
 * `<m.*>` renders as static DOM and animated numbers freeze at 0 — this
 * bit the golf-admin Tracer KPI tiles before (see golf/admin/layout.tsx).
 */
export function AdminMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
