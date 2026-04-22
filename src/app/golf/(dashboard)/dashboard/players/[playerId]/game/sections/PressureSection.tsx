'use client';

/**
 * PressureSection — "Pressure". Practice vs tournament scoring gap.
 *
 * No chart; the three MetricPills (practice avg · tournament avg · pressure
 * gap) are the story. The gap pill's tone is the single most important
 * signal on this band — a coach scans it to decide whether tournament-day
 * prep needs mental-game work.
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { SectionBand } from './FingerprintHero';

export interface PressureSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function PressureSection({ section, onAction }: PressureSectionProps) {
  return (
    <SectionBand
      section={section}
      overline="06 · Pressure"
      onAction={onAction}
    />
  );
}
