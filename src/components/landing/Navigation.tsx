'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { MobileNav } from './MobileNav'

const navLinks = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Products', href: '/products' },
]

export function Navigation() {
  const pathname = usePathname()
  const isHomePage = pathname === '/'

  return (
    <nav className="relative z-[60] pointer-events-auto pt-1.5 pb-1 md:pt-2 md:pb-1">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-6">
        {/* Logo — scrolls away with page (relative, not fixed) */}
        <div className="flex items-center gap-2 justify-self-start md:fixed md:top-4 md:left-6 md:z-[70]">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Helm-Logo-New-Main.png"
              alt="Helm"
              width={72}
              height={72}
              className="w-[40px] h-[40px] sm:w-[44px] sm:h-[44px] md:w-[36px] md:h-[36px] object-contain"
            />
            <span className={`font-semibold text-base sm:text-lg transition-colors duration-200 ${
              isHomePage ? 'text-white' : 'text-neutral-900'
            }`}>
              Helm Sports Labs
            </span>
          </Link>
        </div>

        {/* Floating pill nav — fixed center on desktop */}
        <div className="hidden md:fixed md:top-4 md:left-1/2 md:-tranwarm-x-1/2 md:z-[70] md:grid grid-cols-3 items-center gap-1
                        backdrop-blur-xl bg-[rgba(237,232,221,0.55)] border border-white/50 rounded-full px-1.5 py-1.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="w-24 py-2 rounded-full text-sm font-medium tracking-[-0.01em] text-center text-neutral-900 hover:bg-white/40 transition-colors duration-200"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Login Button + Mobile Nav */}
        <div className="flex items-center gap-3 md:fixed md:top-4 md:right-6 md:z-[70] justify-self-end">
          <Link
            href="/golf/login"
            className="hidden md:block px-4 py-2 rounded-full text-sm font-medium tracking-[-0.01em]
                       text-neutral-900 hover:bg-white/40 border border-white/40
                       backdrop-blur-xl bg-[rgba(237,232,221,0.55)]
                       transition-colors duration-200 ease-out"
          >
            Log in
          </Link>
          <MobileNav isDarkBg={isHomePage} />
        </div>
      </div>
    </nav>
  )
}
