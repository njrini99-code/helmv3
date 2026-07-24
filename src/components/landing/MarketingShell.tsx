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
 * canvas + grain, glass header, dark footer, and the Request Demo modal.
 * Everything behind the open modal goes `inert`.
 */

/**
 * Fixed linen-grain texture over the whole page (multiply). Opacity tuned so
 * the deep champagne canvas reads as woven linen and cream cards clearly
 * lift off it — the "deep linen contrast" pass.
 */
function LinenGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[2] opacity-55 mix-blend-multiply"
      style={{
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 240 240\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
      }}
    />
  );
}

interface MarketingShellProps {
  /** Render the dark "See GolfHelm with your program in mind" band above the footer. */
  showCta?: boolean;
  children: ReactNode;
}

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
      <LinenGrain />
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
