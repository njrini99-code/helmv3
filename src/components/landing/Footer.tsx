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
    <footer className="relative overflow-hidden bg-stone-950 text-white">
      <div className="absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-helm-primary-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-helm-amber-500/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 py-14 md:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-12">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <Image
                src="/Helm-Logo-New-Main.png"
                alt="Helm Sports Labs"
                width={48}
                height={48}
                className="h-10 w-10 object-contain"
              />
              <div className="text-lg font-semibold tracking-tight">Helm Sports Labs</div>
            </div>
            <p className="mt-4 text-sm text-white/50 leading-relaxed">
              Premium tools for coaches who care about performance and clarity.
            </p>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-4">Products</h4>
            <ul className="space-y-3">
              {footerLinks.products.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Login */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-4">Login</h4>
            <ul className="space-y-3">
              {footerLinks.login.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-4">Contact</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:admin@helmsportslabs.com"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  admin@helmsportslabs.com
                </a>
              </li>
              <li className="text-xs text-white/40">General inquiries</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3 text-sm text-white/40">
            <p>© {new Date().getFullYear()} Helm Sports Labs. All rights reserved.</p>
            <div className="flex items-center gap-4 text-white/60">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>

          {/* Social links */}
          <div className="flex gap-4">
            <a
              href="https://twitter.com/helmsportslabs"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.04] transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Helm Sports Labs on X"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com/company/helmsportslabs"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.04] transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Helm Sports Labs on LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>

        <p className="mt-6 text-xs text-white/35 text-center">
          Product names and logos are trademarks of their respective owners. Visuals are for illustrative purposes.
        </p>
      </div>
    </footer>
  )
}
