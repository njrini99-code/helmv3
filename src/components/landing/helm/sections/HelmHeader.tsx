'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../helm-landing.module.css';
import { fwHaptic } from '@/lib/fairway/haptics';

const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/products', label: 'Products' },
  { href: '/pricing', label: 'Pricing' },
] as const;

const navLinkStyle: React.CSSProperties = {
  fontSize: '13.5px',
  fontWeight: 520,
  padding: '8px 14px',
  borderRadius: '9999px',
};

const mobileLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '13px 14px',
  borderRadius: '12px',
  fontSize: '16px',
  fontWeight: 560,
  color: 'var(--ink)',
};

export function HelmHeader({ onRequestDemo }: { onRequestDemo: () => void }) {
  const [open, setOpen] = useState(false);

  // Escape closes the mobile sheet; lock body scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100, padding: '14px 0' }}>
      <div
        style={{
          maxWidth: '1320px',
          margin: '0 auto',
          padding: '0 clamp(20px,4vw,64px)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <a
          href="#top"
          style={{ display: 'flex', alignItems: 'center', gap: '11px', flex: 'none' }}
          aria-label="Helm Sports Labs — home"
        >
          <Image
            src="/Helm-Logo-New-Main.png"
            alt=""
            width={34}
            height={34}
            style={{ width: '34px', height: '34px', display: 'block' }}
          />
          <span style={{ fontWeight: 680, fontSize: '19px', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Helm
          </span>
        </a>

        {/* Desktop pill nav (hidden < 900px) */}
        <nav
          data-header
          aria-label="Primary"
          className={styles.desktopNav}
          style={{
            margin: '0 auto',
            alignItems: 'center',
            gap: '2px',
            padding: '5px 7px',
            borderRadius: '9999px',
            background:
              'linear-gradient(180deg,oklch(1 0 0/0.20),oklch(1 0 0/0.05)),color-mix(in srgb, var(--surface) 52%, transparent)',
            WebkitBackdropFilter: 'blur(20px) saturate(112%)',
            backdropFilter: 'blur(20px) saturate(112%)',
            border: '1px solid oklch(1 0 0/0.5)',
            boxShadow:
              'inset 0 1px 0 oklch(1 0 0/0.34),0 1px 2px oklch(.18 .01 60/.05),0 12px 30px oklch(.18 .01 60/.08)',
            transition: 'background .2s ease,box-shadow .2s ease',
          }}
        >
          {NAV_LINKS.map((s) => (
            <Link key={s.href} href={s.href} className={styles.navLink} style={navLinkStyle}>
              {s.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs (hidden < 900px) */}
        <div className={styles.desktopNav} style={{ flex: 'none', alignItems: 'center', gap: '16px' }}>
          <Link href="/golf/login" className={styles.linkInk} style={{ fontSize: '13.5px', fontWeight: 520 }}>
            Log in
          </Link>
          <button
            type="button"
            onClick={onRequestDemo}
            className={styles.btnPrimary}
            style={{ fontFamily: 'var(--sans)', fontSize: '13.5px', fontWeight: 600, padding: '11px 20px', borderRadius: '9999px' }}
          >
            Request Demo
          </button>
        </div>

        {/* Mobile hamburger (hidden ≥ 900px) */}
        <button
          type="button"
          className={styles.hamburger}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => {
            fwHaptic('selection');
            setOpen((v) => !v);
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round">
            {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown sheet */}
      {open ? (
        <>
          <div
            onClick={closeMenu}
            aria-hidden
            style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'oklch(0.15 0.01 60/0.14)' }}
          />
          <div
            className={styles.mobileSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 'clamp(16px,4vw,64px)',
              right: 'clamp(16px,4vw,64px)',
              zIndex: 110,
              marginTop: '6px',
              background: 'var(--surface)',
              borderRadius: '22px',
              border: '1px solid var(--line)',
              boxShadow: 'var(--raise)',
              padding: '12px',
            }}
          >
            {NAV_LINKS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={styles.mobileLink}
                style={mobileLinkStyle}
                onClick={() => {
                  fwHaptic('selection');
                  closeMenu();
                }}
              >
                {s.label}
              </Link>
            ))}
            <div style={{ height: '1px', background: 'var(--line)', margin: '8px 6px' }} />
            <Link
              href="/golf/login"
              className={styles.mobileLink}
              style={mobileLinkStyle}
              onClick={() => {
                fwHaptic('selection');
                closeMenu();
              }}
            >
              Log in
            </Link>
            <button
              type="button"
              className={styles.btnPrimary}
              style={{
                width: '100%',
                marginTop: '6px',
                fontFamily: 'var(--sans)',
                fontSize: '15px',
                fontWeight: 600,
                padding: '14px 20px',
                borderRadius: '14px',
              }}
              onClick={() => {
                closeMenu();
                onRequestDemo();
              }}
            >
              Request Demo
            </button>
          </div>
        </>
      ) : null}
    </header>
  );
}
