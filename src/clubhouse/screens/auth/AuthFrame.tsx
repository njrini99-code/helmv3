'use client';

import { LazyMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { loadFeatures } from '@/lib/motion/load-features';
import { clubhouseFontVariables } from '../../lib/fonts';
import { useChPress } from '../../lib/press';
import { useChReducedMotion } from '../../lib/reduced-motion';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/ui.css';
import '../../styles/auth-tokens.css';
import '../../styles/auth.css';

export type AuthPhase = 'login' | 'opening' | 'welcome' | 'leaving';

/**
 * The root of every auth screen: the green frame, Clubhouse's tokens and fonts
 * (these screens sit outside the dashboard frame, so nothing else has mounted
 * them), the press on every tappable, and the animation features, loaded after
 * first paint. `data-motion="off"` follows reduced motion and Settings >
 * Preferences > Animations, the same switch the rest of Clubhouse reads.
 */
export function AuthFrame({ screen, phase, children }: { screen: 'signin' | 'welcome' | 'signup'; phase: AuthPhase; children: ReactNode }) {
  const reduced = useChReducedMotion();
  useChPress(!reduced);
  return (
    <LazyMotion features={loadFeatures} strict>
      <div className={`ch-root ch-au ch-au--${screen} ${clubhouseFontVariables}`} data-ui="clubhouse" data-motion={reduced ? 'off' : undefined} data-phase={phase}>
        {children}
      </div>
    </LazyMotion>
  );
}
