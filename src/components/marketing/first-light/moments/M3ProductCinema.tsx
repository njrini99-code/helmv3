'use client';

/**
 * M3 · PRODUCT CINEMA — THE scroll set piece. docs/LANDING_ENTRY_WORLD_DESIGN.md
 * M3 ("the 'they put SO much effort in' moment"), read under the SAGE &
 * CREAM amendment at the top of that doc. Background register: sage-ink
 * band (`--fl-sage-ink`) — the one deep moment the daylight page is
 * allowed, considered depth against cream, never murk.
 *
 * REBUILD 2026-07-02 (Fable spec, Nick escalation — "vibe coded and basic
 * as hell" on the crossfade-panels + progress-dots version). Composition
 * is now "film through a projector, hardware on a desk," not a template
 * carousel:
 *
 * - **Film column** (`FilmColumn`/`FilmSlab`) — the three desktop screens
 *   (Command Center, Stats Center, Decision Room) are ONE absolutely-
 *   positioned column (`height: 300%`) inside the frame's screen well.
 *   The column's `y` steps 0% → -33.333% → -66.667% as scroll progress
 *   crosses two handoff windows, holding still (dwell) between them —
 *   screens physically push each other out of frame; there is no opacity
 *   crossfade between them (opacity is reserved for the dock-in and the
 *   ledger captions below). Each slab's inner image layer counter-
 *   translates a few percent against the column's push for a whisper of
 *   depth parallax — see `FilmSlab`.
 * - **Hardware bezel** (`HardwareShell`) — the frame is a piece of desk
 *   hardware, not a bare glass rectangle: an outer `fl-glass-2` shell, an
 *   inset screen well the film column lives inside, and a webcam-style dot
 *   in the top bezel (monitor variant) or a notch (phone variant). An
 *   earlier "reflection" strip under the frame (a blurred cream gradient
 *   standing in for a shadow blob) was removed 2026-07-02 (pixel review) —
 *   it rendered as a one-sided gray smudge rather than a clean symmetric
 *   reflection; the bezel + ledger band already carry the depth without
 *   it, matching `StaticCinema`'s fallback path, which never had one.
 * - **Ledger captions** (`Ledger`/`LedgerEntry`) — no progress dots. A
 *   left-anchored numbered ledger (01/02/03, `font-annual`) below the
 *   frame: a brass rule draws in and the caption writes in through the
 *   `fl-line-mask` primitive, crossfading exactly on the same two handoff
 *   windows that move the column — one clock driving both.
 * - **Phone arc** (`PhoneArc`) — the Lift Lab phone lands late
 *   ([0.60, 0.78]) with a curved trajectory (x/y/scale/opacity in, plus a
 *   rotation overshoot past level before settling at 0°), docking
 *   overlapping the frame's lower-right edge. The main frame eases -2% in
 *   `x` over the same window — "the desk rebalances to make room."
 * - **Cream veil** (`CreamVeil`) — M2 hands off in cream, not a hard
 *   section cut: a full-band cream veil sits at opacity 1 at progress 0
 *   and lifts across the first sliver of scrub, reading as a camera move
 *   into the sage-ink depth rather than a seam.
 *
 * Screens are dignified neutral placeholders (see "Screenshot asset
 * contract" in CONTRACTS.md) — `public/marketing/first-light/screens/*.png`,
 * generated this lane (Pillow, one-off, not committed as a script): a
 * cream paper card, a sage-mist badge with a simple line glyph, a Georgia
 * serif screen label in sage-ink, a short tagline, and brass hairline
 * dividers — palette-true, zero fake data, zero product chrome. Real
 * BaseballHelm Living-Annual captures (which correctly DO show the
 * product's kelly — kelly is product-only content, not landing chrome per
 * the amendment) swap in at integration; no code changes needed on either
 * side, it's a pure asset swap. Every panel keeps a solid cream-toned tint
 * layer underneath the `<Image fill>` so a slow load never flashes an
 * empty/dark frame (CONTRACTS.md's photoBg pattern, screenshot variant).
 *
 * Motion: transform/opacity only (`y`/`x`/`scale`/`rotate` on the column,
 * frame, and phone; `opacity` reserved for the dock-in, the cream veil,
 * and the ledger captions) — no GSAP, no layout-affecting scroll styles.
 *
 * `prefers-reduced-motion` OR a viewport under `md` (768px, matching the
 * `isDesktopViewport` convention in `GolfDashboardShell.tsx`) skip
 * `PinnedScrub` entirely and render `StaticCinema` instead: all four
 * screens (three desktop + Lift Lab) stacked in normal document flow,
 * each in the same hardware-bezel language, each with its own numbered
 * ledger caption — zero motion, zero scrub, reads perfectly standing
 * still. This is stricter than `PinnedScrub`'s own built-in reduced-motion
 * fallback (which freezes at a single final frame) because the design bar
 * for M3 specifically calls for every screen to remain visible statically,
 * not just the last one.
 */
