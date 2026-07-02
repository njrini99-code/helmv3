'use client';

/**
 * M3 · PRODUCT CINEMA — THE scroll set piece. docs/LANDING_ENTRY_WORLD_DESIGN.md
 * M3 ("the 'they put SO much effort in' moment"). Background register: deep
 * pine band. A `PinnedScrub` (~250vh) holds a G2 glass desktop frame center
 * stage while three REAL Living-Annual screens glide through it under 1:1
 * scroll control — Command Center → Stats Center → Decision Room — each
 * with a scrub-linked caption ledger line that writes itself in below. A
 * phone frame carrying Lift Lab arcs in from the right at ~55% of the scrub
 * and stays for the remainder.
 *
 * Screens are real product screenshots (see "Screenshot asset contract" in
 * CONTRACTS.md) — `public/marketing/first-light/screens/*.png`, sourced
 * this lane from the overnight BaseballHelm visual-verification fleet
 * (Command Center / Stats Center (a real box score) / Decision Room / Lift
 * Lab), cropped clean of browser/breadcrumb chrome, palette-quantized for
 * size. Every panel keeps a solid tint layer underneath the `<Image fill>`
 * so a slow load never flashes an empty frame (CONTRACTS.md's photoBg
 * pattern, screenshot variant).
 *
 * Motion: transform/opacity only (`y`/`opacity`/`scale` on the screen
 * stack, `x`/`opacity`/`rotate` on the phone arc) — the screens travel as
 * one absolutely-stacked column inside an `overflow-hidden` glass frame,
 * captions live in `fl-line-mask` wrappers (the same primitive
 * `MaskedReveal` uses internally) rather than through `MaskedReveal`
 * itself, since these are mutually-exclusive per-screen lines (one visible
 * at a time) rather than an additive stacked paragraph — `MaskedReveal`'s
 * scrub mode assumes every line's write-in is additive and none of them
 * exit, which doesn't fit this window-per-screen shape.
 *
 * `prefers-reduced-motion` OR a viewport under `md` (768px, matching the
 * `isDesktopViewport` convention in `GolfDashboardShell.tsx`) skip
 * `PinnedScrub` entirely and render `StaticCinema` instead: all four
 * screens (three desktop + Lift Lab) stacked in normal document flow with
 * their captions, zero motion, zero scrub — reads perfectly standing
 * still. This is stricter than `PinnedScrub`'s own built-in reduced-motion
 * fallback (which freezes at a single final frame) because the design bar
 * for M3 specifically calls for every screen to remain visible statically,
 * not just the last one.
 */
import Image from 'next/image';
import { m, useTransform, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { PinnedScrub } from '../scroll/PinnedScrub';
import { usePrefersReducedMotion } from '../scroll/usePrefersReducedMotion';

export interface M3ProductCinemaProps {
  className?: string;
}

interface CinemaScreen {
  key: string;
  label: string;
  caption: string;
  src: string;
  /** Solid fallback painted under the `<Image>` so a slow/failed load never
   * flashes empty — CONTRACTS.md's photoBg pattern, screenshot variant. */
  tint: string;
}

const SCREENS: CinemaScreen[] = [
  {
    key: 'command-center',
    label: 'Command Center',
    caption: 'Roster, calendar, and tasks — the whole program, one screen.',
    src: '/marketing/first-light/screens/command-center.png',
    tint: 'linear-gradient(155deg, #1c4632 0%, #143527 100%)',
  },
  {
    key: 'stats-center',
    label: 'Stats Center',
    caption: 'Box scores and stat lines that write themselves in as the season goes.',
    src: '/marketing/first-light/screens/stats-center.png',
    tint: 'linear-gradient(155deg, #1a3f2c 0%, #0f2a1e 100%)',
  },
  {
    key: 'decision-room',
    label: 'Decision Room',
    caption: 'CoachHelm surfaces the one thing worth a conversation this week.',
    src: '/marketing/first-light/screens/decision-room.png',
    tint: 'linear-gradient(155deg, #173d2b 0%, #0d2318 100%)',
  },
];

const LIFT_LAB = {
  label: 'Lift Lab',
  caption: 'Lift Lab — readiness and reps, built into the same program.',
  src: '/marketing/first-light/screens/lift-lab.png',
};

export function M3ProductCinema({ className }: M3ProductCinemaProps) {
  const reduced = usePrefersReducedMotion();
  // Mirrors `isDesktopViewport = useMediaQuery('(min-width: 768px)')` in
  // GolfDashboardShell.tsx — the repo's established conditional-MOUNT
  // pattern (not a CSS-only hide) so a mobile visitor never pays for the
  // 250vh scrub scaffold's scroll listener.
  const isDesktopViewport = useMediaQuery('(min-width: 768px)');
  const showStatic = reduced || !isDesktopViewport;

  return (
    <section className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-pine)' }}>
      <div className="fl-grain" aria-hidden="true" />
      {showStatic ? (
        <StaticCinema />
      ) : (
        <PinnedScrub heightVh={250} innerClassName="flex items-center justify-center px-6">
          {(progress) => <ProductFrame progress={progress} />}
        </PinnedScrub>
      )}
    </section>
  );
}

