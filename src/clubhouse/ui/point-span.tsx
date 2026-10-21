import type { ReactNode } from 'react';

/**
 * A hero figure with its decimal point in `.ch-num__pt` (controls.css), which opens a hair of room on each side: at
 * display sizes the figures' tight tracking drew the point against the digits, so "73.4" read "734" (wave 7 premium,
 * row 2). Only the first point is wrapped; a figure without one comes back as it was.
 */
export function withPointSpan(text: string): ReactNode {
  const i = text.indexOf('.');
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="ch-num__pt">.</span>
      {text.slice(i + 1)}
    </>
  );
}
