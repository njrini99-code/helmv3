'use client';

/**
 * Standalone stats route chrome — ViewHeader only, no CoachHelm sub-nav.
 * Used for all Stats-cluster routes (player own-stats, coach team board,
 * coach per-player drill-down).
 */

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fairwayScope } from '@/lib/redesign/flag';
import { ViewHeader } from '@/components/fairway';
import { DURATION, EASE_CINEMATIC } from '@/lib/coachhelm/v3/motion';

export interface StatsPageShellProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function StatsPageShell({
  title,
  description,
  eyebrow = 'Stats',
  actions,
  children,
}: StatsPageShellProps) {
  const reduced = useReducedMotion();

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-6">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.medium, ease: EASE_CINEMATIC }}
        >
          <ViewHeader
            size="compact"
            eyebrow={eyebrow}
            title={title}
            description={description}
            secondaryActions={actions}
          />
        </motion.div>
        <div className="mt-6 flex flex-col gap-8">{children}</div>
      </div>
    </div>
  );
}