function Eyebrow() {
  return (
    <div className="mb-8 text-center">
      <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.5)]">
        Inside Helm
      </span>
    </div>
  );
}

function ProductFrame({ progress }: { progress: MotionValue<number> }) {
  const total = SCREENS.length;

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <Eyebrow />

      {/* G2 glass desktop frame — holds center for the whole scrub */}
      <div className="fl-glass-2 relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-2xl">
        <div className="relative z-10 h-full w-full overflow-hidden rounded-2xl">
          {SCREENS.map((screen, i) => (
            <ScreenPanel key={screen.key} index={i} total={total} progress={progress} screen={screen} />
          ))}
        </div>
      </div>

      {/* Progress dots — which screen is holding the frame right now. */}
      <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
        {SCREENS.map((screen, i) => (
          <ProgressDot key={screen.key} index={i} total={total} progress={progress} />
        ))}
      </div>

      {/* Captions — scrub-linked, one visible per screen window */}
      <div className="relative mt-4 h-14 text-center">
        {SCREENS.map((screen, i) => (
          <CaptionLine key={screen.key} index={i} total={total} progress={progress} caption={screen.caption} />
        ))}
      </div>

      {/* Phone frame — arcs in from the right ~55% through the scrub (Lift Lab) */}
      <PhoneArc progress={progress} />
    </div>
  );
}

