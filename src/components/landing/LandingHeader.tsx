'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { prefersReducedMotion, useScrollFrame } from './motion';

/**
 * Landing header — naked Helm wheel mark, one warm-glass nav lens
 * (GolfHelm / CoachHelm / Performance / Team), quiet Log in, single green
 * Request Demo. The lens tint deepens once the page scrolls past 40px.
 */

const NAV_ROUTES = [
  { label: 'About', href: '/about' },
  { label: 'Products', href: '/products' },
  { label: 'Pricing', href: '/pricing' },
];

const LENS_REST = {
  background:
    'linear-gradient(180deg, oklch(1 0 0 / 0.20), oklch(1 0 0 / 0.05)), color-mix(in srgb, var(--fw-color-surface) 52%, transparent)',
  boxShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.34), 0 1px 2px oklch(0.18 0.01 60 / 0.05), 0 12px 30px oklch(0.18 0.01 60 / 0.08)',
};

const LENS_SCROLLED = {
  background:
    'linear-gradient(180deg, oklch(1 0 0 / 0.24), oklch(1 0 0 / 0.07)), color-mix(in srgb, var(--fw-color-surface) 74%, transparent)',
  boxShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.5), 0 1px 2px oklch(0.18 0.01 60 / 0.08), 0 12px 34px oklch(0.18 0.01 60 / 0.12)',
};

export function scrollToHash(e: MouseEvent<HTMLAnchorElement>, hash: string) {
  const target = document.querySelector<HTMLElement>(hash);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  history.pushState(null, '', hash);
  // Native anchor jumps move sequential focus; a scripted scroll must too,
  // or keyboard users Tab straight back to where they came from.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

interface LandingHeaderProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function LandingHeader({ onRequestDemo }: LandingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  // Off the landing page the section anchors navigate home; on it they
  // smooth-scroll in place.
  const onHome = pathname === '/';

  useScrollFrame(
    useCallback(() => {
      setScrolled(window.scrollY > 40);
    }, []),
  );

  const lens = scrolled ? LENS_SCROLLED : LENS_REST;

  return (
    <header className="sticky top-0 z-[100] py-3.5">
      {/* Equal flex-1 side clusters keep the nav lens on the true page
          centerline — with flex-none sides the wider right cluster pushes
          the mx-auto lens visibly left of center. */}
      <div className="mx-auto flex max-w-[1320px] items-center gap-5 px-[clamp(20px,4vw,64px)]">
        <div className="flex flex-1 items-center">
          <Link
            href="/#top"
            onClick={onHome ? (e) => scrollToHash(e, '#top') : undefined}
            className="flex items-center gap-[11px]"
            aria-label="Helm Sports Labs — home"
          >
            <Image src="/Helm-Logo-New-Main.png" alt="" width={34} height={34} className="block h-[34px] w-[34px]" />
            <span className="text-text-primary" style={{ fontWeight: 680, fontSize: 19, letterSpacing: '-0.02em' }}>
              Helm
            </span>
          </Link>
        </div>

        {/* Warm-glass nav lens */}
        <nav
          aria-label="Primary"
          className="hidden flex-none items-center gap-0.5 rounded-full border border-[oklch(1_0_0/0.5)] px-[7px] py-[5px] backdrop-blur-xl backdrop-saturate-[1.12] transition-[background,box-shadow] duration-200 md:flex"
          style={lens}
        >
          {NAV_ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`rounded-full px-3.5 py-2 text-body-sm font-medium transition-colors hover:bg-[oklch(1_0_0/0.5)] hover:text-text-primary ${
                pathname === route.href ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {route.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-4">
          <Button
            variant="primary"
            size="sm"
            onClick={onRequestDemo}
            className="rounded-full bg-primary-700 px-5 text-[0.8125rem] font-semibold hover:bg-primary-800 shadow-[0_1px_1px_oklch(0.35_0.08_150/0.4),0_2px_6px_oklch(0.35_0.08_150/0.25)]"
          >
            Request Demo
          </Button>
          <Link
            href="/golf/login"
            className="hidden text-body-sm font-medium text-text-secondary transition-colors hover:text-text-primary sm:block"
          >
            Log in
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </Button>
        </div>
      </div>

      {/* Mobile menu sheet — stays mounted (hidden) so aria-controls always
          references a real element */}
      <div
        id="landing-mobile-menu"
        hidden={!menuOpen}
        className="absolute inset-x-4 top-full mt-2 rounded-3xl border border-[oklch(1_0_0/0.5)] p-2 backdrop-blur-xl md:hidden"
        style={LENS_SCROLLED}
      >
          <nav aria-label="Primary mobile" className="flex flex-col">
            {NAV_ROUTES.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-2xl px-4 py-3 text-body font-medium text-text-primary transition-colors hover:bg-[oklch(1_0_0/0.5)]"
              >
                {route.label}
              </Link>
            ))}
            <Link
              href="/golf/login"
              className="rounded-2xl px-4 py-3 text-body font-medium text-text-secondary transition-colors hover:bg-[oklch(1_0_0/0.5)]"
            >
              Log in
            </Link>
          </nav>
      </div>
    </header>
  );
}
