'use client';

import { createContext, useContext, type ReactNode } from 'react';
import '../styles/hero-tones.css';

import type { HeroTone } from './hero-tone';

const ToneContext = createContext<HeroTone>('canopy');
export function HeroToneProvider({ tone, children }: { tone: HeroTone; children: ReactNode }) {
  return <ToneContext.Provider value={tone}>{children}</ToneContext.Provider>;
}
export function useHeroTone(): HeroTone {
  return useContext(ToneContext);
}

/** The contour drawing behind the `topo` tone's far corner: a few closed rings, as on a yardage book's green. */
function Contour() {
  const rings = Array.from({ length: 9 }, (_, k) => {
    const r = 26 + k * 22;
    const pts = Array.from({ length: 61 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2;
      const w = 1 + 0.15 * Math.sin(3 * a + k * 0.5) + 0.06 * Math.sin(7 * a + k * 0.3);
      return `${(300 + r * 1.6 * w * Math.cos(a)).toFixed(1)},${(120 + r * w * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return <polyline key={k} points={pts} />;
  });
  return (
    <svg className="ch-hero__motif" viewBox="0 0 600 240" aria-hidden="true" focusable="false">
      <g>{rings}</g>
      <circle cx="300" cy="120" r="3" />
    </svg>
  );
}

/**
 * The shared page hero: a section line, the serif title, one line, and the page's actions on the right. The tone
 * comes from HeroToneProvider (the canopy unless a page or the lab says otherwise); `figures` show only on the
 * tournament board.
 */
export function PageHero({
  eyebrow,
  title,
  titleId,
  actions,
  figures,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  /** At most two controls; anything more belongs below the hero. */
  actions?: ReactNode;
  /** The board tone's head numbers: a few short label and value pairs. */
  figures?: ReadonlyArray<{ label: string; value: ReactNode }>;
  /** The one line under the title. */
  children?: ReactNode;
}) {
  const tone = useHeroTone();
  return (
    <header className="ch-hero" data-tone={tone} data-canopy-head="">
      {tone === 'topo' && <Contour />}
      {eyebrow && <span className="ch-hero__eyebrow">{eyebrow}</span>}
      <h1 id={titleId} className="ch-hero__title ch-display">
        {title}
      </h1>
      {children && <p className="ch-hero__line">{children}</p>}
      {tone === 'board' && figures && figures.length > 0 && (
        <dl className="ch-hero__figs">
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className="ch-num">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="ch-hero__actions">{actions}</div>}
    </header>
  );
}
