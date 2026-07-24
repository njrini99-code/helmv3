'use client'

import Link from 'next/link'
import Image from 'next/image'

const footerLinks = {
  products: [
    // The redesigned /products page is GolfHelm-led; its GolfHelm masthead
    // section is id="products". There is no baseball section/anchor anymore,
    // so BaseballHelm links to the page top rather than a dead fragment.
    { name: 'BaseballHelm', href: '/products' },
    { name: 'GolfHelm', href: '/products#products' },
  ],
  login: [
    { name: 'Baseball Login', href: '/baseball/login' },
    { name: 'Golf Login', href: '/golf/login' },
  ],
  signUp: [
    { name: 'Baseball Sign Up', href: '/baseball/signup' },
    { name: 'Golf Sign Up', href: '/golf/signup' },
  ],
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden text-warm-900" style={{
      background: `
        radial-gradient(ellipse 80% 60% at 50% 60%, rgba(21, 128, 61, 0.10), transparent),
        linear-gradient(180deg, #F7F3EC 0%, #F1ECE1 100%)
      `
    }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-warm-300 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 py-10 md:py-14">
        {/* Top row: brand + columns */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-8 md:gap-12 mb-8 md:mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={44}
                height={44}
                className="h-9 w-9 object-contain"
              />
              <span className="text-lg font-semibold tracking-tight text-warm-900">Helm Sports Labs</span>
            </div>
            <p className="mt-3 text-sm text-warm-500 leading-relaxed max-w-xs">
              The coaching and recruiting intelligence layer for college athletics — rosters, stats, and the conversations that matter.
            </p>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-warm-500 mb-3">Products</h4>
            <ul className="space-y-2.5">
              {footerLinks.products.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-warm-600 hover:text-warm-900 transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Login */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-warm-500 mb-3">Login</h4>
            <ul className="space-y-2.5">
              {footerLinks.login.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-warm-600 hover:text-warm-900 transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div className="flex md:flex-col items-start gap-3">
            <a
              href="https://twitter.com/helmsportslabs"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-warm-300 text-warm-500 hover:text-warm-900 hover:border-warm-400 hover:bg-warm-100 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Helm Sports Labs on X"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com/company/helmsportslabs"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-warm-300 text-warm-500 hover:text-warm-900 hover:border-warm-400 hover:bg-warm-100 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Helm Sports Labs on LinkedIn"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-warm-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-warm-400">
          <p>© {new Date().getFullYear()} Helm Sports Labs. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="text-warm-500 hover:text-warm-900 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-warm-500 hover:text-warm-900 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
