/**
 * AgingBar — the clay "days-since-contact" bar for recruiting cards (spec §6 #2,
 * §8 "urgency is color, not chrome").
 *
 * A thin clay bar that fills AND darkens as days accumulate toward a deadline:
 * the fill spans `min(days/max, 1)` of the track, and its ink ramps from the
 * lighter infield-clay `--pursuit-ink` toward the oxblood `--pursuit-deep` as it
 * approaches `max` — so a stale recruit visibly darkens like a deadline instead
 * of firing a red badge. War Room (clay) lane only; never rendered in green.
 *
 * Carries an accessible label (`"7 days since contact"`) via `role="meter"`. No
 * hooks — safe in a server component. No motion: the color IS the signal.
 */
import { cn } from '@/lib/utils';

export interface AgingBarProps {
  /** Days since last contact. */
  days: number;
  /** The deadline horizon in days at which the bar is full + darkest (default 21). */
  max?: number;
  className?: string;
}

export function AgingBar({ days, max = 21, className }: AgingBarProps) {
  const safeDays = Math.max(0, days);
  const t = Math.min(safeDays / max, 1); // 0 → fresh, 1 → at/past deadline
  const fillPct = Math.round(t * 100);
  // Ramp from --pursuit-ink (fresh) toward --pursuit-deep (oxblood) as t → 1.
  const fillColor = `color-mix(in oklch, var(--pursuit-deep) ${fillPct}%, var(--pursuit-ink))`;
  const label = `${safeDays} ${safeDays === 1 ? 'day' : 'days'} since contact`;

  return (
    <div
      role="meter"
      aria-valuenow={safeDays}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--hairline)]', className)}
    >
      <div className="h-full rounded-full" style={{ width: `${fillPct}%`, backgroundColor: fillColor }} />
    </div>
  );
}
