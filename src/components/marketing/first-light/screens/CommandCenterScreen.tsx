'use client';

/**
 * CommandCenterScreen — a faithful miniature of BaseballHelm's coach
 * Command Center idiom (studied from `CommandCenterFairway.tsx`: an
 * `Eyebrow`-grammar masthead line, the KPI contents strip, the today
 * schedule, the roster). Cream paper + sage-ink type + brass hairlines,
 * per CONTRACTS.md's screen replica contract — kelly appears only as the
 * roster-pulse "synced today" dot (product-only accent, never landing
 * chrome). Built to the M5 signal-card replica's quality bar
 * (`M5Intelligence.tsx`, this branch).
 *
 * DENSITY PASS (2026-07, Nick: "reads unfinished" — the well showed a
 * floating masthead+tiles band, a large empty void, then a small floating
 * roster island, then more void). Root cause was `justify-center`
 * centering a short 4-row list inside a tall `flex-1` area, which puts
 * equal voids above AND below it. Fixed by a header/body/footer flex
 * column where the body is TOP-aligned (never centered) and its last,
 * growing section — the roster — is a CSS GRID with `1fr` rows, which
 * fills the exact available height edge-to-edge no matter how tall the
 * well actually renders, instead of guessing at row counts/heights. Also
 * added the missing middle (a Today schedule strip) and grew the roster
 * to 7 rows with hairline row separators + tighter rhythm, and a quiet
 * footer strip — real dashboards are dense; this now reads dense too.
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScreenEyebrow, RollingStat, rowVariants, containerVariants, KELLY, type ScreenReplicaProps } from './shared';

const SCHEDULE: ReadonlyArray<{ label: string; when: string }> = [
  { label: 'Practice', when: '3:30 PM · Field 2' },
  { label: 'Lift', when: '6:00 AM · Weight Room' },
];

const ROSTER: ReadonlyArray<{ name: string; pos: string; note: string; live: boolean }> = [
  { name: 'J. Alvarez', pos: 'SS', note: 'Logged AB data', live: true },
  { name: 'M. Chen', pos: 'RHP', note: 'Lift complete', live: false },
  { name: 'D. Ruiz', pos: 'OF', note: 'Readiness in', live: true },
  { name: 'T. Brooks', pos: '1B', note: 'Travel confirmed', live: false },
  { name: 'K. Torres', pos: '2B', note: 'Readiness in', live: true },
  { name: 'A. Diaz', pos: 'C', note: 'On the record', live: false },
  { name: 'R. Bennett', pos: 'LHP', note: 'Lift complete', live: false },
];

export function CommandCenterScreen({ active, instant = false, className }: ScreenReplicaProps) {
  const shown = instant || active;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-4', className)}
      style={{ background: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)' }}
    >
      {/* HEADER */}
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <span className="font-annual text-body-sm font-semibold" style={{ color: 'var(--fl-sage-ink)' }}>
          Rini University Baseball
        </span>
        <ScreenEyebrow>Tue · Jul 2</ScreenEyebrow>
      </div>
      <div className="fl-rule mt-2 shrink-0" />

      {/* BODY — top-aligned throughout; only the roster grows */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <m.div
          variants={containerVariants(0.06)}
          initial={shown ? 'shown' : 'hidden'}
          animate={shown ? 'shown' : 'hidden'}
          className="mt-3 grid shrink-0 grid-cols-3 gap-3"
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

        <div className="fl-rule my-3 shrink-0" />

        <m.div
          variants={containerVariants(0.05, 0.12)}
          initial={shown ? 'shown' : 'hidden'}
          animate={shown ? 'shown' : 'hidden'}
          className="shrink-0"
        >
          <ScreenEyebrow>Today</ScreenEyebrow>
          <div className="mt-1.5 flex flex-col gap-1">
            {SCHEDULE.map((s) => (
              <m.div key={s.label} variants={rowVariants} className="flex items-center justify-between text-microlabel">
                <span className="font-medium" style={{ color: 'var(--fl-sage-ink)' }}>
                  {s.label}
                </span>
                <span style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.55)' }}>{s.when}</span>
              </m.div>
            ))}
          </div>
        </m.div>

        <div className="fl-rule my-3 shrink-0" />

        {/* Roster — the grower. A CSS grid with `1fr` rows fills whatever
            height remains, edge to edge, instead of a flex list that
            clusters in the middle via `justify-center`. */}
        <m.div
          variants={containerVariants(0.04, 0.2)}
          initial={shown ? 'shown' : 'hidden'}
          animate={shown ? 'shown' : 'hidden'}
          className="grid flex-1"
          style={{ gridTemplateRows: `repeat(${ROSTER.length}, 1fr)` }}
        >
          {ROSTER.map((p, i) => (
            <m.div
              key={p.name}
              variants={rowVariants}
              className="flex items-center justify-between gap-2 px-1 transition-colors hover:bg-[rgba(var(--fl-sage-rgb),0.14)]"
              style={i > 0 ? { borderTop: '1px solid rgba(var(--fl-brass-rgb), 0.14)' } : undefined}
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
              <span
                className="flex shrink-0 items-center gap-1 text-microbadge font-normal"
                style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.55)' }}
              >
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

      {/* FOOTER */}
      <div className="fl-rule mt-2 shrink-0" />
      <p className="mt-1.5 shrink-0 text-microbadge font-normal" style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.45)' }}>
        3 unread · 2 forms due
      </p>
    </div>
  );
}
