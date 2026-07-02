'use client';

/**
 * M3 · PRODUCT CINEMA — THE scroll set piece. docs/LANDING_ENTRY_WORLD_DESIGN.md
 * M3. Background register: deep pine band. A `PinnedScrub` (~250vh) holds a
 * G2 glass desktop frame center-stage while three product "screens" glide
 * through under scroll control, each with a scrub-linked caption. A phone
 * frame (Lift Lab) arcs in from the right at the midpoint.
 *
 * Screens are placeholder gradient panels + labels for now — real
 * screenshots land from `public/marketing/first-light/screens/` (see
 * CONTRACTS.md "Screenshot asset contract"); the frame + motion contract
 * (props, glass grade, scrub windows) is what this lane locks down.
 *
 * `prefers-reduced-motion`: `PinnedScrub` renders this content unpinned at
 * a single static `progress = 1` frame — the LAST screen, landed, with its
 * caption visible and the phone frame in place. No scrub, no glide.
 */
import { m, useTransform, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PinnedScrub } from '../scroll/PinnedScrub';
import { flFraunces } from '../fonts';

export interface M3ProductCinemaProps {
  className?: string;
}

interface CinemaScreen {
  label: string;
  caption: string;
  tint: string;
}

const SCREENS: CinemaScreen[] = [
  {
    label: 'Command Center',
    caption: 'Roster, calendar, and tasks — the whole program, one screen.',
    tint: 'linear-gradient(155deg, #1c4632 0%, #143527 100%)',
  },
  {
    label: 'Stats Center',
    caption: 'Strokes-gained and stat lines that update themselves.',
    tint: 'linear-gradient(155deg, #1a3f2c 0%, #0f2a1e 100%)',
  },
  {
    label: 'Decision Room',
    caption: 'CoachHelm surfaces the one thing worth a conversation this week.',
    tint: 'linear-gradient(155deg, #173d2b 0%, #0d2318 100%)',
  },
];

export function M3ProductCinema({ className }: M3ProductCinemaProps) {
  return (
    <section className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-pine)' }}>
      <div className="fl-grain" aria-hidden="true" />
      <PinnedScrub heightVh={250} innerClassName="flex items-center justify-center px-6">
        {(progress) => <ProductFrame progress={progress} />}
      </PinnedScrub>
    </section>
  );
}

function ProductFrame({ progress }: { progress: MotionValue<number> }) {
  const total = SCREENS.length;

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div className="mb-8 text-center">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.5)]">
          Inside Helm
        </span>
      </div>

      {/* G2 glass desktop frame — holds center for the whole scrub */}
      <div className="fl-glass-2 relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-2xl">
        <div className="relative z-10 h-full w-full overflow-hidden rounded-2xl">
          {SCREENS.map((screen, i) => (
            <ScreenPanel key={screen.label} index={i} total={total} progress={progress} screen={screen} />
          ))}
        </div>
      </div>

      {/* Captions — scrub-linked, one visible per screen window */}
      <div className="relative mt-8 h-14 text-center">
        {SCREENS.map((screen, i) => (
          <CaptionLine key={screen.label} index={i} total={total} progress={progress} caption={screen.caption} />
        ))}
      </div>

      {/* Phone frame — arcs in from the right at the midpoint (Lift Lab) */}
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

  return (
    <m.div
      style={{ y, opacity, background: screen.tint }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <span className={cn(flFraunces.className, 'text-2xl font-medium text-[rgba(var(--fl-ecru-rgb),0.9)] sm:text-3xl')}>
        {screen.label}
      </span>
    </m.div>
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
  // Arrives from the right at the scrub's midpoint, settles, holds.
  const x = useTransform(progress, [0.42, 0.62], ['18%', '0%']);
  const opacity = useTransform(progress, [0.42, 0.55], [0, 1]);
  const rotate = useTransform(progress, [0.42, 0.62], [8, 0]);

  return (
    <m.div
      style={{ x, opacity, rotate }}
      className="fl-glass-2 pointer-events-none absolute -right-4 top-1/3 hidden h-40 w-20 rounded-[1.4rem] sm:block lg:-right-10 lg:h-48 lg:w-24"
      aria-hidden="true"
    >
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-1.5 px-3">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--fl-green)' }} />
        <span className="text-eyebrow font-medium uppercase text-[rgba(var(--fl-ecru-rgb),0.7)]">Lift Lab</span>
      </div>
    </m.div>
  );
}
