'use client';

import './landing.css';
import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { FinalCTASection } from './FinalCTASection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { RequestDemoModal } from './RequestDemoModal';
import { RequestDemoProvider } from './request-demo-context';

/**
 * Shared chrome for the marketing pages (/, /about, /pricing): deep-linen
 * canvas, glass header, dark footer, and the Request Demo modal. Everything
 * behind the open modal goes `inert`.
 *
 * No noise/grain overlay — the "California linen" depth comes from the
 * champagne canvas vs cream cards and their soft shadows. A multiply-noise
 * screen over the whole page (including the dashboard cards) read as a fuzzy
 * grain, so it was removed (2026-07-24).
 */

interface MarketingShellProps {
  /** Render the dark "See GolfHelm with your program in mind" band above the footer. */
  showCta?: boolean;
  children: ReactNode;
}

/**
 * NOTE ON THE ENTRANCE GATE. This shell deliberately does NOT lift
 * `marketing-anim-gate` (see lib/motion/anim-gate.ts). Lifting it here looks
 * right — the shell is the one component every marketing page mounts — but
 * `/products` renders MarketingShell and ProductsLanding as separate client
 * boundaries that hydrate in separate commits, so the shell's effect fired
 * first and un-hid all 20 reveal blocks a measured ~20ms (94ms at 4x CPU)
 * before useProductsEffects could hide them. The gate is released per element
 * by whichever system owns it instead.
 */
export function MarketingShell({ showCta = false, children }: MarketingShellProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openModal = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = e.currentTarget;
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    const trigger = triggerRef.current;
    if (trigger) window.setTimeout(() => trigger.focus(), 0);
  }, []);

  return (
    <div className="landing-selection relative min-h-dvh bg-canvas font-fw-sans text-text-primary antialiased">
      {/* inert removes the page behind the dialog from tab order + the
          accessibility tree while the Request Demo modal is open. */}
      <div inert={modalOpen || undefined}>
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:rounded-md focus:bg-stone-950 focus:px-4 focus:py-2.5 focus:text-text-on-accent"
        >
          Skip to content
        </a>
        <LandingHeader onRequestDemo={openModal} />
        <main id="top" className="scroll-mt-[90px] outline-none">
          <RequestDemoProvider value={openModal}>{children}</RequestDemoProvider>
          {showCta ? <FinalCTASection onRequestDemo={openModal} /> : null}
        </main>
        <LandingFooter onRequestDemo={openModal} />
      </div>
      <RequestDemoModal open={modalOpen} onClose={closeModal} />
    </div>
  );
}
