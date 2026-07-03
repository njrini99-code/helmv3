'use client';

/**
 * DecisionRoomScreen — the CoachHelm honesty idiom in miniature, studied
 * from `EvidencePanel.tsx`'s confidence pill (`{pct}% confidence`, tiered
 * green/amber/gray) and `M5Intelligence.tsx`'s signal card (this branch's
 * quality bar: a title, an honest confidence figure, the source it came
 * from — never a bare claim). Three bordered evidence cards; kelly marks
 * only the high-confidence tier — product-only accent, per CONTRACTS.md.
 *
 * DENSITY PASS (2026-07) — see `CommandCenterScreen.tsx`'s file header for
 * the root cause (`justify-center` clustering 3 plain rows in a tall
 * `flex-1` area, reading as "void, 3 rows, void"). Fixed by promoting the
 * signals to bordered evidence cards (hairline + a subtle sage bg step)
 * inside a CSS grid with `1fr` rows — they now span the full body height
 * with intent, edge to edge, never an isolated floating cluster. Added a
 * header row + a quiet footer row so the screen reads header/body/footer
 * like the other two, not a single centered island.
 */
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScreenEyebrow, rowVariants, containerVariants, barVariants, KELLY, type ScreenReplicaProps } from './shared';

interface Signal {
  title: string;
  source: string;
  confidence: number;
}

const SIGNALS: readonly Signal[] = [
  { title: 'Left-side exit velo has dipped 3.1 mph over 2 weeks.', source: '6 games · exit velocity, pull-side', confidence: 92 },
  { title: 'Bullpen usage is trending toward back-to-back outings.', source: '9 appearances · rest-day tracking', confidence: 78 },
  { title: 'Two infielders show a fatigue pattern late in doubleheaders.', source: '3 doubleheaders · lift + readiness logs', confidence: 64 },
];

/** Tier ink: kelly ≥85 (high confidence — the honest-flex moment), sage-deep
 * ≥70 (medium), muted sage below (low — read plainly, never hidden). */
function tierColor(pct: number): string {
  if (pct >= 85) return KELLY;
  if (pct >= 70) return 'var(--fl-sage-deep)';
  return 'var(--fl-sage)';
}

export function DecisionRoomScreen({ active, instant = false, className }: ScreenReplicaProps) {
  const shown = instant || active;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden p-4', className)}
      style={{ background: 'linear-gradient(155deg, var(--fl-cream-high) 0%, var(--fl-cream) 100%)' }}
    >
      {/* HEADER */}
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <ScreenEyebrow>This Week</ScreenEyebrow>
        <ScreenEyebrow>3 Signals</ScreenEyebrow>
      </div>
      <div className="fl-rule mt-2 shrink-0" />

      {/* BODY — 3 evidence cards distributed edge to edge via 1fr grid
          rows, never a justify-center cluster stranded in the middle. */}
      <m.div
        variants={containerVariants(0.1)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-3 grid flex-1 gap-2"
        style={{ gridTemplateRows: `repeat(${SIGNALS.length}, 1fr)` }}
      >
        {SIGNALS.map((s) => {
          const color = tierColor(s.confidence);
          return (
            <m.div
              key={s.title}
              variants={rowVariants}
              className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-[rgba(var(--fl-sage-rgb),0.12)]"
              style={{
                border: '1px solid rgba(var(--fl-brass-rgb), 0.2)',
                background: 'rgba(var(--fl-sage-rgb), 0.07)',
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption" style={{ color: 'var(--fl-sage-ink)' }}>
                  {s.title}
                </p>
                <p className="mt-1 text-microlabel font-normal" style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.5)' }}>
                  {s.source}
                </p>
                <div className="mt-1.5 h-[2.5px] w-full rounded-full" style={{ background: 'rgba(var(--fl-sage-rgb), 0.18)' }}>
                  <m.div
                    variants={barVariants}
                    className="h-full origin-left rounded-full"
                    style={{ background: color, width: `${s.confidence}%` }}
                  />
                </div>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-microlabel tabular-nums"
                style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, color }}
              >
                {s.confidence}%
              </span>
            </m.div>
          );
        })}
      </m.div>

      {/* FOOTER */}
      <div className="fl-rule mt-2 shrink-0" />
      <p className="mt-1.5 shrink-0 text-microbadge font-normal" style={{ color: 'rgba(var(--fl-sage-ink-rgb), 0.45)' }}>
        Open Decision Room →
      </p>
    </div>
  );
}
