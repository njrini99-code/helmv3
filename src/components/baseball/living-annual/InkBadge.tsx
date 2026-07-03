/**
 * InkBadge — a status STAMP, in ink (spec §4.2 rules 2 & 4, §6 empty-state
 * doctrine).
 *
 * The anti-toast: a small-caps mono label in lane ink on a FAINT tinted ground.
 * It is deliberately NOT a loud colored pill and NEVER red/yellow — a red error
 * badge or yellow warning box violates the empty-state doctrine ("urgency is a
 * color, not a toast"). Use it for quiet standing statuses: `ON THE RECORD`,
 * `VERIFIED`, `PROJECTED`, `LIVE`.
 *
 * `tone` picks the ink — `team` green, `pursuit` clay, `neutral` graphite — and
 * `sodium` is reserved for a genuinely live / PR moment (spec §4.4 #3), never
 * chrome. `variant` sets presence: `soft` a whisper of ground, `solid` a touch
 * more with a hairline of the same ink. The ink always carries the read; the
 * ground never shouts. No hooks — safe in a server component.
 */
import { cn } from '@/lib/utils';

export interface InkBadgeProps {
  /** Small-caps status word, e.g. `ON THE RECORD`, `PROJECTED`, `LIVE`. */
  label: string;
  /** Ink tone: `team` green, `pursuit` clay, `neutral` graphite, or `sodium` (live/PR only). */
  tone?: 'team' | 'pursuit' | 'neutral' | 'sodium';
  /** `soft` = faint ground (default); `solid` = a touch more ground + a hairline. */
  variant?: 'soft' | 'solid';
  className?: string;
}

const TONE: Record<NonNullable<InkBadgeProps['tone']>, { text: string; varRef: string }> = {
  team: { text: 'text-grade-plus', varRef: 'var(--grade-plus)' },
  pursuit: { text: 'text-pursuit', varRef: 'var(--pursuit-ink)' },
  neutral: { text: 'text-text-secondary', varRef: 'var(--grade-avg)' },
  sodium: { text: 'text-sodium', varRef: 'var(--sodium)' },
};

export function InkBadge({ label, tone = 'neutral', variant = 'soft', className }: InkBadgeProps) {
  const { text, varRef } = TONE[tone];
  const solid = variant === 'solid';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-fw-sm px-1.5 py-0.5 font-annual text-microbadge uppercase leading-none tracking-[0.12em]',
        text,
        solid && 'border',
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${varRef} ${solid ? 16 : 8}%, transparent)`,
        borderColor: solid ? `color-mix(in oklch, ${varRef} 32%, transparent)` : undefined,
      }}
    >
      {label}
    </span>
  );
}
