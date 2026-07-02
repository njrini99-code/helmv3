'use client';

/**
 * CommandCenterScreen — a faithful miniature of BaseballHelm's coach
 * Command Center idiom (studied from `CommandCenterFairway.tsx`: an
 * `Eyebrow`-grammar masthead line, the KPI contents strip, the roster).
 * Cream paper + sage-ink type + brass hairlines, per CONTRACTS.md's screen
 * replica contract — kelly appears only as the roster-pulse "synced today"
 * dot (product-only accent, never landing chrome). Built to the M5
 * signal-card replica's quality bar (`M5Intelligence.tsx`, this branch).
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScreenEyebrow, RollingStat, rowVariants, containerVariants, KELLY, type ScreenReplicaProps } from './shared';

const ROSTER: ReadonlyArray<{ name: string; pos: string; note: string; live: boolean }> = [
  { name: 'J. Alvarez', pos: 'SS', note: 'Logged AB data', live: true },
  { name: 'M. Chen', pos: 'RHP', note: 'Lift complete', live: false },
  { name: 'D. Ruiz', pos: 'OF', note: 'Readiness in', live: true },
  { name: 'T. Brooks', pos: '1B', note: 'Travel confirmed', live: false },
];

export function CommandCenterScreen({ active, instant = false, className }: ScreenReplicaProps) {
  const shown = instant || active;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-4', className)}
      style={{ background: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-annual text-body-sm font-semibold" style={{ color: 'var(--fl-sage-ink)' }}>
          Rini University Baseball
        </span>
        <ScreenEyebrow>Tue · Jul 2</ScreenEyebrow>
      </div>
      <div className="fl-rule mt-2" />

      <m.div
        variants={containerVariants(0.06)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-3 grid grid-cols-3 gap-3"
      >
        <m.div variants={rowVariants}>
          <ScreenEyebrow>Record</ScreenEyebrow>
          <p className="mt-1" style={{ color: 'var(--fl-sage-ink)' }}>
            <RollingStat value={24} active={active} instant={instant} className="text-body font-semibold" />
            <span className="mx-px text-body font-semibold">-</span>
            <RollingStat value={11} active={active} instant={instant} className="text-body font-semibold" />
          </p>
        </m.div>
        <m.div variants={rowVariants}>
          <ScreenEyebrow>Next Game</ScreenEyebrow>
          <p className="mt-1 truncate text-body-sm font-semibold" style={{ color: 'var(--fl-sage-ink)' }}>
            Sat · Elon
          </p>
        </m.div>
        <m.div variants={rowVariants}>
          <ScreenEyebrow>Readiness</ScreenEyebrow>
          <p className="mt-1" style={{ color: 'var(--fl-sage-ink)' }}>
            <RollingStat value={87} suffix="%" active={active} instant={instant} className="text-body font-semibold" />
          </p>
        </m.div>
      </m.div>

      <div className="fl-rule mt-3" />

      <m.div
        variants={containerVariants(0.05, 0.15)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-2 flex flex-1 flex-col justify-center gap-1.5"
      >
        {ROSTER.map((p) => (
          <m.div
            key={p.name}
            variants={rowVariants}
            className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-[rgba(var(--fl-sage-rgb),0.14)]"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="shrink-0 rounded px-1 py-px text-microbadge uppercase tracking-wide"
                style={{ background: 'var(--fl-sage-mist)', color: 'var(--fl-sage-ink)' }}
              >
                {p.pos}
              </span>
              <span className="truncate text-microlabel" style={{ color: 'var(--fl-sage-ink)' }}>
                {p.name}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-microbadge font-normal" style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.55)' }}>
              {p.note}
              {p.live && (
                <span
                  aria-hidden="true"
                  className={cn('h-1 w-1 rounded-full', !instant && 'animate-pulse')}
                  style={{ background: KELLY }}
                />
              )}
            </span>
          </m.div>
        ))}
      </m.div>
    </div>
  );
}
