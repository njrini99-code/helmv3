'use client';

/**
 * HeroNarrativeCard — W31 + premium polish.
 *
 * Calls `generateHeroNarrative` on mount and renders the returned
 * prose. Premium touches:
 *   - Framer-motion fade-in entrance with editorial easing curve
 *   - Soft shimmer overlay during the LLM round-trip
 *   - Crossfade when the LLM prose swaps in
 *   - ✨ glyph + "AI summary" badge when used_llm=true
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { generateHeroNarrative } from '@/app/golf/actions/v3/llm';
import {
  heroVariants,
  heroTransition,
  badgeVariants,
  badgeTransition,
  crossfadeVariants,
  crossfadeTransition,
} from '@/lib/coachhelm/v3/motion';

export interface HeroNarrativeCardProps {
  playerId: string;
  metricLabel: string;
  yourValueDisplay: string;
  teamPct: number | null;
  goalTargetDisplay?: string;
  counterfactualStrokesPerRound?: number;
  /** Text shown immediately on mount and retained if the LLM call falls
   *  back. Should be a sentence or two derived from the deterministic
   *  insight payload — never empty. */
  fallbackText: string;
}

export function HeroNarrativeCard(props: HeroNarrativeCardProps) {
  const [text, setText] = useState(props.fallbackText);
  const [usedLlm, setUsedLlm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await generateHeroNarrative({
        player_id: props.playerId,
        metric_label: props.metricLabel,
        your_value_display: props.yourValueDisplay,
        team_pct: props.teamPct,
        goal_target_display: props.goalTargetDisplay,
        counterfactual_strokes_per_round: props.counterfactualStrokesPerRound,
        fallback_text: props.fallbackText,
      });
      if (cancelled) return;
      if (r.ok && r.text) {
        setText(r.text);
        setUsedLlm(!!r.used_llm);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    props.playerId,
    props.metricLabel,
    props.yourValueDisplay,
    props.teamPct,
    props.goalTargetDisplay,
    props.counterfactualStrokesPerRound,
    props.fallbackText,
  ]);

  return (
    <m.section
      data-testid="hero-narrative-card"
      data-used-llm={usedLlm ? 'true' : 'false'}
      variants={heroVariants}
      initial="hidden"
      animate="visible"
      transition={heroTransition}
      className="surface-stone rounded-3xl p-6 md:p-7 mb-5 md:mb-6 relative overflow-hidden"
    >
      {loading && (
        <m.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0"
        >
          <m.div
            className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ['0%', '400%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </m.div>
      )}

      <div className="relative">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p className="text-eyebrow font-medium uppercase tracking-[0.14em] text-warm-500">
            Today
          </p>
          <AnimatePresence>
            {usedLlm && (
              <m.span
                key="ai-badge"
                variants={badgeVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={badgeTransition}
                className="inline-flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.14em] text-warm-500"
              >
                <span aria-hidden className="text-caption leading-none">✦</span>
                AI summary
              </m.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <m.p
            key={text}
            variants={crossfadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={crossfadeTransition}
            className="text-body-lg md:text-h3 leading-relaxed text-warm-900"
          >
            {text}
          </m.p>
        </AnimatePresence>
      </div>
    </m.section>
  );
}
