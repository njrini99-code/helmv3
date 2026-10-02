'use client';

import { useEffect, useState } from 'react';

/**
 * Days, hours, minutes and seconds to an event (Player - Home.html `Countdown`).
 * Reserves the four wells until the clock is known (no hydration jump), and
 * disappears once the event starts. `frozen` (ISO) stops the clock for previews.
 */
export function Countdown({ to, frozen }: { to: string; frozen?: string }) {
  const [now, setNow] = useState<number | null>(frozen ? Date.parse(frozen) : null);
  useEffect(() => {
    if (frozen) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [frozen]);
  if (now == null) return (
    <span className="ch-cd" aria-hidden="true">
      {['d', 'h', 'm', 's'].map((s) => <span key={s}><b className="ch-num">—</b><em>{s}</em></span>)}
    </span>
  );
  const left = Math.floor((Date.parse(to) - now) / 1000);
  if (!(left > 0)) return null;
  const parts: Array<[number, string, string]> = [
    [Math.floor(left / 86400), 'd', 'day'],
    [Math.floor((left % 86400) / 3600), 'h', 'hour'],
    [Math.floor((left % 3600) / 60), 'm', 'minute'],
    [left % 60, 's', 'second'],
  ];
  const said = ([v, , name]: [number, string, string]) => `${v} ${name}${v === 1 ? '' : 's'}`;
  return (
    // The seconds tick visually only; a screen reader hears the days, hours and minutes once.
    <span className="ch-cd" role="timer" aria-label={`Starts in ${said(parts[0]!)}, ${said(parts[1]!)} and ${said(parts[2]!)}`}>
      {parts.map(([v, s]) => (
        <span key={s} aria-hidden="true">
          <b className="ch-num">{String(v).padStart(2, '0')}</b>
          <em>{s}</em>
        </span>
      ))}
    </span>
  );
}
