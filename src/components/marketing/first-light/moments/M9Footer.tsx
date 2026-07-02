/**
 * M9 · FOOTER — sage-ink field, both sports, both logins, real links.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M9 (sage & cream amendment — this band
 * stays dark ink as the page's closing beat, recolored from the old deep
 * pine). Organized by sport (GolfHelm / BaseballHelm) rather than by
 * function — every link resolves to a real route; no golf-first bias, no
 * dead "Request Demo" button (the legacy footer's failure mode this moment
 * exists to fix). Server component (no interactivity needed).
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { HelmMark } from '../brand';

export interface M9FooterProps {
  className?: string;
}

const SPORT_COLUMNS = [
  {
    sport: 'GolfHelm',
    tagline: 'Team management + the CoachHelm AI layer.',
    links: [
      { name: 'Log in', href: '/golf/login' },
      { name: 'Sign up', href: '/golf/signup' },
      { name: 'Join a team', href: '/join' },
    ],
  },
  {
    sport: 'BaseballHelm',
    tagline: 'Recruiting + team management, coach to player.',
    links: [
      { name: 'Log in', href: '/baseball/login' },
      { name: 'Sign up', href: '/baseball/signup' },
      { name: 'Join a team', href: '/join' },
    ],
  },
] as const;

const LEGAL_LINKS = [
  { name: 'Products', href: '/products' },
  { name: 'About', href: '/about' },
  { name: 'Privacy', href: '/privacy' },
  { name: 'Terms', href: '/terms' },
] as const;

export function M9Footer({ className }: M9FooterProps) {
  return (
    <footer
      className={cn('relative overflow-hidden', className)}
      style={{
        backgroundColor: 'var(--fl-sage-ink)',
        // Soft sage glow, not kelly — kelly is product-only and never
        // appears on landing/auth chrome (sage & cream amendment).
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(var(--fl-sage-rgb),0.1), transparent)',
      }}
    >
      {/* Brass-on-dark audit (Amendment 3 §C.3) — this hairline sits on the
          sage-ink band, so it runs +10% opacity (0.4 → 0.44) over the
          otherwise-standard brass-hairline recipe so the gold still reads
          against the depth of this dark band. */}
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--fl-brass-rgb), 0.44), transparent)' }}
      />
      {/* Amendment 3 §A.4 — the Helm wheel as a large quiet watermark: brass
          at low opacity, right-anchored behind the link columns, kept out
          of layout flow (absolute + aria-hidden) so it never competes with
          the real links rendered on top of it (z-10 below). `overflow-hidden`
          on the footer clips whatever bleeds past the edge at narrow
          viewports. */}
      <HelmMark
        size={280}
        className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 text-[rgba(var(--fl-brass-rgb),0.06)]"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              {/* The kelly-raster PNG never renders on landing/auth chrome
                  (Amendment 3 §A) — HelmMark is the line-art stand-in, cream
                  on this sage-ink band per its brand-component contract.
                  Decorative (no `title`): the adjacent wordmark text already
                  carries the accessible name, and this lockup isn't itself
                  an interactive element. */}
              <HelmMark size={28} className="text-[var(--fl-cream)]" />
              <span className="text-base font-semibold tracking-tight text-[var(--fl-cream)]">
                Helm Sports Labs
              </span>
            </div>
            <p className="mt-3 max-w-xs text-pretty text-body-sm leading-relaxed text-[rgba(var(--fl-cream-rgb),0.55)]">
              One Helm. Two fields. The operating system for college programs — golf and baseball.
            </p>
          </div>

          {SPORT_COLUMNS.map((column) => (
            <div key={column.sport}>
              <h4 className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-cream-rgb),0.45)]">
                {column.sport}
              </h4>
              <p className="mt-2 text-pretty text-body-sm leading-relaxed text-[rgba(var(--fl-cream-rgb),0.5)]">
                {column.tagline}
              </p>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="fl-link-underline text-body-sm text-[rgba(var(--fl-cream-rgb),0.7)] transition-colors hover:text-[var(--fl-cream)]"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(var(--fl-cream-rgb),0.1)] pt-6 text-caption text-[rgba(var(--fl-cream-rgb),0.4)] sm:flex-row">
          <p>© {new Date().getFullYear()} Helm Sports Labs. All rights reserved.</p>
          <div className="flex items-center gap-5">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="fl-link-underline transition-colors hover:text-[rgba(var(--fl-cream-rgb),0.7)]"
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
