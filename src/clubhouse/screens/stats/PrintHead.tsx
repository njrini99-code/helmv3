'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * True while the page is being printed. Paper is narrower than the phone breakpoint, so the browser answers "phone width"
 * to the layout hook while it prints; a page that would flip to its phone view for the sheet keeps its desktop view instead.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // Synchronous, so the desktop view is in the document before the browser lays the sheet out.
    const on = () => flushSync(() => setPrinting(true));
    const off = () => flushSync(() => setPrinting(false));
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return printing;
}

/**
 * The line that heads a printed stats page: GolfHelm, who the figures are for, and the day they were printed. It is on the
 * page for paper only (`.ch-st-print`, stats.css). The day is read when the page is printed, not when it loaded, and paper
 * is always light: a page in dark mode drops its theme for the print and has it back afterwards.
 */
export function PrintHead({ subject }: { subject: string }) {
  const [day, setDay] = useState('');
  useEffect(() => {
    const html = document.documentElement;
    let theme: string | null = null;
    const stamp = () => setDay(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    const before = () => {
      stamp();
      theme = html.getAttribute('data-fw-theme');
      if (theme === 'dark') html.removeAttribute('data-fw-theme');
    };
    const after = () => {
      if (theme === 'dark') html.setAttribute('data-fw-theme', 'dark');
      theme = null;
    };
    stamp();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return (
    <div className="ch-st-print" aria-hidden="true">
      <b>GolfHelm</b>
      <span>{subject}</span>
      <span className="ch-num">{day}</span>
    </div>
  );
}
