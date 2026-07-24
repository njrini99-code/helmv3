'use client';

import { useRef } from 'react';
import styles from './products-landing.module.css';
import { useProductsEffects } from './useProductsEffects';
import { Hero } from './sections/Hero';
import { ProductsIntro } from './sections/ProductsIntro';
import { TeamManagement } from './sections/TeamManagement';
import { LiveRound } from './sections/LiveRound';
import { StatsTicker } from './sections/StatsTicker';
import { CoachHelm } from './sections/CoachHelm';
import { FinalCta } from './sections/FinalCta';

/**
 * Products landing — the scroll-driven marketing surface. Owns the single root
 * ref the effects hook queries for `[data-reveal]` / `[data-fx]` targets across
 * every section, so sections stay pure/presentational.
 */
export function ProductsLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  useProductsEffects(rootRef);

  return (
    <div ref={rootRef} className={styles.root}>
      <Hero />
      <ProductsIntro />
      <TeamManagement />
      <LiveRound />
      <StatsTicker />
      <CoachHelm />
      <FinalCta />
    </div>
  );
}
