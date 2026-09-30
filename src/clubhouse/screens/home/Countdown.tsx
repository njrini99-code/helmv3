'use client';

import { useEffect, useState } from 'react';

/**
 * Days, hours, minutes and seconds to an event (Player - Home.html `Countdown`).
 * Renders nothing until the clock is known (no hydration mismatch) and once
 * the event has started. `frozen` (ISO) stops the clock for the preview and tests.
 */
export function Countdown({ to, frozen }: { to: string; frozen?: string }) {
  const [now, setNow] = useState<number | null>(frozen ? Date.parse(frozen) : null);
  useEffect(() => {
    if (frozen) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [frozen]);
  if (now == null) return null;
  const left = Math.floor((Date.parse(to) - now) / 1000);
  if (!(left > 0)) return null;
  const parts: Array<[number, string, string]> = [
    [Math.floor(left / 86400), 'd', 'days'],
    [Math.floor((left % 86400) / 3600), 'h', 'hours'],
    [Math.floor((left % 3600) / 60), 'm', 'minutes'],
    [left % 60, 's', 'seconds'],
  ];
  return (
    // The seconds tick visually only; a screen reader hears the days, hours and minutes once.
    <span className="ch-cd" role="timer" aria-label={`Starts in ${parts[0]![0]} days, ${parts[1]![0]} hours and ${parts[2]![0]} minutes`}>
      {parts.map(([v, s]) => (
        <span key={s} aria-hidden="true">
          <b className="ch-num">{String(v).padStart(2, '0')}</b>
          <em>{s}</em>
        </span>
      ))}
    </span>
  );
}
