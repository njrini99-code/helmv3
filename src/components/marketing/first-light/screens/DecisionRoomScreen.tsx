'use client';

/**
 * DecisionRoomScreen — the CoachHelm honesty idiom in miniature, studied
 * from `EvidencePanel.tsx`'s confidence pill (`{pct}% confidence`, tiered
 * green/amber/gray) and `M5Intelligence.tsx`'s signal card (this branch's
 * quality bar: a title, an honest confidence figure, the source it came
 * from — never a bare claim). Three rows; kelly marks only the
 * high-confidence tier — product-only accent, per CONTRACTS.md.
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
      <ScreenEyebrow>Decision Room</ScreenEyebrow>
      <div className="fl-rule mt-2" />

      <m.div
        variants={containerVariants(0.08)}
        initial={shown ? 'shown' : 'hidden'}
        animate={shown ? 'shown' : 'hidden'}
        className="mt-1 flex flex-1 flex-col justify-center"
      >
        {SIGNALS.map((s, i) => {
          const color = tierColor(s.confidence);
          return (
            <m.div
              key={s.title}
              variants={rowVariants}
              className="flex items-start justify-between gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-[rgba(var(--fl-sage-rgb),0.1)]"
              style={i > 0 ? { borderTop: '1px solid rgba(var(--fl-brass-rgb), 0.18)' } : undefined}
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
    </div>
  );
}