import type { ReactNode } from 'react';
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

// A literal 3-tuple (not `CinemaScreen[]`) so `Ledger`'s literal-index reads
// below (`SCREENS[0]`/`[1]`/`[2]`) resolve to `CinemaScreen`, not
// `CinemaScreen | undefined` — the repo runs `noUncheckedIndexedAccess`,
// which only exempts indexing with a statically-known-in-range literal on
// an actual tuple type, not on a same-shaped plain array.
const SCREENS: readonly [CinemaScreen, CinemaScreen, CinemaScreen] = [
  {
    key: 'command-center',
    label: 'Command Center',
    caption: 'Roster, calendar, and tasks — the whole program, one screen.',
    src: '/marketing/first-light/screens/command-center.png',
    tint: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)',
  },
  {
    key: 'stats-center',
    label: 'Stats Center',
    caption: 'Box scores and stat lines that write themselves in as the season goes.',
    src: '/marketing/first-light/screens/stats-center.png',
    tint: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)',
  },
  {
    key: 'decision-room',
    label: 'Decision Room',
    caption: 'CoachHelm surfaces the one thing worth a conversation this week.',
    src: '/marketing/first-light/screens/decision-room.png',
    tint: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)',
  },
];

const LIFT_LAB = {
  label: 'Lift Lab',
  caption: 'Lift Lab — readiness and reps, built into the same program.',
  src: '/marketing/first-light/screens/lift-lab.png',
};

/**
 * The scrub's timing map, named rather than indexed (repo runs
 * `noUncheckedIndexedAccess` — a shared array of magic numbers would mean
 * every consumer re-proves each element is defined). One clock drives four
 * surfaces: the film column's dwell/handoff steps, each slab's depth
 * parallax, the ledger caption crossfade, and the phone arc's window —
 * a timing tweak here can't drift out of sync between them.
 *
 * [0, DOCK_END]                    — frame dock-in (scale + y)
 * [DOCK_END, SCREEN0_HOLD_END]     — screen 0 (Command Center) holds
 * [SCREEN0_HOLD_END, HANDOFF_01_END] — column pushes 0% → -33.333%
 * [HANDOFF_01_END, SCREEN1_HOLD_END] — screen 1 (Stats Center) holds
 * [SCREEN1_HOLD_END, HANDOFF_12_END] — column pushes -33.333% → -66.667%,
 *                                       phone arc + desk rebalance start
 * [HANDOFF_12_END, SCREEN2_HOLD_END] — screen 2 (Decision Room) holds
 * [SCREEN2_HOLD_END, 1]            — final hold
 */
const DOCK_END = 0.08;
const SCREEN0_HOLD_END = 0.3;
const HANDOFF_01_END = 0.42;
const SCREEN1_HOLD_END = 0.6;
const HANDOFF_12_END = 0.72;
const SCREEN2_HOLD_END = 0.88;

/** Phone arc + main-frame "desk rebalance" share this window (spec D) —
 * it starts exactly where the second handoff starts. */
const PHONE_ARC_START = SCREEN1_HOLD_END;
const PHONE_ARC_END = 0.78;
/** Rotation dips past level before settling — "a whisper of overshoot." */
const PHONE_ROTATE_OVERSHOOT_AT = 0.74;
const PHONE_OPACITY_IN_END = 0.64;

/** How far the cream veil (M2 handoff) lifts before the frame is doing
 * anything else — a sliver of the scrub, not a beat. */
const CREAM_VEIL_END = 0.07;

