'use client';

import { useEffect, useState } from 'react';
import { plural } from '../../lib/plural';

/**
 * Time to an event in its two largest units (Player - Home.html `Countdown`; owner item E): days and hours a day or
 * more out ("1d 18h"), hours and minutes inside a day ("18h 02m"), and the seconds only inside the last hour
 * ("4m 09s"). The leading figure is never zero-padded. Reserves both wells until the clock is known (no hydration
 * jump), and disappears once the event starts. `frozen` (ISO) stops the clock for previews.
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
      {[0, 1].map((i) => <span key={i}><b className="ch-num">—</b></span>)}
    </span>
  );
  const left = Math.floor((Date.parse(to) - now) / 1000);
  if (!(left > 0)) return null;
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const parts: Array<[number, string]> = d > 0 ? [[d, 'd'], [h, 'h']] : h > 0 ? [[h, 'h'], [m, 'm']] : [[m, 'm'], [left % 60, 's']];
  const said = (v: number, name: string) => plural(v, name);
  // The seconds tick visually only; a screen reader hears the larger units once.
  const label = d > 0 ? `${said(d, 'day')} and ${said(h, 'hour')}` : h > 0 ? `${said(h, 'hour')} and ${said(m, 'minute')}` : m > 0 ? said(m, 'minute') : 'less than a minute';
  return (
    <span className="ch-cd" role="timer" aria-label={`Starts in ${label}`}>
      {parts.map(([v, s], i) => (
        <span key={s} aria-hidden="true">
          <b className="ch-num">{i ? String(v).padStart(2, '0') : v}</b>
          <em>{s}</em>
        </span>
      ))}
    </span>
  );
}
