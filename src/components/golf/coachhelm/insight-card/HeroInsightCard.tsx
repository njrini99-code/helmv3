'use client';

/**
 * HeroInsightCard — thin wrapper that renders `<InsightCard density='hero'>`
 * with a staggered mount animation.
 *
 * Rule 10 of the design contract: one-shot reveal, 60ms stagger across
 * title → metric → content → drills. No bouncy springs, no scroll-jacking.
 *
 * Downstream surfaces (Hub, CoachHelm Dashboard, Round Review) compose this
 * wrapper at the top of their layouts.
 */
import type { CSSProperties } from 'react';
import { m } from 'framer-motion';
import { InsightCard, type InsightCardProps } from './InsightCard';

export interface HeroInsightCardProps extends Omit<InsightCardProps, 'density'> {
  /** Gate the stagger animation (disable for tests / reduced motion). */
  mountAnimation?: boolean;
}

/** Internal stagger tokens — exposed as CSS custom properties so downstream
 *  surfaces can hook inner-element transitions if they need to. */
const STAGGER_STEPS: Array<{ selector: string; delay: number }> = [
  { selector: 'hero-title', delay: 0 },
  { selector: 'hero-strokes-impact', delay: 0.06 },
  { selector: 'hero-content', delay: 0.12 },
  { selector: 'drill-chips', delay: 0.18 },
];

export function HeroInsightCard({
  mountAnimation = true,
  ...rest
}: HeroInsightCardProps) {
  if (!mountAnimation) {
    return <InsightCard {...rest} density="hero" />;
  }

  const staggerStyle = Object.fromEntries(
    STAGGER_STEPS.map((step) => [`--stagger-${step.selector}`, `${step.delay}s`]),
  ) as CSSProperties;

  return (
    <m.div
      data-testid="hero-insight-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={staggerStyle}
    >
      <InsightCard {...rest} density="hero" />
    </m.div>
  );
}
