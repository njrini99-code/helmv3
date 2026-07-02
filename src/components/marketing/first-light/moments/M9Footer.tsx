/**
 * M9 · FOOTER — pine field, both sports, both logins, real links.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M9. Fixes the legacy footer's
 * golf-first-only link set and any dead CTA — every link here resolves to
 * a real route. Server component (no interactivity needed).
 */
import Link from 'next/link';
import Image from 'next/image';

export interface M9FooterProps {
  className?: string;
}

const FOOTER_LINKS = {
  products: [
    { name: 'GolfHelm', href: '/products#golfhelm' },
    { name: 'BaseballHelm', href: '/products#baseballhelm' },
  ],
  login: [
    { name: 'Golf login', href: '/golf/login' },
    { name: 'Baseball login', href: '/baseball/login' },
  ],
  signUp: [
    { name: 'Golf sign up', href: '/golf/signup' },
    { name: 'Baseball sign up', href: '/baseball/signup' },
  ],
} as const;

export function M9Footer({ className }: M9FooterProps) {
  return (
    <footer
      className={className}
      style={{
        backgroundColor: 'var(--fl-pine)',
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(22,163,74,0.08), transparent)',
      }}
    >
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--fl-brass-rgb), 0.4), transparent)' }}
      />
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={40}
                height={40}
                className="h-8 w-8 object-contain"
              />
              <span className="text-base font-semibold tracking-tight text-[var(--fl-ecru)]">
                Helm Sports Labs
              </span>
            </div>
            <p className="mt-3 max-w-xs text-body-sm leading-relaxed text-[rgba(var(--fl-ecru-rgb),0.55)]">
              One Helm. Two fields. The operating system for college programs — golf and baseball.
            </p>
          </div>

          <div>
            <h4 className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-ecru-rgb),0.45)]">
              Products
            </h4>
            <ul className="mt-3 space-y-2.5">
              {FOOTER_LINKS.products.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-body-sm text-[rgba(var(--fl-ecru-rgb),0.7)] transition-colors hover:text-[var(--fl-ecru)]"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-eyebrow font-semibold uppercase tracking-[0.2em] text-[rgba(var(--fl-ecru-rgb),0.45)]">
              Account
            </h4>
            <ul className="mt-3 space-y-2.5">
              {[...FOOTER_LINKS.login, ...FOOTER_LINKS.signUp].map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-body-sm text-[rgba(var(--fl-ecru-rgb),0.7)] transition-colors hover:text-[var(--fl-ecru)]"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(var(--fl-ecru-rgb),0.1)] pt-6 text-caption text-[rgba(var(--fl-ecru-rgb),0.4)] sm:flex-row">
          <p>© {new Date().getFullYear()} Helm Sports Labs. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-[rgba(var(--fl-ecru-rgb),0.7)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[rgba(var(--fl-ecru-rgb),0.7)]">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
