'use client';

/**
 * PlayerGameFingerprint — the integrated 7-section UI for the coach
 * scouting-report view.
 *
 * Renders vertically, one band per category, in a stable order mirrored by
 * FINGERPRINT_SECTION_ORDER in the aggregator. Each band gets:
 *   - A small left-side chart (or metric rail for chart-less sections).
 *   - A right-side stack of evidence-backed InsightCards:
 *       - Top-1 in `density='default'` (prominent).
 *       - 2nd+ in `density='compact'` (list rows).
 *
 * Fraunces font is applied ONLY to:
 *   - The section heading.
 *   - The composite rating numeral.
 *
 * Empty sections render "Not enough data" in-slot so the layout doesn't
 * shift when a player is early-season.
 */

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { FINGERPRINT_SECTION_ORDER } from '@/app/golf/actions/player-fingerprint-types';
import {
  acknowledgeInsight,
  dismissInsight,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { useGolfUser } from '@/contexts/golf-user-context';

import { FingerprintHero } from './sections/FingerprintHero';
import { TeeSection } from './sections/TeeSection';
import { ApproachSection } from './sections/ApproachSection';
import { ShortGameSection } from './sections/ShortGameSection';
import { PuttingSection } from './sections/PuttingSection';
import { ScoringSection } from './sections/ScoringSection';
import { PressureSection } from './sections/PressureSection';
import { TrendSection } from './sections/TrendSection';

// ---------------------------------------------------------------------------
// Section registry
// ---------------------------------------------------------------------------

/**
 * Map section keys → section components. The aggregator emits sections in
 * `FINGERPRINT_SECTION_ORDER`; we render in the same order so coach muscle-
 * memory lines up across players.
 */
const SECTION_COMPONENTS = {
  tee: TeeSection,
  approach: ApproachSection,
  short_game: ShortGameSection,
  putting: PuttingSection,
  scoring: ScoringSection,
  pressure: PressureSection,
} as const;

export interface PlayerGameFingerprintProps {
  fingerprint: PlayerFingerprint;
}

export function PlayerGameFingerprint({ fingerprint }: PlayerGameFingerprintProps) {
  const router = useRouter();
  const golfUser = useGolfUser();
  const coachId = golfUser.coachId ?? null;
  const [, startActionTransition] = useTransition();

  // Mirror insight lists per section into local state so actions (ack /
  // dismiss / focus area) can update the UI optimistically.
  const [sections, setSections] = useState(() => fingerprint.sections);

  const handleAction = useCallback(
    (action: InsightAction, insightId: string) => {
      const prev = sections;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setSections((current) => mapInsights(current, insightId, (i) => ({
              ...i,
              acknowledged_at: new Date().toISOString(),
              status: 'acknowledged' as const,
            })));
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setSections(prev);
          } else if (action === 'dismissed') {
            setSections((current) => removeInsight(current, insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setSections(prev);
          } else if (action === 'create_focus_area') {
            if (!coachId) return;
            const target = findInsight(sections, insightId);
            if (!target) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) router.push('/golf/dashboard/development');
          }
        } catch {
          setSections(prev);
        }
      });
    },
    [coachId, router, sections],
  );

  const orderedSections = useMemo(
    () => FINGERPRINT_SECTION_ORDER.map((key) => sections[key]),
    [sections],
  );

  return (
    <div
      className="min-h-full bg-transparent"
      data-testid="player-game-fingerprint"
    >
      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <FingerprintHero
          player={fingerprint.player}
          composite={fingerprint.composite}
        />

        {orderedSections.map((section) => {
          const Component = SECTION_COMPONENTS[section.key];
          return (
            <Component
              key={section.key}
              section={section}
              onAction={handleAction}
            />
          );
        })}

        <TrendSection trend={fingerprint.trend} />

        <p className="text-eyebrow text-warm-400 text-center pt-2">
          Generated {new Date(fingerprint.generated_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Immutable section-state helpers
// ---------------------------------------------------------------------------

function mapInsights(
  sections: PlayerFingerprint['sections'],
  insightId: string,
  transform: (
    insight: PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
  ) => PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number],
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    const idx = section.insights.findIndex((i) => i.id === insightId);
    if (idx >= 0) {
      const nextInsights = [...section.insights];
      nextInsights[idx] = transform(nextInsights[idx]!);
      next[key] = { ...section, insights: nextInsights };
    }
  }
  return next;
}

function removeInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'] {
  const next = { ...sections };
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const section = next[key];
    if (section.insights.some((i) => i.id === insightId)) {
      next[key] = {
        ...section,
        insights: section.insights.filter((i) => i.id !== insightId),
      };
    }
  }
  return next;
}

function findInsight(
  sections: PlayerFingerprint['sections'],
  insightId: string,
): PlayerFingerprint['sections'][keyof PlayerFingerprint['sections']]['insights'][number] | null {
  for (const key of FINGERPRINT_SECTION_ORDER) {
    const match = sections[key].insights.find((i) => i.id === insightId);
    if (match) return match;
  }
  return null;
}
