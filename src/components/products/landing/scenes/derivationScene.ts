'use client';

/**
 * ============================================================================
 * P4 · One round → 85 stats, DERIVED
 * ----------------------------------------------------------------------------
 * The number 85 is the page's biggest single claim, and until now it was
 * asserted: a large numeral, then two infinite marquees of stat names sliding
 * in opposite directions forever. Those marquees were the clearest anti-pattern
 * on either page — permanent motion, unconnected to any data, that never
 * resolves and never means anything. They also actively undermined the claim,
 * because a loop of names is not a count of anything.
 *
 * So this section now shows the arithmetic instead:
 *
 *   1. THE ROUND     — eighteen hole ticks land, left to right. One round.
 *   2. THE SHOTS     — the shot count resolves. This is the raw input, and the
 *                      only thing the player actually did.
 *   3. THE FAMILIES  — those shots fan out into six stat families. Each family
 *                      reveals its own members and its own count.
 *   4. THE TOTAL     — and here is the point: the headline number is the RUNNING
 *                      SUM. It steps 5 → 17 → 38 → 53 → 71 → 85 as each family
 *                      lands, so the reader watches 85 being arrived at rather
 *                      than being told it.
 *
 * A number that assembles itself in front of you is a different claim from a
 * number that is simply large.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER, DIST } from '@/lib/motion/gsap/tokens';
import { arrive, countTo } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const DERIVE = {
  hole: '[data-dv="hole"]',
  shots: '[data-dv="shots"]',
  family: '[data-dv="family"]',
  familyRule: '[data-dv="rule"]',
  familyCount: '[data-dv="count"]',
  pill: '[data-dv="pill"]',
  total: '[data-dv="total"]',
} as const;

export function derivationScene({ root, reduced, compact }: SceneContext): void {
  const q = gsap.utils.selector(root);
  const holes = q(DERIVE.hole) as HTMLElement[];
  const shots = q(DERIVE.shots)[0] as HTMLElement | undefined;
  const families = q(DERIVE.family) as HTMLElement[];
  const total = q(DERIVE.total)[0] as HTMLElement | undefined;
  if (!families.length) return;

  /** Each family's own tally, read off the DOM so the copy stays the source. */
  const counts = families.map((f) => Number(f.dataset.dvTotal ?? 0));
  const grand = counts.reduce((a, b) => a + b, 0);

  // ── Reduced motion: the finished arithmetic. Every family, every count and
  //    the total are present — only the accumulation goes. ───────────────────
  if (reduced) {
    gsap.set(holes, { opacity: 1, scaleY: 1 });
    gsap.set(q(DERIVE.pill) as HTMLElement[], { opacity: 1, y: 0 });
    gsap.set(q(DERIVE.familyRule) as HTMLElement[], { scaleX: 1 });
    families.forEach((f, i) => {
      const c = f.querySelector<HTMLElement>(DERIVE.familyCount);
      if (c) c.textContent = String(counts[i] ?? 0);
    });
    if (shots) shots.textContent = '72';
    if (total) total.textContent = String(grand);
    return;
  }

  gsap.set(holes, { opacity: 0, scaleY: 0.2, transformOrigin: 'bottom center' });
  families.forEach((f) => {
    const rule = f.querySelector<HTMLElement>(DERIVE.familyRule);
    if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' });
    gsap.set(f.querySelectorAll(DERIVE.pill), { opacity: 0, y: DIST.datum });
    const c = f.querySelector<HTMLElement>(DERIVE.familyCount);
    if (c) c.textContent = '—';
  });
  if (shots) shots.textContent = '—';
  if (total) total.textContent = '—';

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: compact ? 'top 78%' : 'top 68%',
      end: compact ? 'bottom 55%' : 'bottom 70%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  // 1. The round. Eighteen ticks — a scale, not decoration: this is the unit of
  //    input the whole section is about.
  tl.to(holes, { opacity: 1, scaleY: 1, duration: DUR.short, ease: EASE.glide, stagger: STAGGER.wideStep }, 0);

  // 2. The shots that round produced.
  if (shots) tl.add(countTo(shots, 72, { duration: DUR.long }), 0.3);

  // 3 + 4. Each family resolves, and the total accumulates with it. The two are
  //        deliberately on the same beat: the headline is the running sum, so it
  //        must move WHEN a family lands, not on a rhythm of its own.
  let running = 0;
  families.forEach((family, i) => {
    const at = 0.72 + i * 0.26;
    const rule = family.querySelector<HTMLElement>(DERIVE.familyRule);
    const countEl = family.querySelector<HTMLElement>(DERIVE.familyCount);
    const pills = family.querySelectorAll(DERIVE.pill);
    const n = counts[i] ?? 0;

    if (rule) tl.to(rule, { scaleX: 1, duration: DUR.short, ease: EASE.soft }, at);
    if (pills.length) {
      // Snap + translate, never an opacity ramp: these pills carry the metric
      // NAMES ("SG: Total", "Approach 100-150"), and on a scrubbed timeline a
      // fade is a resting state — caught parked at 0.13 and 0.04.
      arrive(tl, [...pills] as HTMLElement[], at + 0.05, { y: 0, duration: DUR.short });
    }
    if (countEl) tl.add(countTo(countEl, n, { duration: DUR.medium }), at + 0.06);

    if (total) {
      const from = running;
      running += n;
      const to = running;
      // The total steps from one running subtotal to the next rather than
      // counting from zero each time — the arithmetic has to be followable.
      const proxy = { v: from };
      tl.to(
        proxy,
        {
          v: to,
          duration: DUR.medium,
          ease: EASE.glide,
          snap: { v: 1 },
          onUpdate: () => {
            total.textContent = proxy.v > 0 ? String(Math.round(proxy.v)) : '—';
          },
        },
        at + 0.08,
      );
    }
  });

  tl.to({}, { duration: 0.35 });
}