const DWELL_PROGRESS_STOPS = [DOCK_END, SCREEN0_HOLD_END, HANDOFF_01_END, SCREEN1_HOLD_END, HANDOFF_12_END, SCREEN2_HOLD_END];
const DWELL_Y_KEYFRAMES = ['0%', '0%', '-33.333%', '-33.333%', '-66.667%', '-66.667%'];

export function M3ProductCinema({ className }: M3ProductCinemaProps) {
  const reduced = usePrefersReducedMotion();
  // Mirrors `isDesktopViewport = useMediaQuery('(min-width: 768px)')` in
  // GolfDashboardShell.tsx — the repo's established conditional-MOUNT
  // pattern (not a CSS-only hide) so a mobile visitor never pays for the
  // 250vh scrub scaffold's scroll listener.
  const isDesktopViewport = useMediaQuery('(min-width: 768px)');
  const showStatic = reduced || !isDesktopViewport;

  return (
    <section className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-sage-ink)' }}>
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
      <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-cream-high-rgb),0.5)]">
        Inside Helm
      </span>
    </div>
  );
}

function ProductFrame({ progress }: { progress: MotionValue<number> }) {
  const columnY = useTransform(progress, DWELL_PROGRESS_STOPS, DWELL_Y_KEYFRAMES);
  // The only two moments the column actually moves — reused below to
  // drive each slab's depth parallax AND the ledger caption crossfade, so
  // captions swap exactly when the column physically pushes, off the same
  // clock, never a separately-tuned one.
  const handoff01 = useTransform(progress, [SCREEN0_HOLD_END, HANDOFF_01_END], [0, 1]);
  const handoff12 = useTransform(progress, [SCREEN1_HOLD_END, HANDOFF_12_END], [0, 1]);

  // Ledger "activeness" per screen (1 = fully home, 0 = off) — screen 0
  // starts active and fades as handoff01 runs; screen 1 rises with
  // handoff01 then falls with handoff12; screen 2 rises with handoff12
  // and holds through the final hold (handoff12 clamps at 1 past 0.72).
  const activeness0 = useTransform(handoff01, [0, 1], [1, 0]);
  // `values[n]` is `number | undefined` under `noUncheckedIndexedAccess`
  // even though the two-element shape is guaranteed at the call site below
  // (one input MotionValue per array slot) — the `?? 0` defaults satisfy
  // the type without changing behavior.
  // Explicit type args — the multi-input `useTransform` overload can't
  // infer `I` from a `MotionValue<string>[] | MotionValue<number>[] | ...`
  // union input type, so it falls back to `{}` (and `values[n]` becomes
  // untypeable arithmetic) unless told directly.
  const activeness1 = useTransform<number, number>([handoff01, handoff12], (values) => {
    const h01 = values[0] ?? 0;
    const h12 = values[1] ?? 0;
    return Math.min(h01, 1 - h12);
  });
  const activeness2 = useTransform(handoff12, [0, 1], [0, 1]);

  return (
    <>
      <CreamVeil progress={progress} />
      <div className="relative mx-auto w-full max-w-4xl">
        <Eyebrow />
        <HardwareFrame progress={progress} columnY={columnY} handoff01={handoff01} handoff12={handoff12} />
        <Ledger activeness0={activeness0} activeness1={activeness1} activeness2={activeness2} />
        <PhoneArc progress={progress} />
      </div>
    </>
  );
}

/**
 * A full-band cream veil over the whole pinned viewport — opacity 1 at
 * progress 0, lifting across `[0, CREAM_VEIL_END]`. Reads as a camera move
 * from M2's cream into this section's sage-ink depth rather than a hard
 * section boundary. `-inset-6` (not `inset-0`) deliberately overshoots
 * `PinnedScrub`'s `px-6` inner padding — an absolutely positioned child's
 * containing block is the padding *box*, not the border box, so `inset-0`
 * alone would leave two 24px sage-ink slivers at the left/right edges
 * during the veil's window; the sticky container's own `overflow-hidden`
 * clips the deliberate overshoot back to exactly the viewport edge.
 */
function CreamVeil({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, CREAM_VEIL_END], [1, 0]);
  return (
    <m.div
      style={{ opacity, backgroundColor: 'var(--fl-cream)' }}
      className="pointer-events-none absolute -inset-6 z-40"
      aria-hidden="true"
    />
  );
}

