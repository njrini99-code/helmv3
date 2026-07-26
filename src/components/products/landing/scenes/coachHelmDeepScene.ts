'use client';

/**
 * ============================================================================
 * P5 · CoachHelm, deep — the evidence cascade
 * ----------------------------------------------------------------------------
 * The chapter that has to earn the word "intelligence". Its motion verb is
 * different from every other section on the site: nothing here APPEARS — things
 * are TESTED and ELIMINATED. A queue that resolves is a different gesture from
 * a list that fades up, and it depicts the product's actual job.
 *
 * Seven beats, in the order the real pipeline runs
 * (lib/coachhelm/v2: extraction → mining → causal testing → prediction →
 * composition → plan → delivery):
 *
 *   1. SYMPTOM   — "3.2 three-putts per round" arrives as masked words.
 *   2. CANDIDATES— every plausible explanation is put on the table at once.
 *   3. ELIMINATE — they are struck through one at a time, each with the test it
 *                  failed: no temporal precedence, no dose–response, confounded.
 *   4. SURVIVOR  — one cause is left standing and lights up.
 *   5. CAUSE     — only now does the "Caused by —" sentence resolve.
 *   6. EVIDENCE  — the supporting rows land with their real sample sizes.
 *   7. VERDICT   — confidence, Proven, strokes at stake.
 *
 * This ordering is not a stagger for rhythm's sake — it is the product's
 * gating rule made visible. CoachHelm will not surface a conclusion before its
 * confidence and lifecycle state clear, so the page does not either.
 *
 * REPLACES: the `.scan` sweep and `.pulse` dot, which were ambient "AI is
 * thinking" clip art unconnected to any data on screen.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER, DIST } from '@/lib/motion/gsap/tokens';
import { arrive, maskedWords } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const CHD = {
  card: '[data-ch-card]',
  symptom: '[data-ch-symptom]',
  ruledOut: '[data-cause="ruled-out"]',
  ruledLabel: '[data-cause-label]',
  survivor: '[data-cause="survivor"]',
  survivorMark: '[data-cause-marker]',
  cause: '[data-ch-cause]',
  evidenceRow: '[data-si]',
  verdict: '[data-ch-verdict]',
} as const;

export function coachHelmDeepScene({ root, reduced, compact }: SceneContext): void | (() => void) {
  const q = gsap.utils.selector(root);
  const symptom = q(CHD.symptom)[0] as HTMLElement | undefined;
  const ruledOut = q(CHD.ruledOut) as HTMLElement[];
  const ruledLabels = q(CHD.ruledLabel) as HTMLElement[];
  const survivorMark = q(CHD.survivorMark)[0] as HTMLElement | undefined;
  const cause = q(CHD.cause)[0] as HTMLElement | undefined;
  const evidence = q(CHD.evidenceRow) as HTMLElement[];
  const verdict = q(CHD.verdict)[0] as HTMLElement | undefined;

  // Nothing to drive — the card may not be mounted at this breakpoint.
  if (!ruledOut.length && !symptom) return;

  // ── Reduced motion: the finished analysis. Every candidate still reads as
  //    ruled out, the survivor still reads as the survivor — the INFORMATION
  //    is identical, only the sequencing goes. ───────────────────────────────
  if (reduced) {
    ruledLabels.forEach((l) => {
      l.style.textDecoration = 'line-through';
    });
    gsap.set([survivorMark, cause, verdict].filter(Boolean) as HTMLElement[], { autoAlpha: 1, y: 0 });
    gsap.set(evidence, { autoAlpha: 1, y: 0 });
    return;
  }

  // ── Prep ─────────────────────────────────────────────────────────────────
  let revertSymptom: (() => void) | undefined;
  let symptomWords: HTMLElement[] = [];
  if (symptom) {
    const split = maskedWords(symptom);
    revertSymptom = split.revert;
    symptomWords = split.lines;
  }

  // Candidates start present and undecided — they are on the table before any
  // of them is tested, which is the whole point.
  gsap.set(ruledOut, { opacity: 1 });
  // The survivor is a CANDIDATE like the other three, so it sits at full
  // opacity from the start — it is on the table, not absent. What arrives when
  // it survives is its verdict marker, not its legibility.
  if (survivorMark) gsap.set(survivorMark, { autoAlpha: 0 });
  // `autoAlpha`, the exact inverse of `arrive()`'s snap — never bare `opacity`,
  // which would leave these parked mid-ramp (caught at 0.03 and 0.34).
  if (cause) gsap.set(cause, { autoAlpha: 0, y: DIST.datum });
  gsap.set(evidence, { autoAlpha: 0, y: DIST.datum });
  if (verdict) gsap.set(verdict, { autoAlpha: 0, y: DIST.datum });

  // The trigger is the CARD, not the section root. The section is ~2,100px tall
  // and the card sits near its top, so scrubbing against the section meant the
  // last three beats — cause, receipts, verdict — resolved long after the card
  // had scrolled off screen. Probing computed opacity at five scroll depths
  // caught it: `verdict` never left 0. Anchoring to the card ties the cascade
  // to the element it is actually narrating.
  const card = q(CHD.card)[0] as HTMLElement | undefined;
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: card ?? root,
      start: compact ? 'top 88%' : 'top 80%',
      end: compact ? 'bottom 50%' : 'bottom 65%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  // 1. The symptom.
  if (symptomWords.length) {
    tl.to(symptomWords, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.wideStep }, 0);
  }

  // 2 + 3. Each candidate is struck through in turn. The strike is a scaleX on
  // a pseudo-rule rather than a CSS text-decoration tween (which cannot
  // animate), so it reads as a line being drawn ACROSS the claim.
  ruledOut.forEach((_row, i) => {
    const at = 0.3 + i * 0.14;
    const label = ruledLabels[i];
    if (label) {
      const rule = document.createElement('span');
      rule.setAttribute('aria-hidden', 'true');
      rule.style.cssText =
        'position:absolute;left:0;top:50%;height:1px;width:100%;background:currentColor;opacity:0.75;transform:scaleX(0);transform-origin:left center;';
      label.style.position = 'relative';
      label.appendChild(rule);
      tl.to(rule, { scaleX: 1, duration: DUR.short, ease: EASE.soft }, at);
    }
    // The row itself is NOT dimmed. A struck-through claim with the test it
    // failed printed beside it already says "eliminated" — unambiguously, and
    // to a screen reader too. Multiplying its opacity on top of that was the
    // same mistake the standings row made: it drove real text toward the card's
    // near-black background for no information gain. The elimination is the
    // rule being drawn, not the text becoming harder to read.
  });

  const eliminatedAt = 0.3 + ruledOut.length * 0.14;

  // 4. One cause left standing.
  if (survivorMark) arrive(tl, [survivorMark], eliminatedAt);

  // 5. Only now is the explanation legitimate.
  if (cause) arrive(tl, [cause], eliminatedAt + 0.16, { y: 0, duration: DUR.medium });

  // 6. The receipts.
  if (evidence.length) arrive(tl, evidence, eliminatedAt + 0.3, { y: 0, duration: DUR.short });

  // 7. The verdict, last.
  if (verdict) arrive(tl, [verdict], eliminatedAt + 0.46, { y: 0, duration: DUR.medium });

  // Tail padding. Without it the verdict lands on the timeline's final frame,
  // which means it only completes at the very last pixel of the trigger range —
  // the reader would have to stop exactly there to see the analysis finished.
  // A short empty tween lets the whole cascade resolve at ~85% of the range and
  // hold, settled, for the rest of the card's travel.
  tl.to({}, { duration: 0.3 });

  return revertSymptom;
}
