'use client';

/**
 * RoundReviewLlmCard — W30 surface integration (deferred follow-up to
 * the W30 ledger note: "composer is callable; rendering on the existing
 * round-review page is a follow-up").
 *
 * Mirrors HeroNarrativeCard exactly:
 *   - Renders `fallbackText` on mount so the surface is never empty.
 *   - Fires `generateLlmRoundReview(roundId, fallbackText)` once on mount.
 *   - Swaps in the LLM prose ONLY when used_llm && citations_verified;
 *     on failure (ok=false), budget-gate fallback (used_llm=false), or
 *     unverified/discarded citations (citations_verified=false), keeps
 *     the deterministic fallback verbatim. Unsupported claims never
 *     render as fact (P0-03).
 *   - Never renders error / empty UI — failure-silent like the hero
 *     narrative card. The W30 budget gate is currently set to 0 today
 *     so this card MUST render the fallback gracefully.
 *
 * Master plan reference: Part XI (LLM Layer — 3 surfaces). round_review
 * uses Haiku, max 3 sentences, grounded in EvidenceClaim citations.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { generateLlmRoundReview } from '@/app/golf/actions/v3/llm';
import {
  heroVariants,
  heroTransition,
  badgeVariants,
  badgeTransition,
  crossfadeVariants,
  crossfadeTransition,
} from '@/lib/coachhelm/v3/motion';

export interface RoundReviewLlmCardProps {
  /** Round whose prose the LLM composes. Passed through to the server
   *  action which resolves player + billing-coach internally. */
  roundId: string;
  /** Deterministic 1–2 sentence summary shown immediately on mount and
   *  retained verbatim if the LLM call falls back (budget gate, error,
   *  citation-verifier failure). Should never be empty. */
  fallbackText: string;
}

export function RoundReviewLlmCard(props: RoundReviewLlmCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [text, setText] = useState(props.fallbackText);
  const [usedLlm, setUsedLlm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await generateLlmRoundReview(props.roundId, props.fallbackText);
        if (cancelled) return;
        // Failure-silent + grounding gate (P0-03): ONLY swap in the LLM
        // prose when the model went through the LLM path AND every
        // numeric claim it made was verified against the supplied
        // evidence. ok=false (auth/round-not-found), used_llm=false
        // (budget gate / error / discarded-unverified-text), or
        // citations_verified=false all leave the deterministic fallback
        // visible. Unsupported claims must never render as fact.
        const verified = r.ok && !!r.used_llm && !!r.citations_verified;
        if (verified && typeof r.text === 'string' && r.text.length > 0) {
          setText(r.text);
          setUsedLlm(true);
        }
      } catch {
        // Failure-silent. Server action already routed errors through
        // logServerError; we never surface them to the player.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.roundId, props.fallbackText]);

  return (
    <m.section
      data-testid="round-review-llm-card"
      data-used-llm={usedLlm ? 'true' : 'false'}
      variants={heroVariants}
      initial="hidden"
      animate="visible"
      transition={prefersReducedMotion ? { duration: 0 } : (heroTransition)}
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
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 1.6, repeat: Infinity, ease: 'easeInOut' })}
          />
        </m.div>
      )}

      <div className="relative">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p className="text-eyebrow font-medium uppercase tracking-[0.14em] text-warm-500">
            Round review
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
                className="inline-flex items-center gap-1.5 text-eyebrow uppercase tracking-[0.14em] text-warm-500"
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
            className="text-body-lg md:text-h3 leading-relaxed text-warm-900"
          >
            {text}
          </m.p>
        </AnimatePresence>
      </div>
    </m.section>
  );
}