/**
 * Shared hardware chrome — the outer `fl-glass-2` shell, the inset screen
 * well, and one accessory: a webcam-style dot in the top bezel (`monitor`)
 * or a notch (`phone`). Both `HardwareFrame` (the film column's home) and
 * `StaticCinema`'s stacked fallback wrap around this so "this is a piece
 * of hardware, not a bare rectangle" (spec B) can't drift between the
 * scrubbed and static paths.
 */
function HardwareShell({
  variant,
  wellClassName,
  shellRoundedClassName,
  wellRoundedClassName,
  className,
  children,
}: {
  variant: 'monitor' | 'phone';
  wellClassName: string;
  shellRoundedClassName: string;
  wellRoundedClassName: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('fl-glass-2 relative p-[10px]', shellRoundedClassName, className)}>
      {variant === 'monitor' ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[5px] z-20 h-[2.5px] w-[2.5px] -translate-x-1/2 rounded-full"
          style={{ background: 'rgba(var(--fl-cream-high-rgb), 0.35)' }}
        />
      ) : (
        // Notch — kept dark (sage-ink) regardless of palette: a phone
        // camera cutout reads as hardware, not chrome.
        <span className="absolute inset-x-0 top-2 z-20 flex justify-center">
          <span className="h-1 w-6 rounded-full bg-[rgba(var(--fl-sage-ink-rgb),0.4)]" />
        </span>
      )}
      <div
        className={cn('relative overflow-hidden', wellClassName, wellRoundedClassName)}
        style={{ background: 'rgba(var(--fl-sage-ink-rgb), 0.55)' }}
      >
        {children}
      </div>
    </div>
  );
}

function HardwareFrame({
  progress,
  columnY,
  handoff01,
  handoff12,
}: {
  progress: MotionValue<number>;
  columnY: MotionValue<string>;
  handoff01: MotionValue<number>;
  handoff12: MotionValue<number>;
}) {
  // Dock-in — [0, DOCK_END] only; clamped afterward (useTransform's
  // default) so the frame simply holds its landed scale/position for the
  // rest of the scrub. `x` on the SAME element eases -2% during the
  // phone's arc window — "the desk rebalances to make room" (spec D) — one
  // transform, not a second wrapping element fighting for a stacking
  // context.
  const scale = useTransform(progress, [0, DOCK_END], [0.965, 1]);
  const dockY = useTransform(progress, [0, DOCK_END], ['5vh', '0vh']);
  const rebalanceX = useTransform(progress, [PHONE_ARC_START, PHONE_ARC_END], ['0%', '-2%']);

  return (
    <m.div style={{ scale, y: dockY, x: rebalanceX }} className="relative z-10">
      <HardwareShell
        variant="monitor"
        shellRoundedClassName="rounded-[1.25rem]"
        wellRoundedClassName="rounded-[0.9rem]"
        wellClassName="aspect-[16/10] w-full"
      >
        <FilmColumn columnY={columnY} handoff01={handoff01} handoff12={handoff12} />
      </HardwareShell>
    </m.div>
  );
}

/**
 * The film column — one absolutely-positioned `height: 300%` element
 * holding all three screens as stacked `h-1/3` slabs, living inside the
 * frame's screen well (`overflow-hidden` there does the clipping). `y`
 * steps 0% → -33.333% → -66.667% of the COLUMN's own height across the
 * two handoff windows — that's exactly two well-heights of travel (300% ×
 * 66.667% = 200%), landing screen 2 flush in the well with no crossfade
 * ever touching opacity.
 */
function FilmColumn({
  columnY,
  handoff01,
  handoff12,
}: {
  columnY: MotionValue<string>;
  handoff01: MotionValue<number>;
  handoff12: MotionValue<number>;
}) {
  return (
    <m.div style={{ y: columnY }} className="absolute inset-x-0 top-0 h-[300%]" aria-hidden="true">
      {SCREENS.map((screen, i) => (
        <FilmSlab key={screen.key} screen={screen} index={i} handoff01={handoff01} handoff12={handoff12} />
      ))}
    </m.div>
  );
}

