'use client';

import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import type { ReactNode } from 'react';

/**
 * Wraps the admin tree in Framer Motion's LazyMotion (domAnimation feature set).
 * Every admin component that imports `m` from 'framer-motion' requires a
 * LazyMotion ancestor; without it the animations silently no-op and <m.*>
 * renders as static DOM.
 *
 * Scoped to the admin subtree so other routes that don't use motion don't pay
 * the ~15KB gz feature-bundle cost.
 */
export function AdminMotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
