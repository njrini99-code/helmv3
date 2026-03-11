'use client'

import Link from 'next/link'
import Image from 'next/image'

const footerLinks = {
  products: [
    { name: 'BaseballHelm', href: '/products#baseballhelm' },
    { name: 'GolfHelm', href: '/products#golfhelm' },
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
        radial-gradient(ellipse 80% 60% at 50% 60%, rgba(21, 128, 61, 0.12), transparent),
        linear-gradient(180deg, #F0EBE1 0%, #E8E1D4 100%)
      `
    }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-warm-300 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 py-6">
        {/* Main row: brand + links + social */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/Helm-Logo-New-Main.png"
              alt="Helm Sports Labs"
              width={36}
              height={36}
              className="h-8 w-8 object-contain"
            />
            <span className="text-base font-semibold tracking-tight text-warm-900">Helm Sports Labs</span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-warm-600">
            {footerLinks.products.map((link) => (
              <Link key={link.name} href={link.href} className="hover:text-warm-900 transition-colors">
                {link.name}
              </Link>
            ))}
            <span className="hidden md:inline text-warm-300">|</span>
            {footerLinks.login.map((link) => (
              <Link key={link.name} href={link.href} className="hover:text-warm-900 transition-colors">
                {link.name}
              </Link>
            ))}
            <span className="hidden md:inline text-warm-300">|</span>
            <a href="mailto:admin@helmsportslabs.com" className="hover:text-warm-900 transition-colors">
              Contact
            </a>
          </nav>

          {/* Social */}
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com/helmsportslabs"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-300 text-warm-500 hover:text-warm-900 hover:border-warm-400 hover:bg-warm-100 transition-colors"
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm-300 text-warm-500 hover:text-warm-900 hover:border-warm-400 hover:bg-warm-100 transition-colors"
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

        {/* Bottom line */}
        <div className="mt-4 pt-4 border-t border-warm-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-warm-400">
          <p>© {new Date().getFullYear()} Helm Sports Labs. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-warm-500 hover:text-warm-900 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-warm-500 hover:text-warm-900 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
