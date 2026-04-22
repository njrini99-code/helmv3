'use client';

/**
 * ShortGameSection — "Around the green". Up-and-down · scrambling · sand
 * saves · SG:ARG.
 *
 * No dedicated chart — the MetricPill rail tells the full story for this
 * section. Save-percentages are already their own tidy summary; adding a
 * chart here would just be ink.
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { SectionBand } from './FingerprintHero';

export interface ShortGameSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function ShortGameSection({ section, onAction }: ShortGameSectionProps) {
  return (
    <SectionBand
      section={section}
      overline="03 · Around the green"
      onAction={onAction}
    />
  );
}
