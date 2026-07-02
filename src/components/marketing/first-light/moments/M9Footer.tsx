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
import Image from 'next/image';

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
      className={className}
      style={{
        backgroundColor: 'var(--fl-sage-ink)',
        // Soft sage glow, not kelly — kelly is product-only and never
        // appears on landing/auth chrome (sage & cream amendment).
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(var(--fl-sage-rgb),0.1), transparent)',
      }}
    >
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--fl-brass-rgb), 0.4), transparent)' }}
      />
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={40}
                height={40}
                className="h-8 w-8 object-contain"
              />
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