function ScreenPanel({
  index,
  total,
  progress,
  screen,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  screen: CinemaScreen;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const enterEnd = Math.min(end, start + 0.06);
  const exitStart = Math.max(start, end - 0.08);

  const y = useTransform(
    progress,
    [start, enterEnd, exitStart, end],
    ['28%', '0%', '0%', '-28%'],
  );
  const opacity = useTransform(
    progress,
    [start, enterEnd, exitStart, end],
    [index === 0 ? 1 : 0, 1, 1, index === total - 1 ? 1 : 0],
  );
  const scale = useTransform(progress, [start, enterEnd], [0.97, 1]);

  return (
    <m.div style={{ y, opacity, scale }} className="absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: screen.tint }} />
      <Image
        src={screen.src}
        alt=""
        fill
        sizes="(min-width: 1024px) 900px, 90vw"
        className="object-cover object-top"
      />
    </m.div>
  );
}

function ProgressDot({
  index,
  total,
  progress,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const enterEnd = Math.min(end, start + 0.06);
  const exitStart = Math.max(start, end - 0.08);
  const width = useTransform(progress, [start, enterEnd, exitStart, end], [6, 20, 20, 6]);
  const opacity = useTransform(progress, [start, enterEnd, exitStart, end], [0.35, 1, 1, 0.35]);

  return (
    <m.span
      style={{ width, opacity, background: 'var(--fl-green)' }}
      className="h-1.5 rounded-full"
    />
  );
}

function CaptionLine({
  index,
  total,
  progress,
  caption,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  caption: string;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const enterEnd = Math.min(end, start + 0.06);
  const exitStart = Math.max(start, end - 0.08);
  const y = useTransform(progress, [start, enterEnd], ['70%', '0%']);
  const opacity = useTransform(
    progress,
    [start, enterEnd, exitStart, end],
    [index === 0 ? 1 : 0, 1, 1, index === total - 1 ? 1 : 0],
  );

  return (
    <span className="fl-line-mask absolute inset-x-0 top-0">
      <m.span style={{ y, opacity }} className="block text-body-lg text-[rgba(var(--fl-ecru-rgb),0.75)]">
        {caption}
      </m.span>
    </span>
  );
}

function PhoneArc({ progress }: { progress: MotionValue<number> }) {
  // Arrives from the right at ~55% through the scrub (spec: "roughly 55%"),
  // settles, then holds opacity 1 for the remainder — no exit window.
  const x = useTransform(progress, [0.5, 0.62], ['18%', '0%']);
  const opacity = useTransform(progress, [0.5, 0.58], [0, 1]);
  const rotate = useTransform(progress, [0.5, 0.62], [8, 0]);

  return (
    <m.div
      style={{ x, opacity, rotate }}
      className="fl-glass-2 pointer-events-none absolute -right-4 top-1/3 hidden h-40 w-20 overflow-hidden rounded-[1.4rem] sm:block lg:-right-10 lg:h-48 lg:w-24"
      aria-hidden="true"
    >
      <div className="relative z-10 h-full w-full overflow-hidden rounded-[1.4rem]">
        <div className="absolute inset-0" style={{ background: '#241f1a' }} />
        <Image src={LIFT_LAB.src} alt="" fill sizes="100px" className="object-cover object-top" />
      </div>
      <span className="absolute inset-x-0 top-2 z-20 flex justify-center">
        <span className="h-1 w-6 rounded-full bg-[rgba(var(--fl-pine-rgb),0.4)]" />
      </span>
    </m.div>
  );
}

/**
 * Fully static stacked fallback — mobile (<768px) and/or
 * `prefers-reduced-motion`. All four screens (three desktop + Lift Lab) in
 * normal document flow with their captions; no `m.*`, no scrub, no
 * viewport-entry animation — reads perfectly standing still per the design
 * bar ("must read perfectly with zero motion").
 */
function StaticCinema() {
  return (
    <div className="relative z-10 mx-auto max-w-md px-6 py-20 sm:py-24">
      <Eyebrow />

      <div className="flex flex-col gap-12">
        {SCREENS.map((screen) => (
          <div key={screen.key}>
            <div className="fl-glass-2 relative aspect-[16/10] w-full overflow-hidden rounded-2xl">
              <div className="absolute inset-0" style={{ background: screen.tint }} />
              <div className="relative z-10 h-full w-full">
                <Image
                  src={screen.src}
                  alt={`${screen.label} — a screenshot of the Helm ${screen.label} screen`}
                  fill
                  sizes="(min-width: 640px) 448px, 90vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
            <p className="mt-5 text-center text-body leading-relaxed text-[rgba(var(--fl-ecru-rgb),0.75)]">
              {screen.caption}
            </p>
          </div>
        ))}

        <div>
          <div className="fl-glass-2 relative mx-auto aspect-[9/19.5] w-[220px] overflow-hidden rounded-[2rem]">
            <div className="absolute inset-0" style={{ background: '#241f1a' }} />
            <div className="relative z-10 h-full w-full">
              <Image
                src={LIFT_LAB.src}
                alt={`${LIFT_LAB.label} — a screenshot of the player's strength and conditioning screen`}
                fill
                sizes="220px"
                className="object-cover object-top"
              />
            </div>
          </div>
          <p className="mt-5 text-center text-body leading-relaxed text-[rgba(var(--fl-ecru-rgb),0.75)]">
            {LIFT_LAB.caption}
          </p>
        </div>
      </div>
    </div>
  );
}
