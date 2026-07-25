'use client';

/**
 * HeroNarrativeCard — W31 + premium polish.
 *
 * Calls `generateHeroNarrative` on mount and renders the returned
 * prose. Premium touches:
 *   - Framer-motion fade-in entrance with editorial easing curve
 *   - Soft shimmer overlay during the LLM round-trip
 *   - Crossfade when the LLM prose swaps in
 *   - ✨ glyph + "CoachHelm" badge when used_llm=true
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { Card } from '@/components/ui/card';
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
  /** Render light-on-dark for a dark "spotlight" hero band: drops the light
   *  Card chrome and switches the prose + eyebrow to luminous text so it reads
   *  on a near-black surface. Default `false` (the existing light treatment —
   *  used unchanged by the 3 legacy callers). */
  inverted?: boolean;
}

export function HeroNarrativeCard(props: HeroNarrativeCardProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const inverted = props.inverted ?? false;
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
      // Grounding gate (P0-03): ONLY swap in the LLM prose when the model
      // went through the LLM path AND every numeric claim it made was
      // verified against the supplied evidence. Anything else
      // (ok=false, budget gate, LLM error, or discarded unverified text)
      // keeps the deterministic fallback visible. Unsupported claims must
      // never render as fact.
      const verified = r.ok && !!r.used_llm && !!r.citations_verified;
      if (verified && r.text) {
        setText(r.text);
        setUsedLlm(true);
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

  const inner = (
    <>
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
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 1.6, repeat: Infinity, ease: 'easeInOut' })}
          />
        </m.div>
      )}

      <div className="relative">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p
            className={`text-eyebrow font-medium uppercase tracking-[0.14em] ${
              inverted ? 'text-accent-300' : 'text-warm-500'
            }`}
          >
            Today&apos;s read
          </p>
          <AnimatePresence>
            {usedLlm && (
              <m.span
                key="ai-badge"
                variants={badgeVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={prefersReducedMotion ? { duration: 0 } : (badgeTransition)}
                className={`inline-flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.14em] ${
                  inverted ? 'text-white/65' : 'text-warm-500'
                }`}
              >
                <span aria-hidden className="text-caption leading-none">✦</span>
                CoachHelm
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
            transition={prefersReducedMotion ? { duration: 0 } : (crossfadeTransition)}
            className={`text-body-lg md:text-h3 leading-relaxed ${
              inverted ? 'text-white/92' : 'text-warm-900'
            }`}
          >
            {text}
          </m.p>
        </AnimatePresence>
      </div>
    </>
  );

  return (
    // Light treatment: the matte surface/corners/padding come from the canonical
    // <Card variant="raised">. Inverted treatment (dark spotlight hero): drop the
    // light card chrome so the luminous prose sits directly on the dark band.
    <m.section
      data-testid="hero-narrative-card"
      data-used-llm={usedLlm ? 'true' : 'false'}
      variants={heroVariants}
      initial="hidden"
      animate="visible"
      transition={prefersReducedMotion ? { duration: 0 } : (heroTransition)}
      className={inverted ? '' : 'mb-5 md:mb-6'}
    >
      {inverted ? (
        <div className="relative overflow-hidden">{inner}</div>
      ) : (
        <Card variant="raised" hover={false} className="overflow-hidden">
          {inner}
        </Card>
      )}
    </m.section>
  );
}
