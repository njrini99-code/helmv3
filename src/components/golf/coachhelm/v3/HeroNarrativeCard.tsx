'use client';

/**
 * HeroNarrativeCard — W31. Renders the LLM-generated hero paragraph
 * above the existing HeroInsightCard on the player dashboard.
 *
 * Calls `generateHeroNarrative` on mount (one-shot, no streaming) and
 * shows the returned prose. Until it resolves, renders the fallback
 * text immediately so the surface never feels empty. On failure /
 * budget-gating the fallback stays put — the call log captures the
 * gating reason.
 */

import { useEffect, useState } from 'react';
import { generateHeroNarrative } from '@/app/golf/actions/v3/llm';

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
    <section
      data-testid="hero-narrative-card"
      data-used-llm={usedLlm ? 'true' : 'false'}
      className="surface-stone rounded-3xl p-6 md:p-7 mb-5 md:mb-6"
    >
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-warm-500">
          Today
        </p>
        {usedLlm && (
          <span className="text-[10px] uppercase tracking-[0.1em] text-warm-400">
            AI summary
          </span>
        )}
      </div>
      <p
        className={`text-[17px] md:text-[18px] leading-relaxed text-warm-900 ${
          loading ? 'opacity-80' : ''
        }`}
      >
        {text}
      </p>
    </section>
  );
}