function FilmSlab({
  screen,
  index,
  handoff01,
  handoff12,
}: {
  screen: CinemaScreen;
  index: number;
  handoff01: MotionValue<number>;
  handoff12: MotionValue<number>;
}) {
  // Depth parallax — the inner image layer counter-translates ~4% against
  // the column's own upward push (spec: "∓4% within its slab"), keyed off
  // the same two handoff clocks that move the column itself:
  //  - slab 0 only ever departs: 0% → -4% as handoff01 runs.
  //  - slab 1 arrives (+4% → 0%) on handoff01, then departs (0% → -4%) on
  //    handoff12 — the two terms never overlap since handoff01 is already
  //    clamped at 1 by the time handoff12 starts moving.
  //  - slab 2 only ever arrives: +4% → 0% as handoff12 runs, then holds
  //    through the final hold.
  // Explicit type args for the same reason as `activeness1` above — the
  // multi-input overload can't infer `I` from the union input type alone.
  const innerY = useTransform<number, string>([handoff01, handoff12], (values) => {
    const h01 = values[0] ?? 0;
    const h12 = values[1] ?? 0;
    if (index === 0) return `${-4 * h01}%`;
    if (index === 1) return `${4 * (1 - h01) - 4 * h12}%`;
    return `${4 * (1 - h12)}%`;
  });

  return (
    <div className="absolute inset-x-0 h-1/3 overflow-hidden" style={{ top: `${index * 33.333}%` }}>
      <m.div style={{ y: innerY }} className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: screen.tint }} />
        <Image
          src={screen.src}
          alt=""
          fill
          sizes="(min-width: 1024px) 900px, 90vw"
          className="object-cover object-top"
        />
      </m.div>
    </div>
  );
}

/**
 * Left-anchored numbered ledger — replaces the old progress-dot row
 * entirely. One entry per screen, absolutely stacked (so swapping never
 * reflows), each fading/writing in via the same `activeness` value that
 * also scales its brass rule segment in from 0.
 */
function Ledger({
  activeness0,
  activeness1,
  activeness2,
}: {
  activeness0: MotionValue<number>;
  activeness1: MotionValue<number>;
  activeness2: MotionValue<number>;
}) {
  // Named props (not an `activeness[i]` array + `.map`) — `SCREENS`'
  // literal-tuple indices below stay exact under `noUncheckedIndexedAccess`
  // only when the index is a literal, so this sidesteps that entirely
  // rather than fighting it per-element.
  return (
    <div className="relative mt-8 h-20">
      <LedgerEntry index={0} activeness={activeness0} caption={SCREENS[0].caption} />
      <LedgerEntry index={1} activeness={activeness1} caption={SCREENS[1].caption} />
      <LedgerEntry index={2} activeness={activeness2} caption={SCREENS[2].caption} />
    </div>
  );
}

function LedgerEntry({
  index,
  activeness,
  caption,
}: {
  index: number;
  activeness: MotionValue<number>;
  caption: string;
}) {
  const textY = useTransform(activeness, [0, 1], ['30%', '0%']);

  return (
    <m.div style={{ opacity: activeness }} className="absolute inset-x-0 top-0 flex items-start gap-4 text-left">
      <span
        className="font-annual text-sm tabular-nums tracking-wider"
        style={{ color: 'rgba(var(--fl-cream-high-rgb), 0.55)' }}
      >
        0{index + 1}
      </span>
      <div className="flex-1">
        <m.div style={{ scaleX: activeness }} className="fl-rule mb-3 w-10 origin-left" />
        <span className="fl-line-mask block">
          <m.span style={{ y: textY }} className="block text-body-lg text-[rgba(var(--fl-cream-high-rgb),0.75)]">
            {caption}
          </m.span>
        </span>
      </div>
    </m.div>
  );
}

/**
 * The Lift Lab phone — a real co-star landing late in the scrub, not a
 * sticker faded in. Curved trajectory across `[PHONE_ARC_START,
 * PHONE_ARC_END]`: x/y/scale ease in while rotate overshoots past level
 * (10° → -1.5° at `PHONE_ROTATE_OVERSHOOT_AT` → 0°) — "a whisper of
 * overshoot," not a linear settle. Docks overlapping the frame's
 * lower-right edge, above it in stacking order.
 */
function PhoneArc({ progress }: { progress: MotionValue<number> }) {
  const x = useTransform(progress, [PHONE_ARC_START, PHONE_ARC_END], ['64%', '0%']);
  const y = useTransform(progress, [PHONE_ARC_START, PHONE_ARC_END], ['14%', '0%']);
  const rotate = useTransform(progress, [PHONE_ARC_START, PHONE_ROTATE_OVERSHOOT_AT, PHONE_ARC_END], [10, -1.5, 0]);
  const scale = useTransform(progress, [PHONE_ARC_START, PHONE_ARC_END], [0.92, 1]);
  const opacity = useTransform(progress, [PHONE_ARC_START, PHONE_OPACITY_IN_END], [0, 1]);

  return (
    <m.div
      style={{ x, y, rotate, scale, opacity }}
      className="pointer-events-none absolute -right-4 bottom-0 z-20 hidden h-56 w-28 translate-y-[10%] sm:block lg:-right-8 lg:h-72 lg:w-[8.5rem]"
      aria-hidden="true"
    >
      <HardwareShell
        variant="phone"
        shellRoundedClassName="rounded-[1.4rem]"
        wellRoundedClassName="rounded-[1rem]"
        wellClassName="h-full w-full"
        className="h-full w-full"
      >
        <div className="absolute inset-0" style={{ background: 'var(--fl-cream)' }} />
        <Image src={LIFT_LAB.src} alt="" fill sizes="140px" className="object-cover object-top" />
      </HardwareShell>
    </m.div>
  );
}

/**
 * Fully static stacked fallback — mobile (<768px) and/or
 * `prefers-reduced-motion`. All four screens (three desktop + Lift Lab) in
 * normal document flow, each wrapped in the same hardware-bezel language
 * as the scrubbed version and each with its own left-anchored numbered
 * ledger caption; no `m.*`, no scrub, no dots, no viewport-entry animation
 * — reads perfectly standing still per the design bar ("must read
 * perfectly with zero motion").
 */
function StaticCinema() {
  return (
    <div className="relative z-10 mx-auto max-w-md px-6 py-20 sm:py-24">
      <Eyebrow />

      <div className="flex flex-col gap-14">
        {SCREENS.map((screen, i) => (
          <div key={screen.key}>
            <HardwareShell
              variant="monitor"
              shellRoundedClassName="rounded-[1.25rem]"
              wellRoundedClassName="rounded-[0.9rem]"
              wellClassName="aspect-[16/10] w-full"
            >
              <div className="absolute inset-0" style={{ background: screen.tint }} />
              <Image
                src={screen.src}
                alt={`${screen.label} — a screenshot of the Helm ${screen.label} screen`}
                fill
                sizes="(min-width: 640px) 448px, 90vw"
                className="object-cover object-top"
              />
            </HardwareShell>
            <StaticLedgerEntry index={i} caption={screen.caption} />
          </div>
        ))}

        <div>
          <HardwareShell
            variant="phone"
            shellRoundedClassName="rounded-[1.4rem]"
            wellRoundedClassName="rounded-[1rem]"
            wellClassName="aspect-[9/19.5] w-full"
            className="mx-auto w-[220px]"
          >
            <div className="absolute inset-0" style={{ background: 'var(--fl-cream)' }} />
            <Image
              src={LIFT_LAB.src}
              alt={`${LIFT_LAB.label} — a screenshot of the player's strength and conditioning screen`}
              fill
              sizes="220px"
              className="object-cover object-top"
            />
          </HardwareShell>
          <StaticLedgerEntry index={3} caption={LIFT_LAB.caption} />
        </div>
      </div>
    </div>
  );
}

function StaticLedgerEntry({ index, caption }: { index: number; caption: string }) {
  return (
    <div className="mt-5 flex items-start gap-4 text-left">
      <span
        className="font-annual text-sm tabular-nums tracking-wider"
        style={{ color: 'rgba(var(--fl-cream-high-rgb), 0.55)' }}
      >
        0{index + 1}
      </span>
      <div className="flex-1">
        <div className="fl-rule mb-3 w-10" />
        <p className="text-body leading-relaxed text-[rgba(var(--fl-cream-high-rgb),0.75)]">{caption}</p>
      </div>
    </div>
  );
}
